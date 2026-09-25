// Build and refresh the installed tunnel origin without touching tunnel secrets.
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const install = join(homedir(), 'Library/Application Support/PandemicPrep');
const build = spawnSync('npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
await mkdir(install, { recursive: true });
const pending = join(install, `site-pending-${process.pid}`);
await cp(join(project, 'dist'), pending, { recursive: true });
// Retain the previous version's hashed assets so open browser tabs can finish.
try { await cp(join(install, 'site/assets'), join(pending, 'assets'), { recursive: true, force: false }); } catch (e) { if(e.code !== 'ENOENT') throw e; }
await rm(join(install, 'site-previous'), { recursive: true, force: true });
try { await rename(join(install, 'site'), join(install, 'site-previous')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
await rename(pending, join(install, 'site'));
console.log('Updated https://pandemic-prep.tjebbe-boersma.com');
