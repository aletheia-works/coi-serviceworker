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
      try {
        sessionStorage.removeItem(RELOADED);
      } catch {}
      return;
    }
    if (!window.isSecureContext || !navigator.serviceWorker) {
      console.warn(
        'coi-serviceworker: a service worker cannot run here, so the page stays without cross-origin isolation.',
      );
      return;
    }
    const served = navigator.serviceWorker.controller !== null;
    try {
      await navigator.serviceWorker.register(document.currentScript.src);
    } catch (error) {
      console.warn(
        'coi-serviceworker: the service worker could not be registered, so the page stays without cross-origin isolation.',
        error,
      );
      return;
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
      console.warn(
        'coi-serviceworker: session storage is unavailable, so the page is not reloaded; it is cross-origin isolated from its next load.',
      );
      return;
    }
    if (reloaded) {
      console.warn(
        'coi-serviceworker: the page is still not cross-origin isolated after a reload through the service worker.',
      );
      return;
    }
    window.location.reload();
  })();
}
