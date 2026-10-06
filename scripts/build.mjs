import { cp, mkdir, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const file of ['index.html','style.css','src']) await cp(path.join(root,file),path.join(destination,file),{ recursive:true });
await writeFile(path.join(destination,'.nojekyll'), '');
async function size(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes:true })) bytes += entry.isDirectory() ? await size(path.join(directory,entry.name)) : (await stat(path.join(directory,entry.name))).size;
  return bytes;
}
console.log(`Static build: dist/ (${await size(destination)} bytes), no network dependencies.`);
