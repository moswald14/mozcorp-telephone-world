import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dating', 'site-assets');
await mkdir(output, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && /^[a-zA-Z0-9][\w.-]*\.(?:html|css|m?js|txt|zip)$/.test(entry.name) &&
      !entry.name.endsWith('.test.mjs')) {
    await copyFile(join(root, entry.name), join(output, entry.name));
  }
}
