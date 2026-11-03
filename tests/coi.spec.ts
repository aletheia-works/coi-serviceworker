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

test('without session storage the page is not reloaded and a warning says why', async ({
  page,
}) => {
  const warnings: string[] = [];
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/nostorage/');
  await expect.poll(() => warnings.join('\n')).toContain('session storage');
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => ({
      isolated: window.crossOriginIsolated,
      loads: Number(sessionStorage.getItem('loads')),
    })),
  ).toEqual({ isolated: false, loads: 1 });
  await page.reload();
  await page.waitForFunction(() => window.crossOriginIsolated);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
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

test('a hard reload of an isolated page isolates it again', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'only CDP can bypass the cache');
  await settle(page, '/plain/');
  await page.waitForTimeout(2000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.reload', { ignoreCache: true });
  await expect
    .poll(() =>
      page
        .evaluate(() => ({
          isolated: window.crossOriginIsolated,
          controlled: navigator.serviceWorker.controller !== null,
        }))
        .catch(() => null),
    )
    .toEqual({ isolated: true, controlled: true });
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

test('a worker that cannot be registered leaves a warning', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/failing/');
  await expect
    .poll(() => warnings.join('\n'))
    .toContain('could not be registered');
  expect(
    await page.evaluate(() => Number(sessionStorage.getItem('loads'))),
  ).toBe(1);
});

test('a worker that cannot isolate the page stops even if the clock is off', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/skewed/');
  await page.waitForTimeout(3000);
  expect(
    await page.evaluate(() => ({
      isolated: window.crossOriginIsolated,
      loads: Number(sessionStorage.getItem('loads')),
    })),
  ).toEqual({ isolated: false, loads: 2 });
  expect(warnings.join('\n')).toContain('still not cross-origin isolated');
});

test('a redirected script keeps the URL it was redirected to', async ({
  page,
}) => {
  expect((await settle(page, '/plain/')).isolated).toBe(true);
  expect(
    await page.evaluate(
      async (script) => ({
        url: new URL((await fetch(script)).url).pathname,
        value: await import(script).then(
          (module) => module.value,
          () => 'failed',
        ),
      }),
      '/latest/mod.js',
    ),
  ).toEqual({ url: '/v1/mod.js', value: 'imported' });
});

test('a redirect to another origin keeps the URL it was redirected to', async ({
  page,
}) => {
  expect((await settle(page, '/plain/')).isolated).toBe(true);
  expect(
    await page.evaluate(
      async () => (await fetch('/away/pixel.svg', { mode: 'cors' })).url,
    ),
  ).toBe(`http://127.0.0.1:${new URL(page.url()).port}/v1/pixel.svg`);
});

test('a script loaded as a module says it must be a classic script', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/module/');
  await expect.poll(() => warnings.join('\n')).toContain('classic script');
});
