import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { ModuleRegistry, createWorld, restoreWorld } from '../src/engine/index.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { timeModules } from '../src/modules/time.ts';
import { locationModule } from '../src/modules/location.ts';
import { gatheringRulesModule } from '../src/modules/gathering-rules.ts';
import { gatheringModule } from '../src/modules/gathering.ts';

function registry(gathering = gatheringModule, providers: ModuleDefinition[] = []) {
  return new ModuleRegistry([...capacityModules, inventoryModule, ...timeModules, locationModule, gatheringRulesModule, gathering, ...providers]);
}
function definition(item = 'wood', exit = 'town'): WorldDefinition {
  return { id: 'unicode-gathering', title: 'Unicode 采集', version: '1', modules: [
    { id: 'capacity', module: 'capacity.slots', config: {} },
    { id: 'inventory', module: 'inventory.basic', config: { items: { [item]: { name: '木材', weight: 1, volume: 1, length: 1 } }, containers: { bag: { limits: { slots: 2 }, items: {} } } } },
    { id: 'clock', module: 'time.continuous', config: {} },
    { id: 'location', module: 'location.nodes', config: { start: 'forest', nodes: { forest: { name: '森林', description: '', exits: [exit] }, [exit]: { name: '出口', description: '', exits: ['forest'] } } } },
    { id: 'rules', module: 'gathering.rules', config: { rules: { wood: { name: '伐木', item, quantity: 3, cooldownSeconds: 30 } } } },
    { id: 'gathering', module: 'gathering.cooldown', config: { container: 'bag', sites: { wood: { location: 'forest', rule: 'wood' } } } }
  ] };
}
function instance(d: WorldDefinition, id: string) { const value = d.modules.find(m => m.id === id); assert.ok(value); return value; }
type World = ReturnType<typeof createWorld>;
function act(w: World, target: string, action: string, input: JsonObject = {}) {
  const result = w.dispatch({ target, action, input }); assert.equal(result.ok, true, JSON.stringify(result)); return result;
}
function sites(w: World) { return (w.query('gathering', 'sites') as JsonObject).sites as JsonObject[]; }

for (const length of [65, 128]) {
  test(`frontier Unicode gathering accepts ${length} codepoint item IDs from real rules and inventory`, () => {
    const item = '🌲'.repeat(length), w = createWorld(registry(), definition(item));
    assert.equal(sites(w)[0]!.item, item);
    act(w, 'gathering', 'gather', { site: 'wood' });
    assert.deepEqual(w.query('inventory', 'count', { container: 'bag', item }), { quantity: 3 });
  });
  test(`frontier Unicode gathering accepts ${length} codepoint exits and current IDs from real locations`, () => {
    const location = '🏠'.repeat(length), d = definition('wood', location);
    instance(d, 'location').config.start = location;
    instance(d, 'gathering').config.sites = { wood: { location, rule: 'wood' } };
    const w = createWorld(registry(), d);
    // Both descriptions consume the long exit ID before gathering consumes the long current ID.
    instance(d, 'gathering').config.sites = { wood: { location: 'forest', rule: 'wood' } };
    createWorld(registry(), d);
    act(w, 'gathering', 'gather', { site: 'wood' });
    assert.equal(sites(w)[0]!.available, false);
  });
}

test('frontier Unicode gathering rejects external 129 codepoint rule items and location exits', () => {
  const tooLong = '🌲'.repeat(129);
  for (const kind of ['item', 'exit']) {
    const provider: ModuleDefinition = kind === 'item'
      ? { ...gatheringRulesModule, manifest: { ...gatheringRulesModule.manifest, id: 'external.rules' }, queries: { get: { execute: () => ({ id: 'wood', name: '伐木', item: tooLong, quantity: 3, cooldownSeconds: 30 }) } } }
      : { ...locationModule, manifest: { ...locationModule.manifest, id: 'external.location' }, queries: { ...locationModule.queries, describe: { execute: () => ({ id: 'forest', name: '森林', description: '', exits: [tooLong] }) } } };
    const d = definition(); instance(d, kind === 'item' ? 'rules' : 'location').module = provider.manifest.id;
    assert.throws(() => createWorld(registry(gatheringModule, [provider]), d), (error: any) => error.code === (kind === 'item' ? 'INVALID_GATHER_RULE' : 'INVALID_LOCATION'));
  }
});

test('frontier Unicode gathering rejects external 129 codepoint current IDs before returning sites', () => {
  const provider: ModuleDefinition = { ...locationModule, manifest: { ...locationModule.manifest, id: 'external.location' }, queries: { ...locationModule.queries, current: { execute: () => ({ id: '🏠'.repeat(129) }) } } };
  const d = definition(); instance(d, 'location').module = provider.manifest.id;
  const w = createWorld(registry(gatheringModule, [provider]), d), before = w.snapshot();
  assert.throws(() => sites(w), (error: any) => error.code === 'INVALID_LOCATION');
  assert.deepEqual(w.snapshot(), before);
  const result = w.dispatch({ target: 'gathering', action: 'gather', input: { site: 'wood' } });
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'INVALID_LOCATION');
  assert.deepEqual(w.snapshot(), before);
});

test('frontier Unicode gathering patch restores genuine 1.0.0 cooldown without resetting time or inventory', () => {
  const legacy = { ...gatheringModule, manifest: { ...gatheringModule.manifest, version: '1.0.0' } };
  const w = createWorld(registry(legacy), definition()); act(w, 'gathering', 'gather', { site: 'wood' }); act(w, 'clock', 'advance', { seconds: 10 });
  const saved = w.snapshot(), restored = restoreWorld(registry(), saved);
  assert.equal(restored.snapshot().modules.gathering!.definitionVersion, '1.0.1');
  assert.deepEqual(restored.read('gathering'), saved.modules.gathering!.state);
  assert.equal(sites(restored)[0]!.remainingSeconds, 20);
  const before = restored.snapshot(), blocked = restored.dispatch({ target: 'gathering', action: 'gather', input: { site: 'wood' } });
  assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.error.code, 'GATHER_COOLDOWN');
  assert.deepEqual(restored.snapshot(), before);
  act(restored, 'clock', 'advance', { seconds: 20 }); act(restored, 'gathering', 'gather', { site: 'wood' });
  assert.deepEqual(restored.query('inventory', 'count', { container: 'bag', item: 'wood' }), { quantity: 6 });
});

test('frontier Unicode gathering patch rejects unsupported migration origins and malformed legacy cooldowns', () => {
  const legacy = { ...gatheringModule, manifest: { ...gatheringModule.manifest, version: '1.0.0' } };
  const w = createWorld(registry(legacy), definition()); act(w, 'gathering', 'gather', { site: 'wood' });
  for (const patch of [{ definitionId: 'other.gathering' }, { definitionVersion: '0.9.0' }, { definitionVersion: '1.0.2' }, { stateVersion: 2 }]) {
    const saved = w.snapshot(); Object.assign(saved.modules.gathering!, patch);
    assert.throws(() => restoreWorld(registry(), saved));
  }
  for (const state of [{ cooldowns: { wood: { gatheredAt: 0, readyAt: 0 } } }, { cooldowns: { wood: { gatheredAt: 0, readyAt: '30' } } }, { cooldowns: { unknown: { gatheredAt: 0, readyAt: 30 } } }]) {
    const saved = w.snapshot(); saved.modules.gathering!.state = state;
    assert.throws(() => restoreWorld(registry(), saved));
  }
});
