# coi-serviceworker

Cross-origin isolation for static hosts that cannot set response headers,
such as GitHub Pages. A service worker adds the headers
(`Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Embedder-Policy: require-corp`) to every response it serves, so
the page can use `SharedArrayBuffer` and other APIs that need
`window.crossOriginIsolated`.

## Usage

Copy `coi-serviceworker.js` next to your page and load it before any script
that needs isolation:

```html
<script src="coi-serviceworker.js"></script>
```

Load it as a classic script from its file. With `type="module"`, or with the
code inline, the script cannot find its own URL, so it logs a warning and
leaves the page as it is.

A service worker controls only its own folder and the folders below it, so
put the file at or above every page that needs it, and at or above every
`Worker` script those pages start. The worker whose scope holds a worker
script's URL serves that script, not the one controlling the page. A worker
script outside the scope gets no `Cross-Origin-Embedder-Policy`, and the
isolated page's browser blocks it while the page itself still reports
`crossOriginIsolated`. The test `a worker script outside the scope is
blocked` shows this.

From npm:

```sh
npm install @aletheia-works/coi-serviceworker
cp node_modules/@aletheia-works/coi-serviceworker/coi-serviceworker.js public/
```

The same file is on JSR as
[`@aletheia-works/coi-serviceworker`](https://jsr.io/@aletheia-works/coi-serviceworker).

The page must be served over HTTPS or from `localhost`. Every cross-origin
resource it loads must allow being embedded (CORS or
`Cross-Origin-Resource-Policy`), as `require-corp` demands.

### Waiting for isolation

The script sets `window.coiServiceWorker` as soon as it runs, so a later
script can wait for it instead of guessing with a timeout:

```js
const state = await window.coiServiceWorker.settled;
if (state.status === 'isolated') startTheWork();
else if (state.status === 'failed')
  console.error('not isolated:', state.reason);
```

`settled` resolves once the page is isolated (`{ status: 'isolated' }`), has
failed (`{ status: 'failed', reason }`) or has removed the worker
(`{ status: 'unregistered' }`, see below). It never resolves on a page that
is about to reload, so nothing heavy starts there. `coiServiceWorker.status`
is the current status: `pending`, `reloading`, `isolated`, `failed` or
`unregistered`. Each change is also sent as a `coi-serviceworker` event on
`window`, with the state as its `detail`. On an isolated page, and when the
script fails before registering, the event is sent while the script itself
runs, so a listener added by a later script misses it. Other events come
later, but may still come before a slow script listens, so read `status`
or await `settled` rather than rely on the event. The JSR package exports the types
`CoiServiceWorker`, `CoiState`, `CoiSettled` and `CoiFailure` for a
`declare global` of your own.

| `reason`              | Cause                                                      |
| --------------------- | ---------------------------------------------------------- |
| `module-script`       | The script was loaded with `type="module"`, or inline      |
| `no-service-worker`   | Not a secure context, or no service worker support         |
| `registration-failed` | `navigator.serviceWorker.register` rejected                |
| `outside-scope`       | The page is outside the worker's scope                     |
| `storage-unavailable` | Session storage threw, so the page was not reloaded        |
| `still-not-isolated`  | The page came through the worker and is still not isolated |
| `unexpected-error`    | Something else threw; the warning shows the error          |

### Limiting the pages it isolates

Once registered, the worker isolates every page in its scope, including
pages that never load the script, and their cross-origin resources must
then allow being embedded. To isolate only some pages, name them with
`include`, as a path prefix, in the script's URL. It may be repeated:

```html
<script src="/coi-serviceworker.js?include=/app/&include=/demo.html"></script>
```

The worker then adds the headers only to pages under those paths, and to
the requests those pages make, including the `Worker` scripts they start.
Other pages in the scope load as if the worker were not there. A page that
loads the script must itself be under a prefix: otherwise it is reloaded
once and ends `failed` with `still-not-isolated`. Every page that loads the
script should use the same URL, since registering another URL replaces the
worker for the whole scope. A page that the old worker did not isolate is
reloaded once through the new one.

### Removing the worker

The worker stays registered after a site stops loading the script, and it
keeps isolating the pages in its scope. Load the script with `unregister`
on a page in that scope to remove it:

```html
<script src="/coi-serviceworker.js?unregister"></script>
```

The script unregisters every registration whose worker is this script, in
whatever scope it was registered, reloads the page if that worker served
it, and sets the status to `unregistered`. WebKit can still serve the first
reload through the removed worker, and then the page is reloaded once more.

### In an iframe

A page in an iframe is cross-origin isolated only when the page that embeds
it is isolated too.

- If the parent page on the same origin loads the script, the parent and the
  frame are both isolated.
- If only the frame loads it, the frame is not isolated and logs a warning.
  If the parent page is inside the worker's scope, both are isolated once
  the parent is reloaded. If it is outside, the frame is never isolated and
  warns on every load.
- A page on another origin cannot embed a page this package isolates. If the
  parent sends no isolation headers, neither page is isolated. If it does,
  the browser does not load the frame.

## What happens on a visit

1. The page is already cross-origin isolated (the server sends the headers,
   or the worker served it): the status is `isolated`, and nothing else
   happens.
2. Otherwise the script registers itself as a service worker and waits until
   the worker is **active**, then reloads the page once. The reloaded page
   comes through the worker and is isolated. If the script was loaded as a
   module, or the registration fails, it logs a warning and does not reload.
3. If the reloaded page is still not isolated, the script logs a warning and
   does not reload again. A later hard reload, which skips the worker, is
   reloaded through the worker again, unless it starts within a second of
   the previous reload.
4. If session storage is unavailable, the script cannot mark the reload, so
   it registers the worker, logs a warning and does not reload. The page is
   isolated from its next load.

Later visits are served by the worker from the start and need no reload.

## Differences from gzuidhof/coi-serviceworker

This package is an independent implementation of the idea in
[gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker),
whose last release, 0.1.7, is from 2023.

- 0.1.7 reloads as soon as the worker is found installing, before it is
  active. When the install takes a moment, the reloaded page is loaded
  without the worker, is not isolated, and is never reloaded again. This
  package reloads only after `navigator.serviceWorker.ready`. The test
  `a worker that is slow to install still isolates the page` fails against
  0.1.7 and passes here.
- `Cross-Origin-Embedder-Policy` is always `require-corp`; there is no
  `credentialless` mode.
- There is no `window.coi` configuration. The script's URL takes `include`
  and `unregister` instead, and `window.coiServiceWorker` only reports the
  status.

## Development

Tools come from `mise.toml` (`mise install`).

```sh
bun install
mise run check
mise run test
```

`mise run test` serves test pages with Bun and runs the Playwright tests in
Chromium, Firefox and WebKit.

## Releases

Conventional Commits on `main` drive Release Please. Merging its release PR
creates the `v<version>` tag, and `publish.yml` publishes the package to npm
and JSR with OIDC trusted publishing and provenance.

## License

Apache-2.0
