import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createGeminiApi } from './gemini-api.mjs';

const production = process.argv.includes('--production');
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : Number(process.env.PORT || 5000);
// Production cookies are always Secure. Plain HTTP loopback is only for local tests.
const api = createGeminiApi({ secureCookies: !process.argv.includes('--local-test-http') || production });
let vite = null;
const root = path.resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  void api.handler(req, res, () => {
    if (vite) return vite.middlewares(req, res);
    void (async () => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://internal').pathname);
        const requested = path.resolve(root, `.${pathname}`);
        if (!requested.startsWith(`${root}/`) && requested !== root) { res.writeHead(403).end(); return; }
        let file = requested;
        let data;
        try { data = await readFile(file); }
        catch {
          if (path.extname(pathname)) { res.writeHead(404).end(); return; }
          file = path.join(root, 'index.html');
          data = await readFile(file);
        }
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600');
        res.end(data);
      } catch { res.writeHead(500).end('Unable to serve application.'); }
    })();
  });
});
if (!production) {
  vite = await (await import('vite')).createServer({
    // Share this HTTP server for HMR instead of opening Vite's default 24678
    // port, which collides when preview and browser-test servers run together.
    server: { middlewareMode: true, hmr: { server } }, appType: 'spa',
  });
}
server.listen(port, '0.0.0.0', () => console.log(`Application listening on port ${port}`));
const shutdown = () => {
  api.close();
  server.close();
  void vite?.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
