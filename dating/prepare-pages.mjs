import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] ?? join(root, 'dating', '.pages-output'));
const world = 'https://moswald14.github.io/mozcorp-telephone-world/';
const [html, service, worker] = await Promise.all([
  readFile(join(root, 'dating.html'), 'utf8'),
  readFile(join(root, 'dating', 'service.mjs'), 'utf8'),
  readFile(join(root, 'dating', 'worker.mjs'), 'utf8'),
]);

// The Pages upload contains only the dating frontend and its bundled worker.
// The creative-world links return to the original origin where its browser saves live.
const page = html.replace('class="wordmark" href="./"', `class="wordmark" href="${world}"`)
  .replaceAll('href="./#mozcorp"', `href="${world}#mozcorp"`)
  .replace('href="./studio.html#telephone"', `href="${world}studio.html#telephone"`)
  .replace('href="./dating.html"', 'href="/dating"');
const importLine = "import { createDatingService } from './service.mjs';";
if (!worker.startsWith(importLine)) throw new Error('Unexpected dating worker entry point.');
const entry = `${service}\n${worker.slice(importLine.length)}`;
const headers = '/*\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n';
const routes = { version: 1, include: ['/dating-api/*'], exclude: [] };

await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(join(output, 'index.html'), page),
  writeFile(join(output, 'dating.html'), page),
  writeFile(join(output, '_worker.js'), entry),
  writeFile(join(output, '_headers'), headers),
  writeFile(join(output, '_routes.json'), JSON.stringify(routes) + '\n'),
  ...['dating.css', 'dating-app.mjs', 'public-world.css'].map(name =>
    copyFile(join(root, name), join(output, name))),
]);
