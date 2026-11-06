import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { timeModules } from '../src/modules/time.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';

const { locationModule } = await import('../src/modules/location.ts').catch(error => assert.fail(`探索模块尚未实现：${error.message}`));
const { gatheringRulesModule } = await import('../src/modules/gathering-rules.ts');
const { gatheringModule } = await import('../src/modules/gathering.ts');
const { readSimulationTime } = await import('../src/modules/simulation-time.ts');
const clockProbe: ModuleDefinition = {
  manifest: { id: 'test.clock', title: '外部时钟', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { time: '1.0.0' } },
  initialState: () => ({ value: { elapsedSeconds: 0 } }),
  queries: { now: { execute: ctx => ctx.state<{value: JsonValue}>().value } },
  commands: { set: { execute(ctx, input) { ctx.write({ value: input.value! }); return null; } } }
};
const ruleProbe: ModuleDefinition = {
  manifest: { id: 'test.rules', title: '外部采集规则', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'gather-rule': '1.0.0' } },
  initialState: () => ({ value: { id: 'wood', name: '外部木材', item: 'wood', quantity: 3, cooldownSeconds: 30 } }),
  queries: { get: { execute(ctx, input) { assert.deepEqual(input, { rule: 'wood' }); return ctx.state<{value: JsonValue}>().value; } } },
  commands: { set: { execute(ctx, input) { ctx.write({ value: input.value! }); return null; } } }
};
const locationProbe: ModuleDefinition = {
  manifest: { id: 'test.location', title: '外部地点', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { location: '1.0.0' } },
  initialState: config => ({ description: config.description! }),
  queries: {
    current: { execute: () => ({ id: 'forest' }) },
    describe: { execute(ctx, input) { assert.deepEqual(input, { location: 'forest' }); return Object.hasOwn(ctx.config, 'override') ? ctx.config.override! : ctx.state<{ description: JsonValue }>().description; } }
  },
  commands: { set: { execute(ctx, input) { ctx.write({ description: input.description! }); return null; } } }
};
const inventoryProbe: ModuleDefinition = {
  manifest: { id: 'test.inventory', title: '外部库存', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { inventory: '1.0.0' } },
  initialState: () => ({ list: { items: [], limits: {} }, count: { quantity: 0 } }),
  queries: {
    list: { execute: ctx => ctx.state<{ list: JsonValue }>().list },
    count: { execute: ctx => ctx.state<{ count: JsonValue }>().count }
  },
  commands: { set: { execute(ctx, input) { ctx.write({ ...ctx.state<JsonObject>(), ...input }); return null; } } }
};
const timeConsumer: ModuleDefinition = {
  manifest: { id: 'test.time-consumer', title: '时间适配测试', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { time: { version: '^1.0.0' } } },
  initialState: () => ({}), queries: { read: { execute: (ctx, input) => readSimulationTime(ctx, input.notBefore as number | undefined) } }
};
const registry = () => new ModuleRegistry([...capacityModules, inventoryModule, ...timeModules, locationModule, gatheringRulesModule, gatheringModule, clockProbe, ruleProbe, locationProbe, inventoryProbe, timeConsumer]);
function definition(): WorldDefinition { return { id: 'exploration', title: '探索', version: '1.0.0', modules: [
  { id: 'capacity', module: 'capacity.slots', config: {} },
  { id: 'inventory', module: 'inventory.basic', config: { items: { wood: { name: '木材', weight: 1, volume: 1, length: 1 }, stone: { name: '石头', weight: 1, volume: 1, length: 1 } }, containers: { player: { limits: { slots: 2 }, items: {} } } } },
  { id: 'clock', module: 'time.continuous', config: {} },
  { id: 'location', module: 'location.nodes', config: { start: 'town', nodes: { town: { name: '镇口', description: '道路起点', exits: ['forest'] }, forest: { name: '林地', description: '生长着树木', exits: ['town'] }, quarry: { name: '采石场', description: '远处岩石', exits: [] } } } },
  { id: 'rules', module: 'gathering.rules', config: { rules: { wood: { name: '伐木', item: 'wood', quantity: 3, cooldownSeconds: 30 } } } },
  { id: 'gathering', module: 'gathering.cooldown', config: { container: 'player', sites: { forestWood: { location: 'forest', rule: 'wood' } } } }
] }; }
function instance(d: WorldDefinition, id: string) { const value = d.modules.find(m => m.id === id); assert.ok(value); return value; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const result = w.dispatch({ target, action, input }); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw new Error('失败'); return result; }
function failAtomic(w: World, target: string, action: string, input: JsonObject, code?: string) { const before = w.snapshot(); const result = w.dispatch({ target, action, input }); assert.equal(result.ok, false, JSON.stringify(result)); if (!result.ok && code) assert.equal(result.error.code, code); assert.deepEqual(w.snapshot(), before); }
const sites = (w: World) => (w.query('gathering', 'sites') as JsonObject).sites as JsonObject[];
const count = (w: World) => w.query('inventory', 'count', { container: 'player', item: 'wood' });

test('location works alone and rejects an unlinked node without consuming time', () => {
  const d = definition(); d.modules = [instance(d, 'location')]; const w = createWorld(registry(), d);
  assert.deepEqual(w.query('location', 'current'), { id: 'town', name: '镇口', description: '道路起点', exits: [{ id: 'forest', name: '林地' }], visited: ['town'] });
  failAtomic(w, 'location', 'move', { to: 'quarry' });
  const result = ok(w, 'location', 'move', { to: 'forest' }); assert.equal(result.events[0]?.type, 'location.moved');
  assert.deepEqual(result.value, { id: 'forest', name: '林地', description: '生长着树木', exits: [{ id: 'town', name: '镇口' }], visited: ['town', 'forest'] });
  ok(w, 'location', 'move', { to: 'town' }); ok(w, 'location', 'move', { to: 'forest' });
  assert.deepEqual((w.query('location', 'current') as JsonObject).visited, ['town', 'forest']);
  assert.deepEqual(w.query('location', 'describe', { location: 'forest' }), { id: 'forest', name: '林地', description: '生长着树木', exits: ['town'] });
});
test('location rejects broken graph and restored visited/current references', () => {
  for (const edit of [(d: WorldDefinition) => { (instance(d, 'location').config.nodes as any).town.exits = ['missing']; }, (d: WorldDefinition) => { instance(d, 'location').config.start = 'missing'; }, (d: WorldDefinition) => { (instance(d, 'location').config.nodes as any).town.exits = ['forest', 'forest']; }]) assert.throws(() => setup(edit));
  const w = setup(); for (const state of [{ current: 'missing', visited: ['town'] }, { current: 'town', visited: ['town', 'missing'] }, { current: 'town', visited: ['town', 'town'] }, { current: 'forest', visited: ['town'] }]) { const save = w.snapshot(); save.modules.location!.state = state; assert.throws(() => restoreWorld(registry(), save)); }
  ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'location', 'move', { to: 'town' }); const d = w.definition; delete (instance(d, 'location').config.nodes as any).forest; (instance(d, 'location').config.nodes as any).town.exits = []; assert.throws(() => reconfigureWorld(registry(), w, d));
});
test('rule get/list and site query obey exact shapes without state changes', () => {
  const w = setup(), before = w.snapshot();
  assert.deepEqual(w.query('rules', 'get', { rule: 'wood' }), { id: 'wood', name: '伐木', item: 'wood', quantity: 3, cooldownSeconds: 30 });
  assert.deepEqual(w.query('rules', 'list'), { rules: [{ id: 'wood', name: '伐木', item: 'wood', quantity: 3, cooldownSeconds: 30 }] });
  assert.deepEqual(sites(w), [{ id: 'forestWood', location: 'forest', name: '伐木', item: 'wood', quantity: 3, cooldownSeconds: 30, readyAt: 0, remainingSeconds: 0, available: false }]); assert.deepEqual(w.snapshot(), before);
});
test('gather adds three wood atomically and renews exactly at second thirty', () => {
  const w = setup(); ok(w, 'location', 'move', { to: 'forest' });
  assert.deepEqual(ok(w, 'gathering', 'gather', { site: 'forestWood' }).value, { site: 'forestWood', item: 'wood', quantity: 3, readyAt: 30 }); assert.deepEqual(count(w), { quantity: 3 });
  failAtomic(w, 'gathering', 'gather', { site: 'forestWood' }); ok(w, 'clock', 'advance', { seconds: 29 });
  assert.deepEqual(sites(w)[0], { id: 'forestWood', location: 'forest', name: '伐木', item: 'wood', quantity: 3, cooldownSeconds: 30, readyAt: 30, remainingSeconds: 1, available: false });
  ok(w, 'clock', 'advance', { seconds: 1 }); assert.equal(sites(w)[0]!.available, true); const result = ok(w, 'gathering', 'gather', { site: 'forestWood' }); assert.equal(result.events.some(e => e.type === 'gathering.gathered'), true); assert.deepEqual(count(w), { quantity: 6 }); assert.equal((result.value as JsonObject).readyAt, 60);
});
test('wrong location unknown site and full destination preserve complete snapshots', () => {
  const w = setup(); failAtomic(w, 'gathering', 'gather', { site: 'forestWood' }); failAtomic(w, 'gathering', 'gather', { site: 'missing' }); failAtomic(w, 'gathering', 'gather', { site: 'toString' });
  const full = setup(d => { (instance(d, 'inventory').config.containers as any).player = { limits: { slots: 1 }, items: { stone: 1 } }; }); ok(full, 'location', 'move', { to: 'forest' }); failAtomic(full, 'gathering', 'gather', { site: 'forestWood' }, 'CAPACITY_EXCEEDED');
});
test('remaining cooldown survives restore and active readyAt survives rule edit', () => {
  const w = setup(); ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'gathering', 'gather', { site: 'forestWood' }); ok(w, 'clock', 'advance', { seconds: 10 });
  const restored = restoreWorld(registry(), w.snapshot()); assert.equal(sites(restored)[0]!.remainingSeconds, 20);
  const d = restored.definition; (instance(d, 'rules').config.rules as any).wood.cooldownSeconds = 1; const edited = reconfigureWorld(registry(), restored, d);
  assert.equal(sites(edited)[0]!.readyAt, 30); failAtomic(edited, 'gathering', 'gather', { site: 'forestWood' }); ok(edited, 'clock', 'advance', { seconds: 20 }); assert.equal((ok(edited, 'gathering', 'gather', { site: 'forestWood' }).value as JsonObject).readyAt, 31);
});
test('assembly validates every site location rule item and container reference', () => {
  for (const edit of [(d: WorldDefinition) => { (instance(d, 'gathering').config.sites as any).forestWood.location = 'missing'; }, (d: WorldDefinition) => { (instance(d, 'gathering').config.sites as any).forestWood.rule = 'missing'; }, (d: WorldDefinition) => { (instance(d, 'rules').config.rules as any).wood.item = 'missing'; }, (d: WorldDefinition) => { instance(d, 'gathering').config.container = 'missing'; }]) assert.throws(() => setup(edit));
});
test('nonpositive fractional or unsafe gathering policy values reject assembly', () => {
  for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup(d => { (instance(d, 'rules').config.rules as any).wood.quantity = quantity; }));
  for (const cooldownSeconds of [0, -1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup(d => { (instance(d, 'rules').config.rules as any).wood.cooldownSeconds = cooldownSeconds; }));
});
test('external compatible rule provider is checked and can gather', () => {
  const w = setup(d => { instance(d, 'rules').module = 'test.rules'; instance(d, 'rules').config = {}; }); ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'gathering', 'gather', { site: 'forestWood' }); assert.deepEqual(count(w), { quantity: 3 });
  for (const value of [null, [], {}, { id: 'wood', name: '', item: 'wood', quantity: 3, cooldownSeconds: 30 }, { id: 'other', name: '规则', item: 'wood', quantity: 3, cooldownSeconds: 30 }, { id: 'wood', name: '规则', item: 'wood', quantity: 0, cooldownSeconds: 30 }, { id: 'wood', name: '规则', item: 'wood', quantity: 3, cooldownSeconds: -1 }, { id: 'wood', name: '规则', item: 'missing', quantity: 3, cooldownSeconds: 30 }]) failAtomic(w, 'rules', 'set', { value });
});
test('only the bound alternate clock controls cooldown availability', () => {
  const w = setup(d => { d.modules.push({ id: 'alternate', module: 'time.step', config: { secondsPerStep: 10 } }); instance(d, 'gathering').bindings = { time: 'alternate' }; }); ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'gathering', 'gather', { site: 'forestWood' }); ok(w, 'clock', 'advance', { seconds: 100 }); assert.equal(sites(w)[0]!.remainingSeconds, 30); ok(w, 'alternate', 'advance', { steps: 3 }); assert.equal(sites(w)[0]!.available, true);
});
test('invalid clock outputs use INVALID_CLOCK and backward clock uses CLOCK_BACKWARD', () => {
  const w = setup(d => { instance(d, 'clock').module = 'test.clock'; }); ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'clock', 'set', { value: { elapsedSeconds: 10 } }); ok(w, 'gathering', 'gather', { site: 'forestWood' });
  for (const value of [null, [], {}, { elapsedSeconds: '10' }, { elapsedSeconds: -1 }, { elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }]) failAtomic(w, 'clock', 'set', { value }, 'INVALID_CLOCK');
  failAtomic(w, 'clock', 'set', { value: { elapsedSeconds: 9 } }, 'CLOCK_BACKWARD');
});
test('time adapter accepts fractional seconds and rejects malformed clocks without cooldown state', () => {
  const d: WorldDefinition = { id: 'time-adapter', title: '时间', version: '1', modules: [{ id: 'clock', module: 'test.clock', config: {} }, { id: 'consumer', module: 'test.time-consumer', config: {} }] }; const w = createWorld(registry(), d);
  ok(w, 'clock', 'set', { value: { elapsedSeconds: 0.5 } }); assert.equal(w.query('consumer', 'read'), 0.5); assert.throws(() => w.query('consumer', 'read', { notBefore: 1 }), error => (error as any).code === 'CLOCK_BACKWARD');
  for (const value of [null, [], {}, { elapsedSeconds: -1 }, { elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }]) { ok(w, 'clock', 'set', { value }); assert.throws(() => w.query('consumer', 'read'), error => (error as any).code === 'INVALID_CLOCK'); }
});
test('cooldown duration overflow or precision loss rejects before any item is committed', () => {
  for (const [now, duration] of [[Number.MAX_SAFE_INTEGER, 30], [2 ** 52, 0.1]]) {
    const w = setup(d => { instance(d, 'clock').module = 'test.clock'; (instance(d, 'rules').config.rules as any).wood.cooldownSeconds = duration; }); ok(w, 'location', 'move', { to: 'forest' }); ok(w, 'clock', 'set', { value: { elapsedSeconds: now! } }); failAtomic(w, 'gathering', 'gather', { site: 'forestWood' }); assert.deepEqual(count(w), { quantity: 0 });
  }
});
test('restored cooldown references and time ordering must remain valid', () => {
  const w = setup(); for (const cooldowns of [{ missing: { gatheredAt: 0, readyAt: 30 } }, { forestWood: { gatheredAt: 0, readyAt: 0 } }, { forestWood: { gatheredAt: 5, readyAt: 30 } }, { forestWood: { gatheredAt: 30, readyAt: 20 } }]) { const save = w.snapshot(); save.modules.gathering!.state = { cooldowns }; assert.throws(() => restoreWorld(registry(), save)); }
});
test('legal own-property IDs work for locations rules sites and inventory items', () => {
  const w = setup(d => {
    const location = instance(d, 'location').config as any; location.nodes.valueOf = { name: '特殊林地', description: '', exits: ['town'] }; location.nodes.town.exits = ['valueOf'];
    const inventory = instance(d, 'inventory').config as any; inventory.items.hasOwnProperty = { name: '特殊木材', weight: 1, volume: 1, length: 1 };
    (instance(d, 'rules').config.rules as any).toString = { name: '特殊采集', item: 'hasOwnProperty', quantity: 2, cooldownSeconds: 1 };
    instance(d, 'gathering').config.sites = { valueOf: { location: 'valueOf', rule: 'toString' } };
  }); ok(w, 'location', 'move', { to: 'valueOf' }); ok(w, 'gathering', 'gather', { site: 'valueOf' }); assert.deepEqual(w.query('inventory', 'count', { container: 'player', item: 'hasOwnProperty' }), { quantity: 2 });
  assert.throws(() => w.query('location', 'describe', { location: 'toString' })); assert.throws(() => w.query('rules', 'get', { rule: 'valueOf' }));
});


test('external location descriptions must have matching identity and valid required fields at assembly', () => {
  for (const description of [null, [], {}, { id: 'town', name: '镇口', description: '', exits: [] }, { id: 'forest', name: '', description: '', exits: [] }, { id: 'forest', name: '林地', description: 1, exits: [] }, { id: 'forest', name: '林地', description: '', exits: [null] }, { id: 'forest', name: '林地', description: '', exits: [''] }, { id: 'forest', name: '林地', description: '', exits: ['town', 'town'] }]) {
    assert.throws(() => setup(d => { const location = instance(d, 'location'); location.module = 'test.location'; location.config = { description }; }), error => (error as any).code === 'INVALID_LOCATION');
  }
});
test('external location replacement and malformed transactions preserve the usable world snapshot', () => {
  const w = setup(d => { const location = instance(d, 'location'); location.module = 'test.location'; location.config = { description: { id: 'forest', name: '林地', description: '', exits: ['town'] } }; });
  assert.deepEqual(ok(w, 'gathering', 'gather', { site: 'forestWood' }).value, { site: 'forestWood', item: 'wood', quantity: 3, readyAt: 30 });
  for (const description of [null, { id: 'town', name: '镇口', description: '', exits: [] }]) {
    failAtomic(w, 'location', 'set', { description }, 'INVALID_LOCATION');
    const before = w.snapshot(), d = w.definition;
    instance(d, 'location').config.override = description;
    assert.throws(() => reconfigureWorld(registry(), w, d)); assert.deepEqual(w.snapshot(), before);
  }
  assert.deepEqual(count(w), { quantity: 3 });
});
test('external inventory reference queries must return valid list and count envelopes atomically', () => {
  const w = setup(d => { const inventory = instance(d, 'inventory'); inventory.module = 'test.inventory'; inventory.config = {}; });
  for (const list of [null, [], {}, { items: null, limits: {} }, { items: [], limits: null }, { items: [], limits: [] }]) failAtomic(w, 'inventory', 'set', { list }, 'INVALID_INVENTORY');
  for (const count of [null, [], {}, { quantity: -1 }, { quantity: 0.5 }, { quantity: Number.MAX_SAFE_INTEGER + 1 }]) failAtomic(w, 'inventory', 'set', { count }, 'INVALID_INVENTORY');
});
