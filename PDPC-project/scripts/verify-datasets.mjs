import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = join(root, 'dataset-manifest.json');
const excluded = new Set(['.git', 'node_modules', '.venv', '__pycache__', '.claude', 'dist', 'dist-tablet', 'artifacts', 'build-pdpc-ggd']);
const dataFile = /\.(csv|csv\.gz|xlsx|xls|parquet|geojson|gpkg|shp|dbf|shx|prj|tif|tiff)$/i;
async function files(dir, relative = '') {
  const result = [];
  for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(dir, path));
    else if (entry.isFile() && (dataFile.test(entry.name) || (entry.name.endsWith('.json') && /(^|\/)(data|datasources|output)(\/|$)/.test(path)))) result.push(path);
  }
  return result.sort();
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
const source = process.argv[2] ? resolve(process.argv[2]) : null;
if (source === resolve(root)) throw new Error('Source and destination must differ.');
const entries = source ? (await files(source)).map(path => ({ path })) : JSON.parse(await readFile(manifestPath, 'utf8')).files;
let bytes = 0;
const verified = [];
for (const entry of entries) {
  const destination = join(root, entry.path);
  const expected = source ? await hash(join(source, entry.path)) : entry.sha256;
  const actual = await hash(destination);
  if (expected !== actual) throw new Error(`Checksum mismatch: ${entry.path}`);
  const size = (await stat(destination)).size;
  bytes += size;
  verified.push({ path: entry.path, bytes: size, sha256: actual });
}
if (source) await writeFile(manifestPath, JSON.stringify({ sourceProject: basename(source), verifiedAt: new Date().toISOString(), algorithm: 'SHA-256', files: verified }, null, 2) + '\n');
console.log(JSON.stringify({ verifiedFiles: verified.length, bytes, matches: true }, null, 2));
