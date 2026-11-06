import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Content only: reports, documentation, Git metadata and mtimes are not inputs.
export function fingerprint(scope, root = process.cwd()) {
  if (!['preflight', 'built-smoke'].includes(scope)) throw new Error(`Unknown verification scope: ${scope}`);
  const files = new Set();
  function add(name) {
    const path = join(root, name);
    let stat;
    try { stat = lstatSync(path); }
    catch { throw new Error(`Missing required verification input: ${name}`); }
    if (stat.isSymbolicLink()) throw new Error(`Unsupported verification input symlink: ${name}`);
    if (stat.isFile()) { files.add(name.replaceAll('\\', '/')); return; }
    if (!stat.isDirectory()) throw new Error(`Invalid verification input: ${name}`);
    const children = readdirSync(path).filter(child => child !== '__pycache__');
    if (!children.length) throw new Error(`Missing required verification files: ${name}`);
    for (const child of children) add(join(name, child));
  }
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'run-demo.cmd', 'play-farm.cmd', 'worlds', 'examples', 'scripts']) add(name);
  for (const name of ['examples/custom-world.json', 'examples/custom-module.mjs']) add(name);
  if (scope === 'preflight') {
    for (const name of ['src', 'tests', '.github']) add(name);
  } else {
    add('dist/cli/index.js');
    add('dist');
  }
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  for (const [name, info] of Object.entries(lock.packages)) {
    if (name.startsWith('node_modules/') && !info.dev) add(name);
  }
  const entries = [...files].sort().map(name => [name, sha256(readFileSync(join(root, name)))]);
  return { version: 1, scope, sha256: sha256(JSON.stringify(entries)) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(fingerprint(process.argv[2], resolve(process.argv[3] ?? '.'))));
}
