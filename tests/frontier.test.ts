import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { WorldRuntime } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import type { JsonObject, ModuleInstance, WorldDefinition } from '../src/contracts.ts';

async function setup(name = 'frontier') {
  assert.ok((await worldNames()).includes(name), `${name} must be a discoverable world`);
  const pack = await loadWorldPackage(name);
  return { pack, world: createWorld(builtinRegistry(), pack.world) };
}
function act(world: WorldRuntime, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function count(world: WorldRuntime, item: string) {
  return (world.query('inventory', 'count', { container: 'player', item }) as JsonObject).quantity;
}
function instance(definition: WorldDefinition, id: string): ModuleInstance {
  const result = definition.modules.find(entry => entry.id === id);
  assert.ok(result); return result;
}
function startPlanks(world: WorldRuntime) {
  act(world, 'location', 'move', { to: 'forest' });
  act(world, 'gathering', 'gather', { site: 'wood' });
  act(world, 'location', 'move', { to: 'town' });
  act(world, 'workshop', 'start', { recipe: 'plank' });
}

test('step and continuous frontier demos complete the same resource chain through the generic host', async () => {
  for (const name of ['frontier', 'frontier-continuous']) {
    const { pack, world } = await setup(name);
    for (const command of pack.demo) {
      const result = world.dispatch(command);
      assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    }
    assert.deepEqual(world.query('market', 'balance'), { coins: 18 });
    assert.deepEqual(['wood', 'stone', 'reed', 'plank', 'toolkit'].map(item => count(world, item)), [1, 1, 2, 0, 0]);
    assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 50 });
    assert.deepEqual(world.query('workshop', 'status'), { job: null, ready: false, remainingSeconds: 0 });
    const saved = world.snapshot();
    const text = readTextView(world);
    assert.ok(text.lines.some(line => line.includes('18')));
    assert.ok(text.lines.some(line => line.includes('木板')));
    assert.ok(text.lines.some(line => line.includes('工具包')));
    assert.deepEqual(world.snapshot(), saved, 'rendering must not mutate the world');
    assert.deepEqual(restoreWorld(builtinRegistry(), JSON.parse(JSON.stringify(saved))).snapshot(), saved);
  }
});

test('frontier gathering renews after the production cycle without resetting the world', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  act(world, 'location', 'move', { to: 'forest' });
  act(world, 'gathering', 'gather', { site: 'wood' });
  assert.equal(count(world, 'wood'), 4);
  const saved = world.snapshot();
  assert.equal(world.dispatch({ target: 'gathering', action: 'gather', input: { site: 'wood' } }).ok, false);
  assert.deepEqual(world.snapshot(), saved);
  const sites = (world.query('gathering', 'sites') as JsonObject).sites as JsonObject[];
  assert.equal(sites.find(site => site.id === 'wood')!.remainingSeconds, 30);
});

test('a saved frontier job and cooldown survive replacing step time with continuous time', async () => {
  const { world } = await setup();
  startPlanks(world);
  act(world, 'clock', 'advance', { steps: 1 });
  const saved = world.snapshot();
  const restored = restoreWorld(builtinRegistry(), JSON.parse(JSON.stringify(saved)));
  const next = (await loadWorldPackage('frontier-continuous')).world;
  const switched = reconfigureWorld(builtinRegistry(), restored, next);
  assert.deepEqual((switched.query('workshop', 'status') as JsonObject).remainingSeconds, 10);
  act(switched, 'clock', 'advance', { seconds: 10 });
  act(switched, 'workshop', 'collect');
  assert.equal(count(switched, 'wood'), 1);
  assert.equal(count(switched, 'plank'), 2);
  assert.deepEqual(restored.snapshot(), saved);
  const sites = (switched.query('gathering', 'sites') as JsonObject).sites as JsonObject[];
  assert.equal(sites.find(site => site.id === 'wood')!.remainingSeconds, 10);
});

test('removing a visited location cannot silently discard the frontier history or paid job', async () => {
  const { world } = await setup();
  startPlanks(world);
  const before = world.snapshot();
  const next = structuredClone(world.definition);
  const nodes = instance(next, 'location').config.nodes as JsonObject;
  delete nodes.forest;
  for (const node of Object.values(nodes) as JsonObject[]) node.exits = (node.exits as string[]).filter(id => id !== 'forest');
  const sites = instance(next, 'gathering').config.sites as JsonObject;
  delete sites.wood;
  assert.throws(() => reconfigureWorld(builtinRegistry(), world, next));
  assert.deepEqual(world.snapshot(), before);
});

test('frontier game rules continue with no text view module installed', async () => {
  const { pack } = await setup();
  pack.world.modules = pack.world.modules.filter(module => module.id !== 'view');
  delete pack.world.entryView;
  const world = createWorld(builtinRegistry(), pack.world);
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  assert.deepEqual(world.query('market', 'balance'), { coins: 18 });
});

test('frontier text view rejects malformed external market numbers without changing state', async () => {
  const { pack } = await setup();
  const registry = builtinRegistry();
  registry.register({
    manifest: { id: 'external.invalid-market', title: '错误市场', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { market: '1.0.0' } },
    initialState: () => ({}), queries: { balance: { execute: () => ({ coins: -1 }) } },
  });
  instance(pack.world, 'market').module = 'external.invalid-market';
  instance(pack.world, 'market').config = {};
  delete instance(pack.world, 'market').bindings;
  const world = createWorld(registry, pack.world);
  const before = world.snapshot();
  assert.throws(() => readTextView(world), /金币|安全数值/);
  assert.deepEqual(world.snapshot(), before);
});
