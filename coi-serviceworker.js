/*! @aletheia-works/coi-serviceworker | Apache-2.0 | https://github.com/aletheia-works/coi-serviceworker */
// @ts-self-types="./coi-serviceworker.d.ts"
const RELOADED = 'coi-serviceworker-reloaded';

if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) =>
    event.waitUntil(self.clients.claim()),
  );

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin')
      return;
    event.respondWith(isolate(request));
  });

  async function isolate(request) {
    const response = await fetch(request);
    if (response.status === 0) return response;
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
  (async () => {
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(RELOADED);
      return;
    }
    if (!window.isSecureContext || !navigator.serviceWorker) {
      console.warn(
        'coi-serviceworker: a service worker cannot run here, so the page stays without cross-origin isolation.',
      );
      return;
    }
    await navigator.serviceWorker.register(document.currentScript.src);
    // A reload before the worker is active loads the page without the worker,
    // and that page is never reloaded again.
    await navigator.serviceWorker.ready;
    if (sessionStorage.getItem(RELOADED)) {
      sessionStorage.removeItem(RELOADED);
      console.warn(
        'coi-serviceworker: the page is still not cross-origin isolated after a reload through the service worker.',
      );
      return;
    }
    sessionStorage.setItem(RELOADED, '1');
    window.location.reload();
  })();
}
