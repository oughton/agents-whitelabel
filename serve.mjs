// Local dev server for the web dashboard. No dependencies: `node serve.mjs`, then open http://localhost:8000/app.html
// Serves the static site and proxies POST /oauth/token to the authorization server's token endpoint,
// because that endpoint does not send CORS headers, so a browser cannot read its response directly.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const TOKEN_URL = process.env.TOKEN_URL || 'https://mcp.truelayer.com/token';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try {
      const upstream = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: Buffer.concat(chunks),
      });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_error', error_description: String(e) }));
    }
    return;
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || /(^|[/\\])\./.test(path.slice(1))) { res.writeHead(404); return res.end('Not found'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, 'localhost', () => console.log(`Serving on http://localhost:${PORT}/  (dashboard: http://localhost:${PORT}/app.html)`));
