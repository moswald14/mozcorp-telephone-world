import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatingService } from './service.mjs';
import { openDatingDatabase } from './sqlite.mjs';

const webRoot = fileURLToPath(new URL('../', import.meta.url));
const types = new Map([
  ['html', 'text/html; charset=utf-8'], ['css', 'text/css; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'], ['mjs', 'text/javascript; charset=utf-8'],
  ['jpg', 'image/jpeg'],
  ['zip', 'application/zip'], ['txt', 'text/plain; charset=utf-8'], ['md', 'text/plain; charset=utf-8'],
]);

export async function makeDatingServer({ database, publicOrigin, trustedIpHeader, signups = true }) {
  const dating = createDatingService(database, { signups });
  const assets = new Set((await readdir(webRoot, { withFileTypes: true })).filter(entry =>
    entry.isFile() && /^[a-zA-Z0-9][\w.-]*$/.test(entry.name) && !entry.name.endsWith('.test.mjs') &&
    types.has(entry.name.split('.').at(-1))).map(entry => entry.name));

  return createServer(async (incoming, outgoing) => {
    try {
      const origin = publicOrigin ?? `http://127.0.0.1:${incoming.socket.localPort}`;
      // Prefix the path so an absolute proxy target can never replace the configured origin.
      const path = incoming.url?.startsWith('/') ? incoming.url.replace(/^\/+/, '/') : '/';
      const url = new URL(origin + path);
      if (url.pathname.startsWith('/dating-api/')) {
        const method = incoming.method;
        const body = ['GET', 'HEAD'].includes(method) ? undefined : Readable.toWeb(incoming);
        const request = new Request(url, { method, headers: incoming.headers, body, duplex: 'half' });
        const proxyIp = trustedIpHeader && incoming.headers[trustedIpHeader];
        const response = await dating(request, { clientAddress: typeof proxyIp === 'string'
          ? proxyIp : incoming.socket.remoteAddress });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
        else outgoing.end();
        return;
      }
      const filename = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (!assets.has(filename) || !['GET', 'HEAD'].includes(incoming.method)) {
        outgoing.writeHead(404).end('Page not found');
        return;
      }
      const source = join(webRoot, filename);
      const { size } = await stat(source);
      outgoing.writeHead(200, { 'Content-Type': types.get(filename.split('.').at(-1)), 'Content-Length': size,
        'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      if (incoming.method === 'HEAD') outgoing.end();
      else createReadStream(source).on('error', () => outgoing.destroy()).pipe(outgoing);
    } catch {
      if (outgoing.headersSent) outgoing.destroy();
      else outgoing.writeHead(500).end('The site could not load.');
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const origin = process.env.TELEPHONE_PUBLIC_ORIGIN ? new URL(process.env.TELEPHONE_PUBLIC_ORIGIN) : null;
  if (origin && origin.protocol !== 'https:') throw new Error('Use an HTTPS origin for public hosting.');
  const state = resolve(process.env.TELEPHONE_DATA_DIR || '.dating-data');
  await mkdir(state, { recursive: true });
  const database = openDatingDatabase(join(state, 'dating.sqlite'));
  const server = await makeDatingServer({ database, publicOrigin: origin?.origin,
    signups: process.env.TELEPHONE_SIGNUPS !== 'closed',
    trustedIpHeader: origin ? process.env.TELEPHONE_PROXY_IP_HEADER?.toLowerCase() : undefined });
  server.listen(Number(process.env.TELEPHONE_PORT || 8787), '127.0.0.1', () => {
    console.log(`Telephone World is listening on http://127.0.0.1:${server.address().port}/`);
  });
  server.on('close', () => database.close());
}
