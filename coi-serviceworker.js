/*! @aletheia-works/coi-serviceworker | Apache-2.0 | https://github.com/aletheia-works/coi-serviceworker */
// @ts-self-types="./coi-serviceworker.d.ts"
const RELOADED = 'coi-serviceworker-reloaded';

if (typeof window === 'undefined') {
  const worker = /** @type {ServiceWorkerGlobalScope} */ (
    /** @type {unknown} */ (self)
  );
  worker.addEventListener('install', () => worker.skipWaiting());
  worker.addEventListener('activate', (event) =>
    event.waitUntil(worker.clients.claim()),
  );

  worker.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin')
      return;
    event.respondWith(isolate(request));
  });

  /** @param {Request} request */
  async function isolate(request) {
    const response = await fetch(request);
    if (response.status === 0) return response;
    // A new Response loses the URL a redirect led to, so relative imports
    // would resolve against the URL that was asked for.
    if (response.redirected && request.method === 'GET')
      return Response.redirect(response.url, 302);
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
} else {
  const script = document.currentScript;
  /** @type {(state: import('./coi-serviceworker.d.ts').CoiSettled) => void} */
  let settle = () => {};
  /** @type {import('./coi-serviceworker.d.ts').CoiServiceWorker} */
  const coi = {
    status: 'pending',
    settled: new Promise((resolve) => {
      settle = resolve;
    }),
  };
  window.coiServiceWorker = coi;
  /**
   * @param {import('./coi-serviceworker.d.ts').CoiState} state
   * @param {string} [warning]
   * @param {unknown[]} details
   */
  const report = (state, warning, ...details) => {
    if (warning) console.warn(`coi-serviceworker: ${warning}`, ...details);
    Object.assign(coi, state);
    window.dispatchEvent(
      new CustomEvent('coi-serviceworker', { detail: state }),
    );
    if (state.status !== 'reloading') settle(state);
  };
  (async () => {
    if (window.crossOriginIsolated) {
      try {
        sessionStorage.removeItem(RELOADED);
      } catch {}
      return report({ status: 'isolated' });
    }
    if (!(script instanceof HTMLScriptElement))
      return report(
        { status: 'failed', reason: 'module-script' },
        'load coi-serviceworker.js as a classic script, without type="module", so it can register itself as the service worker.',
      );
    if (!window.isSecureContext || !navigator.serviceWorker)
      return report(
        { status: 'failed', reason: 'no-service-worker' },
        'a service worker cannot run here, so the page stays without cross-origin isolation.',
      );
    const served = navigator.serviceWorker.controller !== null;
    try {
      await navigator.serviceWorker.register(script.src);
    } catch (error) {
      return report(
        { status: 'failed', reason: 'registration-failed' },
        'the service worker could not be registered, so the page stays without cross-origin isolation.',
        error,
      );
    }
    // A reload before the worker is active loads the page without the worker,
    // and that page is never reloaded again.
    await navigator.serviceWorker.ready;
    let reloaded;
    try {
      // A hard reload skips the worker and brings back the session storage the
      // page had before it was isolated, so a page the worker did not serve
      // counts only a mark set just before this load.
      reloaded =
        served ||
        performance.timeOrigin - Number(sessionStorage.getItem(RELOADED)) <
          1000;
      if (reloaded) sessionStorage.removeItem(RELOADED);
      else sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      // Without a mark that survives the reload, a reload could repeat forever.
      return report(
        { status: 'failed', reason: 'storage-unavailable' },
        'session storage is unavailable, so the page is not reloaded; it is cross-origin isolated from its next load.',
      );
    }
    if (reloaded)
      return report(
        { status: 'failed', reason: 'still-not-isolated' },
        'the page is still not cross-origin isolated after a reload through the service worker.',
      );
    report({ status: 'reloading' });
    window.location.reload();
  })();
}
