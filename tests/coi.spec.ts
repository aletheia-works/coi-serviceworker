import { expect, type Page, test } from '@playwright/test';

async function settle(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(
    () =>
      window.crossOriginIsolated ||
      (navigator.serviceWorker?.controller !== null &&
        sessionStorage.getItem('coi-serviceworker-reloaded') === null &&
        Number(sessionStorage.getItem('loads')) >= 2),
  );
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    isolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
    loads: Number(sessionStorage.getItem('loads')),
    controlled: navigator.serviceWorker?.controller !== null,
  }));
}

test('the first visit reloads once and ends cross-origin isolated', async ({
  page,
}) => {
  expect(await settle(page, '/plain/')).toEqual({
    isolated: true,
    sharedArrayBuffer: true,
    loads: 2,
    controlled: true,
  });
});

test('a worker that is slow to install still isolates the page', async ({
  page,
}) => {
  const result = await settle(page, '/slow/');
  expect(result.isolated).toBe(true);
  expect(result.loads).toBe(2);
});

test('a later visit is isolated without a reload', async ({ page }) => {
  await settle(page, '/plain/');
  await page.evaluate(() => sessionStorage.setItem('loads', '0'));
  await page.goto('/plain/');
  await page.waitForFunction(() => window.crossOriginIsolated);
  expect(
    await page.evaluate(() => Number(sessionStorage.getItem('loads'))),
  ).toBe(1);
});

test('a worker script outside the scope is blocked', async ({ page }) => {
  expect((await settle(page, '/plain/')).isolated).toBe(true);
  expect(
    await page.evaluate(() => {
      const start = (url: string) =>
        new Promise((resolve) => {
          const worker = new Worker(url);
          worker.onmessage = (event) => resolve(event.data);
          worker.onerror = () => resolve('blocked');
          setTimeout(() => resolve('timed out'), 5000);
        });
      return Promise.all([start('/plain/worker.js'), start('/worker.js')]);
    }),
  ).toEqual(['started', 'blocked']);
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
});

test('a page the server already isolates registers no worker', async ({
  page,
}) => {
  await page.goto('/headers/');
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(async () => ({
      isolated: window.crossOriginIsolated,
      loads: Number(sessionStorage.getItem('loads')),
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
    })),
  ).toEqual({ isolated: true, loads: 1, registrations: 0 });
});

test('a worker that cannot isolate the page reloads it only once', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/broken/');
  await page.waitForFunction(
    () =>
      Number(sessionStorage.getItem('loads')) >= 2 &&
      sessionStorage.getItem('coi-serviceworker-reloaded') === null,
  );
  await page.waitForTimeout(1500);
  expect(
    await page.evaluate(() => ({
      isolated: window.crossOriginIsolated,
      loads: Number(sessionStorage.getItem('loads')),
    })),
  ).toEqual({ isolated: false, loads: 2 });
  expect(warnings.join('\n')).toContain('still not cross-origin isolated');
});
