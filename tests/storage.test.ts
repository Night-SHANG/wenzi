import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonFileStorage, MemoryStorage } from '../src/adapters/storage.ts';
import type { WorldSnapshot } from '../src/contracts.ts';

const empty: WorldSnapshot = {format:1,definition:{id:'empty',title:'空世界',version:'1.0.0',modules:[]},revision:0,eventSequence:0,modules:{},receipts:[]};

test('file storage round trip writes complete JSON and preserves old file on serialization failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'world-store-'));
  try {
    const file = join(dir, 'save.json');
    const store = new JsonFileStorage();
    await store.save(file, empty);
    assert.deepEqual(await store.load(file), empty);
    const corrupt = structuredClone(empty) as unknown as Record<string,unknown>;
    corrupt.cycle = corrupt;
    await assert.rejects(store.save(file, corrupt as unknown as WorldSnapshot));
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), empty);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('memory storage uses detached snapshots', async () => {
  const store = new MemoryStorage();
  const source = structuredClone(empty);
  await store.save('slot', source);
  source.definition.title = 'mutated';
  assert.equal((await store.load('slot') as WorldSnapshot).definition.title, '空世界');
  await assert.rejects(store.load('missing'));
});
