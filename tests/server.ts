import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = readFileSync(
  join(import.meta.dir, '..', 'coi-serviceworker.js'),
  'utf-8',
);

const VARIANTS: Record<string, string> = {
  plain: '',
  module: '',
  slow: `if (typeof window === 'undefined')
  self.addEventListener('install', (event) =>
    event.waitUntil(new Promise((resolve) => setTimeout(resolve, 1500))),
  );
`,
  broken: `if (typeof window === 'undefined') {
  const set = Headers.prototype.set;
  Headers.prototype.set = function (name, value) {
    if (name.toLowerCase() === 'cross-origin-opener-policy') return;
    return set.call(this, name, value);
  };
}
`,
  nosw: `if (typeof window !== 'undefined')
  Object.defineProperty(Navigator.prototype, 'serviceWorker', {
    get: () => undefined,
  });
`,
  nostorage: `if (typeof window !== 'undefined')
  for (const name of ['getItem', 'setItem', 'removeItem']) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function (key, ...rest) {
      if (key === 'coi-serviceworker-reloaded')
        throw new DOMException('storage is blocked', 'SecurityError');
      return original.call(this, key, ...rest);
    };
  }
`,
  headers: '',
  failing: `if (typeof window === 'undefined') throw new Error('the worker fails');
`,
};

VARIANTS.skewed = `${VARIANTS.broken}if (typeof window !== 'undefined') Date.now = () => 0;
`;

const ISOLATED = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
};

const PAGE = `<!doctype html>
<meta charset="utf-8">
<script>
  sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') ?? 0) + 1));
</script>
<script src="coi-serviceworker.js"></script>
<title>coi-serviceworker test</title>
`;

const WORKER = `postMessage('started');
`;

const MODULES: Record<string, string> = {
  '/v1/mod.js': "export { value } from './dep.js';",
  '/v1/dep.js': "export const value = 'imported';",
};

const PIXEL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

export function serve(port: number) {
  return Bun.serve({
    port,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname.endsWith('/worker.js'))
        return new Response(WORKER, {
          headers: { 'content-type': 'text/javascript' },
        });
      if (pathname === '/latest/mod.js')
        return new Response(null, {
          status: 302,
          headers: { location: '/v1/mod.js' },
        });
      if (pathname === '/away/pixel.svg')
        return new Response(null, {
          status: 302,
          headers: { location: `http://127.0.0.1:${port}/v1/pixel.svg` },
        });
      if (pathname === '/v1/pixel.svg')
        return new Response(PIXEL, {
          headers: {
            'content-type': 'image/svg+xml',
            'access-control-allow-origin': '*',
          },
        });
      if (MODULES[pathname] !== undefined)
        return new Response(MODULES[pathname], {
          headers: { 'content-type': 'text/javascript' },
        });
      const [, variant, file] = pathname.split('/');
      const prefix = variant === undefined ? undefined : VARIANTS[variant];
      if (prefix === undefined)
        return new Response('not found', { status: 404 });
      const extra = variant === 'headers' ? ISOLATED : {};
      if (file === '' || file === 'index.html')
        return new Response(
          variant === 'module'
            ? PAGE.replace('<script src', '<script type="module" src')
            : PAGE,
          {
            headers: { 'content-type': 'text/html; charset=utf-8', ...extra },
          },
        );
      if (file === 'coi-serviceworker.js')
        return new Response(prefix + SCRIPT, {
          headers: { 'content-type': 'text/javascript', ...extra },
        });
      return new Response('not found', { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = serve(Number(process.env.PORT ?? 4173));
  console.log(`listening on ${server.url}`);
}
