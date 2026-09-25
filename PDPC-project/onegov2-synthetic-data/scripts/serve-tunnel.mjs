// Local production-build origin for the dedicated Cloudflare tunnel.
// Never serve the checkout: only the installed public build directory.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 5187);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid origin port');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end(); return; }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(s => s.startsWith('.'))) { res.writeHead(404); res.end(); return; }
  let file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(404); res.end(); return; }
  try {
    let info;
    try { info = await stat(file); }
    catch (error) {
      if (error.code !== 'ENOENT' || extname(pathname) || !req.headers.accept?.includes('text/html')) throw error;
      file = resolve(root, 'index.html'); info = await stat(file);
    }
    if (!info.isFile() || !(await realpath(file)).startsWith((await realpath(root)) + sep)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.method === 'HEAD') { res.end(); return; }
    await pipeline(createReadStream(file), res);
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end();
  }
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.listen(port, '127.0.0.1', () => console.log(`Pandemic Prep origin listening on 127.0.0.1:${port}`));
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => { server.close(); setTimeout(() => process.exit(0), 3000).unref(); });
