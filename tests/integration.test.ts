import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, restoreWorld, reconfigureWorld } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import type { JsonObject } from '../src/contracts.ts';

test('every shipped world assembles, runs, renders and restores through the same host', async () => {
  const registry = builtinRegistry();
  for (const name of await worldNames()) {
    const pack = await loadWorldPackage(name);
    const runtime = createWorld(registry, pack.world);
    for (const command of pack.demo) {
      const result = runtime.dispatch(command);
      assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    }
    const snapshot = runtime.snapshot();
    const restored = restoreWorld(registry, JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(restored.snapshot(), snapshot, name);
    assert.deepEqual(readTextView(restored), readTextView(runtime), name);
  }
});

test('an in-progress world can replace capacity and clock without losing crops or inventory', async () => {
  const registry = builtinRegistry();
  const pack = await loadWorldPackage('farm');
  const original = createWorld(registry, pack.world);
  assert.equal(original.dispatch({target:'crops',action:'plant',input:{plot:'p1',crop:'turnip'}}).ok, true);
  assert.equal(original.dispatch({target:'clock',action:'advance',input:{steps:1}}).ok, true);
  const checkpoint = original.snapshot();
  const nextDefinition = (await loadWorldPackage('farm-continuous')).world;
  nextDefinition.modules.find(instance=>instance.id==='capacity')!.module='capacity.physical';
  const changed = reconfigureWorld(registry, original, nextDefinition);
  assert.deepEqual(original.snapshot(), checkpoint);
  assert.deepEqual(changed.read('inventory'), original.read('inventory'));
  assert.equal(changed.dispatch({target:'clock',action:'advance',input:{seconds:86400}}).ok,true);
  assert.equal(changed.dispatch({target:'crops',action:'harvest',input:{plot:'p1'}}).ok,true);
  assert.deepEqual(changed.query('inventory','count',{container:'player',item:'turnip'}),{quantity:3});
  const beforeFailedSwap=changed.snapshot();
  const invalid=structuredClone(nextDefinition);
  const containers=invalid.modules.find(instance=>instance.id==='inventory')!.config.containers as JsonObject;
  ((containers.player as JsonObject).limits as JsonObject).maxWeight=1;
  assert.throws(()=>reconfigureWorld(registry,changed,invalid));
  assert.deepEqual(changed.snapshot(),beforeFailedSwap);
});
