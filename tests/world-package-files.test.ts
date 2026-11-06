import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeWorldPackage } from '../src/adapters/world-package-files.ts';
import { loadWorldPackage } from '../src/worlds.ts';
import type { WorldPackage } from '../src/authoring/contracts.ts';
const pack: WorldPackage = { format: 1, world: { id: 'empty', title: 'Empty', version: '1.0.0', modules: [] }, demo: [] };

test('writer creates parents, round trips paths with spaces and defaults to no clobber', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'world-package-'));
  try {
    const parent = join(dir, 'with spaces'); const path = join(parent, 'world file.json');
    await writeWorldPackage(path, pack);
    assert.deepEqual(await loadWorldPackage(path), pack);
    const bytes = await readFile(path, 'utf8');
    await assert.rejects(writeWorldPackage(path, { ...pack, world: { ...pack.world, title: 'Changed' } }), { code: 'EEXIST' });
    assert.equal(await readFile(path, 'utf8'), bytes);
    assert.deepEqual(await readdir(parent), ['world file.json']);
    const loaded = await loadWorldPackage(path); loaded.world.title = 'Changed';
    await writeWorldPackage(path, loaded, { overwrite: true });
    assert.equal((await loadWorldPackage(path)).world.title, 'Changed');
    await assert.rejects(writeWorldPackage(path, { ...pack, demo: [{ target: '', action: '' }] }, { overwrite: true }));
    assert.equal((await loadWorldPackage(path)).world.title, 'Changed');
    assert.deepEqual(await readdir(parent), ['world file.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent no-clobber publication has one winner and cleans temporary files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'world-package-'));
  try {
    const path = join(dir, 'race.json');
    const results = await Promise.allSettled([writeWorldPackage(path, pack), writeWorldPackage(path, { ...pack, world: { ...pack.world, title: 'Other' } })]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.ok(['Empty', 'Other'].includes((await loadWorldPackage(path)).world.title));
    assert.deepEqual(await readdir(dir), ['race.json']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed overwrite publication preserves existing destination and removes staged file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'world-package-'));
  try {
    const path = join(dir, 'existing'); await mkdir(path);
    await assert.rejects(writeWorldPackage(path, pack, { overwrite: true }));
    assert.deepEqual(await readdir(path), []);
    assert.deepEqual(await readdir(dir), ['existing']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
