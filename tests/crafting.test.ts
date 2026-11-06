import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { timeModules } from '../src/modules/time.ts';
import { recipesModule } from '../src/modules/recipes.ts';
import { craftingModule } from '../src/modules/crafting.ts';
import { locationModule } from '../src/modules/location.ts';

const recipe = () => ({ name: '木板', inputs: { wood: 2 }, outputs: { plank: 2 }, durationSeconds: 20 });
const externalRecipes: ModuleDefinition = {
  manifest: { id: 'test.recipes', title: '外部配方', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { recipes: '1.0.0' } },
  initialState: () => ({}), queries: {
    list: { execute: ctx => ctx.config.list! }, get: { execute: ctx => ctx.config.get! }
  }
};
const location: ModuleDefinition = {
  manifest: { id: 'test.location', title: '外部地点', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { location: '1.0.0' } },
  initialState: () => ({ current: 'town' }),
  commands: { move: { execute(ctx, input) { ctx.write({ current: input.to! }); return null; } } },
  queries: {
    current: { execute(ctx) { return { id: ctx.state<{ current: string }>().current, name: '地点', description: '', exits: [] }; } },
    describe: { execute(ctx, input) { if (!['town', 'woods'].includes(input.location as string)) ctx.fail('UNKNOWN_LOCATION', '未知地点'); return { id: input.location!, name: '地点', description: '', exits: [] }; } }
  }
};
const externalClock: ModuleDefinition = {
  manifest: { id: 'test.clock', title: '外部时钟', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { time: '1.0.0' } },
  initialState: () => ({ now: { elapsedSeconds: 0 } }),
  commands: { set: { execute(ctx, input) { ctx.write({ now: input.now! }); return null; } } },
  queries: { now: { execute: ctx => ctx.state<{ now: JsonValue }>().now } }
};
const sequence: ModuleDefinition = {
  manifest: { id: 'test.sequence', title: '事务动作序列', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { crafting: { version: '^1.0.0' }, time: { version: '^1.0.0' } } },
  initialState: () => ({}), commands: { run: { execute(ctx, input) { for (const op of input.operations as JsonObject[]) ctx.call(op.capability as string, op.action as string, op.input as JsonObject); return null; } } }
};
function registry() { return new ModuleRegistry([...capacityModules, inventoryModule, ...timeModules, recipesModule, craftingModule, externalRecipes, externalClock, location, sequence]); }
function definition(): WorldDefinition {
  return { id: 'crafting-test', title: '制作测试', version: '1', modules: [
    { id: 'capacity', module: 'capacity.slots', config: {} },
    { id: 'inventory', module: 'inventory.basic', config: { items: Object.fromEntries(['wood', 'plank', 'stone', 'tool', 'toString', 'hasOwnProperty'].map(id => [id, { name: id, weight: 1, volume: 1, length: 1 }])), containers: { bag: { limits: { slots: 8 }, items: { wood: 4 } } } } },
    { id: 'clock', module: 'time.continuous', config: {} },
    { id: 'recipes', module: 'recipes.catalog', config: { recipes: { plank: recipe() } } },
    { id: 'crafting', module: 'crafting.single', config: { container: 'bag' } }
  ] };
}
function instance(d: WorldDefinition, id: string) { const result = d.modules.find(m => m.id === id); assert.ok(result); return result; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw Error('动作失败'); return r; }
function fails(w: World, target: string, action: string, input: JsonObject = {}, code?: string) { const before = w.snapshot(); const r = w.dispatch({ target, action, input }); assert.equal(r.ok, false, JSON.stringify(r)); if (!r.ok && code) assert.equal(r.error.code, code); assert.deepEqual(w.snapshot(), before); }
function count(w: World, item: string) { return (w.query('inventory', 'count', { container: 'bag', item }) as JsonObject).quantity; }
function status(w: World) { return w.query('crafting', 'status') as JsonObject; }
function recipes(d: WorldDefinition) { return instance(d, 'recipes').config.recipes as Record<string, JsonObject>; }
function bag(d: WorldDefinition) { return (instance(d, 'inventory').config.containers as any).bag; }
const advance = (seconds: number) => ({ capability: 'time', action: 'advance', input: { seconds } });
const start = { capability: 'crafting', action: 'start', input: { recipe: 'plank' } };
const collect = { capability: 'crafting', action: 'collect', input: {} };

test('single job consumes inputs and becomes collectible exactly once after twenty seconds', () => {
  const w = setup(); assert.deepEqual(status(w), { job: null, ready: false, remainingSeconds: 0 });
  const result = ok(w, 'crafting', 'start', { recipe: 'plank' }); assert.equal(count(w, 'wood'), 2);
  assert.deepEqual(result.value, { job: { recipe: 'plank', name: '木板', batches: 1, inputs: { wood: 2 }, outputs: { plank: 2 }, startedAt: 0, readyAt: 20 }, ready: false, remainingSeconds: 20 });
  assert.deepEqual(result.events.map(e => e.type), ['crafting.started']);
  fails(w, 'crafting', 'start', { recipe: 'plank' }); fails(w, 'crafting', 'collect');
  ok(w, 'clock', 'advance', { seconds: 19 }); assert.equal(status(w).remainingSeconds, 1); fails(w, 'crafting', 'collect');
  ok(w, 'clock', 'advance', { seconds: 1 }); const before = w.snapshot(); assert.equal(status(w).ready, true); assert.deepEqual(w.snapshot(), before);
  const collected = ok(w, 'crafting', 'collect'); assert.deepEqual(collected.value, { recipe: 'plank', batches: 1, outputs: { plank: 2 } }); assert.equal(count(w, 'plank'), 2); assert.equal(collected.events[0]!.type, 'crafting.collected'); fails(w, 'crafting', 'collect');
});
test('two batches freeze doubled inputs outputs and forty seconds', () => {
  const w = setup(); ok(w, 'crafting', 'start', { recipe: 'plank', batches: 2 }); assert.equal(count(w, 'wood'), 0); assert.equal(status(w).remainingSeconds, 40);
  ok(w, 'clock', 'advance', { seconds: 20 }); fails(w, 'crafting', 'collect'); ok(w, 'clock', 'advance', { seconds: 20 }); ok(w, 'crafting', 'collect'); assert.equal(count(w, 'plank'), 4);
});
test('later missing input rolls back earlier inventory removal', () => {
  const w = setup(d => { recipes(d).plank!.inputs = { wood: 2, stone: 1 }; }); fails(w, 'crafting', 'start', { recipe: 'plank' }, 'INSUFFICIENT_ITEMS'); assert.equal(count(w, 'wood'), 4);
});
test('later output capacity failure restores all outputs and completed job', () => {
  const w = setup(d => { bag(d).limits.slots = 1; bag(d).items.wood = 2; recipes(d).plank!.outputs = { plank: 2, tool: 1 }; });
  ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'clock', 'advance', { seconds: 20 }); fails(w, 'crafting', 'collect', {}, 'CAPACITY_EXCEEDED'); assert.equal(count(w, 'plank'), 0); assert.equal(status(w).ready, true);
});
test('later refund capacity failure restores all inputs and job', () => {
  const w = setup(d => { bag(d).limits.slots = 2; bag(d).items = { wood: 2, stone: 1 }; recipes(d).plank!.inputs = { wood: 2, stone: 1 }; });
  ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'inventory', 'add', { container: 'bag', item: 'tool', quantity: 1 }); fails(w, 'crafting', 'cancel', {}, 'CAPACITY_EXCEEDED'); assert.equal(count(w, 'wood'), 0);
  ok(w, 'inventory', 'remove', { container: 'bag', item: 'tool', quantity: 1 }); const result = ok(w, 'crafting', 'cancel'); assert.deepEqual(result.value, { recipe: 'plank', batches: 1, refunded: { wood: 2, stone: 1 } }); assert.equal(result.events[0]!.type, 'crafting.cancelled'); assert.equal(status(w).job, null); fails(w, 'crafting', 'cancel');
});
test('start and collect require allowed location while cancellation refunds anywhere', () => {
  const w = setup(d => { d.modules.push({ id: 'location', module: 'test.location', config: {} }); instance(d, 'crafting').config.locations = ['town']; });
  ok(w, 'location', 'move', { to: 'woods' }); fails(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'location', 'move', { to: 'town' }); ok(w, 'crafting', 'start', { recipe: 'plank' });
  ok(w, 'clock', 'advance', { seconds: 20 }); ok(w, 'location', 'move', { to: 'woods' }); fails(w, 'crafting', 'collect'); ok(w, 'crafting', 'cancel'); assert.equal(count(w, 'wood'), 4);
});
test('empty location restrictions do not need a location provider and nonempty restrictions do', () => {
  const w = setup(d => { instance(d, 'crafting').config.locations = []; }); ok(w, 'crafting', 'start', { recipe: 'plank' });
  assert.throws(() => setup(d => { instance(d, 'crafting').config.locations = ['town']; }));
  for (const locations of [['missing'], ['town', 'town']]) assert.throws(() => setup(d => { d.modules.push({ id: 'location', module: 'test.location', config: {} }); instance(d, 'crafting').config.locations = locations; }));
});
test('catalog get and list share detached recipe data and reject inherited recipe IDs', () => {
  const w = setup(); const expected = { id: 'plank', name: '木板', inputs: { wood: 2 }, outputs: { plank: 2 }, durationSeconds: 20 };
  assert.deepEqual(w.query('recipes', 'get', { recipe: 'plank' }), expected); assert.deepEqual(w.query('recipes', 'list'), { recipes: [expected] });
  const got = w.query('recipes', 'get', { recipe: 'plank' }) as any; got.inputs.wood = 99; assert.equal((w.query('recipes', 'get', { recipe: 'plank' }) as any).inputs.wood, 2);
  assert.throws(() => w.query('recipes', 'get', { recipe: 'toString' })); fails(w, 'crafting', 'start', { recipe: 'toString' });
});
test('own prototype-like recipe and item IDs work without inherited entries', () => {
  const w = setup(d => { instance(d, 'recipes').config.recipes = { toString: { name: '特殊配方', inputs: { toString: 1 }, outputs: { hasOwnProperty: 2 }, durationSeconds: 1 } }; bag(d).items = { toString: 1 }; });
  ok(w, 'crafting', 'start', { recipe: 'toString' }); ok(w, 'clock', 'advance', { seconds: 1 }); ok(w, 'crafting', 'collect'); assert.equal(count(w, 'hasOwnProperty'), 2);
});
test('unfinished jobs survive restore and recipe edits with frozen outputs and duration', () => {
  const w = setup(); ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'clock', 'advance', { seconds: 5 });
  const restored = restoreWorld(registry(), w.snapshot()); assert.deepEqual(status(restored), status(w)); const d = restored.definition; recipes(d).plank = { name: '新配方', inputs: { stone: 3 }, outputs: { tool: 5 }, durationSeconds: 999 };
  const changed = reconfigureWorld(registry(), restored, d); assert.deepEqual(status(changed), status(w)); ok(changed, 'clock', 'advance', { seconds: 15 }); ok(changed, 'crafting', 'collect'); assert.equal(count(changed, 'plank'), 2); assert.equal(count(changed, 'tool'), 0);
});
test('deleted recipes retain frozen input refunds through reconfigure and restore', () => {
  const w = setup(); ok(w, 'crafting', 'start', { recipe: 'plank', batches: 2 }); const d = w.definition; instance(d, 'recipes').config.recipes = {};
  const changed = restoreWorld(registry(), reconfigureWorld(registry(), w, d).snapshot()); ok(changed, 'crafting', 'cancel'); assert.equal(count(changed, 'wood'), 4);
});
test('frozen items container and clock baselines must remain valid after restore or reconfigure', () => {
  const w = setup(); ok(w, 'clock', 'advance', { seconds: 10 }); ok(w, 'crafting', 'start', { recipe: 'plank' });
  for (const item of ['wood', 'plank']) { const d = w.definition; delete (instance(d, 'inventory').config.items as any)[item]; instance(d, 'recipes').config.recipes = {}; assert.throws(() => reconfigureWorld(registry(), w, d)); }
  const badContainer = w.definition; instance(badContainer, 'crafting').config.container = 'missing'; assert.throws(() => reconfigureWorld(registry(), w, badContainer));
  for (const change of [(s: any) => { s.modules.crafting.state.job.readyAt = 10; }, (s: any) => { s.modules.crafting.state.job.outputs = { missing: 1 }; }, (s: any) => { s.modules.clock.state.elapsedSeconds = 9; }]) { const s = w.snapshot(); change(s); assert.throws(() => restoreWorld(registry(), s)); }
});
test('invalid recipe shapes counts durations and unknown item references reject assembly', () => {
  for (const edit of [ { inputs: {} }, { outputs: {} }, { inputs: { wood: 0 } }, { inputs: { wood: 1.5 } }, { outputs: { plank: Number.MAX_SAFE_INTEGER + 1 } }, { durationSeconds: 0 }, { durationSeconds: -1 }, { durationSeconds: Number.MAX_SAFE_INTEGER + 1 }, { inputs: { missing: 1 } }, { outputs: { missing: 1 } }, { name: '' } ]) assert.throws(() => setup(d => { Object.assign(recipes(d).plank!, edit); }));
});
test('invalid batches and scaled count or duration overflow fail before consuming inputs', () => {
  const w = setup(); for (const batches of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER]) fails(w, 'crafting', 'start', { recipe: 'plank', batches });
  for (const edit of [{ inputs: { wood: Number.MAX_SAFE_INTEGER } }, { outputs: { plank: Number.MAX_SAFE_INTEGER } }, { durationSeconds: Number.MAX_SAFE_INTEGER }]) { const candidate = setup(d => { Object.assign(recipes(d).plank!, edit); }); fails(candidate, 'crafting', 'start', { recipe: 'plank', batches: 2 }); }
});
test('large clocks reject overflow and precision loss while fractional durations remain usable', () => {
  for (const seconds of [Number.MAX_SAFE_INTEGER, 2 ** 52]) { const w = setup(d => { recipes(d).plank!.durationSeconds = seconds === Number.MAX_SAFE_INTEGER ? 20 : 0.1; }); ok(w, 'clock', 'advance', { seconds }); fails(w, 'crafting', 'start', { recipe: 'plank' }); }
  const w = setup(d => { recipes(d).plank!.durationSeconds = 0.25; }); ok(w, 'clock', 'advance', { seconds: 0.5 }); ok(w, 'crafting', 'start', { recipe: 'plank' }); assert.equal((status(w).job as JsonObject).readyAt, 0.75); ok(w, 'clock', 'advance', { seconds: 0.25 }); ok(w, 'crafting', 'collect');
});
test('malformed and backward bound clocks roll back with an active job', () => {
  const w = setup(d => { instance(d, 'clock').module = 'test.clock'; }); ok(w, 'clock', 'set', { now: { elapsedSeconds: 10 } }); ok(w, 'crafting', 'start', { recipe: 'plank' });
  for (const now of [null, {}, [], { elapsedSeconds: '10' }, { elapsedSeconds: -1 }, { elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }]) fails(w, 'clock', 'set', { now }, 'INVALID_CLOCK');
  fails(w, 'clock', 'set', { now: { elapsedSeconds: 9 } }, 'CLOCK_BACKWARD');
});
test('explicit clock binding ignores a second clock and compatible clock replacement retains job', () => {
  const w = setup(d => { d.modules.push({ id: 'other', module: 'time.continuous', config: {} }); instance(d, 'crafting').bindings = { time: 'clock' }; }); ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'other', 'advance', { seconds: 100 }); assert.equal(status(w).remainingSeconds, 20);
  const d = w.definition; instance(d, 'clock').module = 'time.step'; instance(d, 'clock').config = { secondsPerStep: 10 }; const changed = reconfigureWorld(registry(), w, d); ok(changed, 'clock', 'advance', { steps: 2 }); ok(changed, 'crafting', 'collect'); assert.equal(count(changed, 'plank'), 2);
});
test('nested advances use the actual start time and allow collect and replacement in one transaction', () => {
  const w = setup(d => { d.modules.push({ id: 'sequence', module: 'test.sequence', config: {} }); });
  ok(w, 'sequence', 'run', { operations: [advance(10), start, advance(5)] }); assert.equal((status(w).job as JsonObject).startedAt, 10); assert.equal((status(w).job as JsonObject).readyAt, 30); assert.equal(status(w).remainingSeconds, 15);
  ok(w, 'sequence', 'run', { operations: [advance(15), collect, start, advance(20), collect] }); assert.equal(count(w, 'plank'), 4); assert.equal(status(w).job, null);
});
function external(edit?: (d: WorldDefinition) => void) { return setup(d => { const provider = instance(d, 'recipes'); provider.module = 'test.recipes'; provider.config = { list: { recipes: [{ id: 'plank', ...recipe() }] }, get: { id: 'plank', ...recipe() } }; edit?.(d); }); }

for (const length of [65, 128]) test(`frontier Unicode crafting accepts ${length} codepoint recipe item and location IDs from real providers`, () => {
  const input = '🌲'.repeat(length), output = '🪵'.repeat(length), recipeId = '😀'.repeat(length), locationId = '🏠'.repeat(length);
  const d = definition();
  instance(d, 'inventory').config.items = Object.fromEntries([input, output].map(id => [id, { name: id, weight: 1, volume: 1, length: 1 }]));
  bag(d).items = { [input]: 4 };
  instance(d, 'recipes').config.recipes = { [recipeId]: { name: '木板', inputs: { [input]: 2 }, outputs: { [output]: 2 }, durationSeconds: 20 } };
  d.modules.push({ id: 'location', module: 'location.nodes', config: { start: locationId, nodes: { [locationId]: { name: '工坊', description: '', exits: [] } } } });
  instance(d, 'crafting').config.locations = [locationId];
  const r = registry(); r.register(locationModule); const w = createWorld(r, d);
  ok(w, 'crafting', 'start', { recipe: recipeId }); assert.equal(count(w, input), 2);
  ok(w, 'clock', 'advance', { seconds: 20 }); ok(w, 'crafting', 'collect');
  assert.equal(count(w, output), 2); assert.equal(status(w).job, null);
});

test('frontier Unicode crafting rejects external 129 codepoint recipe and item IDs', () => {
  const tooLong = '😀'.repeat(129);
  for (const patch of [{ id: tooLong }, { inputs: { [tooLong]: 1 } }, { outputs: { [tooLong]: 1 } }]) {
    assert.throws(() => external(d => { instance(d, 'recipes').config.list = { recipes: [{ id: 'plank', ...recipe(), ...patch }] }; }), (error: any) => error.code === 'INVALID_RECIPE');
    const w = external(d => { instance(d, 'recipes').config.get = { id: 'plank', ...recipe(), ...patch }; });
    fails(w, 'crafting', 'start', { recipe: 'plank' }, 'INVALID_RECIPE'); assert.equal(count(w, 'wood'), 4);
  }
});

test('frontier Unicode crafting rejects external 129 codepoint current location without consuming inputs', () => {
  const provider: ModuleDefinition = { ...location, manifest: { ...location.manifest, id: 'test.unicode-location' }, queries: { ...location.queries, current: { execute: () => ({ id: '🏠'.repeat(129) }) } } };
  const r = registry(); r.register(provider); const d = definition();
  d.modules.push({ id: 'location', module: provider.manifest.id, config: {} }); instance(d, 'crafting').config.locations = ['town'];
  const w = createWorld(r, d); fails(w, 'crafting', 'start', { recipe: 'plank' }, 'INVALID_LOCATION'); assert.equal(count(w, 'wood'), 4);
});

test('frontier Unicode crafting patch restores genuine paid 1.0.0 job with frozen outputs and remaining time', () => {
  const legacy = { ...craftingModule, manifest: { ...craftingModule.manifest, version: '1.0.0' } };
  const oldRegistry = new ModuleRegistry([...capacityModules, inventoryModule, ...timeModules, recipesModule, legacy]);
  const w = createWorld(oldRegistry, definition()); ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'clock', 'advance', { seconds: 5 });
  assert.equal(count(w, 'wood'), 2); const saved = w.snapshot(), restored = restoreWorld(registry(), saved);
  assert.equal(restored.snapshot().modules.crafting!.definitionVersion, '1.0.1');
  assert.deepEqual(restored.read('crafting'), saved.modules.crafting!.state);
  assert.equal(status(restored).remainingSeconds, 15); assert.equal(count(restored, 'wood'), 2);
  fails(restored, 'crafting', 'collect', {}, 'CRAFTING_NOT_READY');
  ok(restored, 'clock', 'advance', { seconds: 15 }); ok(restored, 'crafting', 'collect');
  assert.equal(count(restored, 'plank'), 2); fails(restored, 'crafting', 'collect');
});

test('frontier Unicode crafting patch rejects unsupported migration origins and malformed legacy paid jobs', () => {
  const legacy = { ...craftingModule, manifest: { ...craftingModule.manifest, version: '1.0.0' } };
  const oldRegistry = new ModuleRegistry([...capacityModules, inventoryModule, ...timeModules, recipesModule, legacy]);
  const w = createWorld(oldRegistry, definition()); ok(w, 'crafting', 'start', { recipe: 'plank' });
  for (const patch of [{ definitionId: 'other.crafting' }, { definitionVersion: '0.9.0' }, { definitionVersion: '1.0.2' }, { stateVersion: 2 }]) {
    const saved = w.snapshot(); Object.assign(saved.modules.crafting!, patch); assert.throws(() => restoreWorld(registry(), saved));
  }
  for (const patch of [{ readyAt: 0 }, { batches: 0 }, { outputs: { missing: 1 } }]) {
    const saved = w.snapshot(); Object.assign((saved.modules.crafting!.state as JsonObject).job as JsonObject, patch);
    assert.throws(() => restoreWorld(registry(), saved));
  }
});
test('external recipe capability supports public contracts and rejects malformed lists at assembly', () => {
  const w = external(); ok(w, 'crafting', 'start', { recipe: 'plank' }); ok(w, 'clock', 'advance', { seconds: 20 }); ok(w, 'crafting', 'collect'); assert.equal(count(w, 'plank'), 2);
  for (const list of [null, {}, { recipes: {} }, { recipes: [null] }, { recipes: [{ id: 'plank', ...recipe(), inputs: [] }] }, { recipes: [{ id: 'plank', ...recipe(), outputs: { missing: 1 } }] }]) assert.throws(() => external(d => { instance(d, 'recipes').config.list = list; }));
});
test('malformed external get values never consume inventory or create jobs', () => {
  for (const get of [null, [], {}, { id: 'other', ...recipe() }, { id: 'plank', ...recipe(), name: '' }, { id: 'plank', ...recipe(), inputs: null }, { id: 'plank', ...recipe(), inputs: {} }, { id: 'plank', ...recipe(), inputs: { wood: '2' } }, { id: 'plank', ...recipe(), outputs: { plank: 0 } }, { id: 'plank', ...recipe(), outputs: { plank: 0.5 } }, { id: 'plank', ...recipe(), durationSeconds: 0 }, { id: 'plank', ...recipe(), durationSeconds: '20' }, { id: 'plank', ...recipe(), outputs: { missing: 1 } }]) {
    const w = external(d => { instance(d, 'recipes').config.get = get; }); fails(w, 'crafting', 'start', { recipe: 'plank' }); assert.equal(count(w, 'wood'), 4);
  }
});

test('external malformed inventory query results are rejected before assembly succeeds', () => {
  for (const [action, response] of [ ['list', null], ['list', { items: {} }], ['count', null], ['count', {}], ['count', { quantity: '4' }], ['count', { quantity: -1 }], ['count', { quantity: 0.5 }], ['count', { quantity: Number.MAX_SAFE_INTEGER + 1 }] ] as [string, JsonValue][]) {
    const provider: ModuleDefinition = { ...inventoryModule, manifest: { ...inventoryModule.manifest, id: 'test.inventory' }, queries: { ...inventoryModule.queries, [action]: { execute: () => response } } };
    const r = registry(); r.register(provider); const d = definition(); instance(d, 'inventory').module = 'test.inventory'; assert.throws(() => createWorld(r, d));
  }
});
test('external malformed location descriptions and current IDs cannot bypass restrictions', () => {
  for (const action of ['describe', 'current']) for (const response of [null, {}, { id: 1 }, { id: '' }, { id: 'other' }]) {
    const provider: ModuleDefinition = { ...location, manifest: { ...location.manifest, id: 'test.bad-location' }, queries: { ...location.queries, [action]: { execute: () => response } } };
    const r = registry(); r.register(provider); const d = definition(); d.modules.push({ id: 'location', module: 'test.bad-location', config: {} }); instance(d, 'crafting').config.locations = ['town'];
    if (action === 'describe') assert.throws(() => createWorld(r, d)); else { const w = createWorld(r, d); fails(w, 'crafting', 'start', { recipe: 'plank' }); }
  }
});
test('edited recipes retain old refunds and deleted recipes retain old collectible output', () => {
  for (const action of ['cancel', 'collect']) {
    const w = setup(); ok(w, 'crafting', 'start', { recipe: 'plank' }); const d = w.definition;
    instance(d, 'recipes').config.recipes = action === 'cancel' ? { plank: { name: '新版', inputs: { stone: 3 }, outputs: { tool: 5 }, durationSeconds: 100 } } : {};
    const changed = reconfigureWorld(registry(), w, d); ok(changed, 'clock', 'advance', { seconds: 20 }); ok(changed, 'crafting', action);
    assert.equal(count(changed, 'wood'), action === 'cancel' ? 4 : 2); assert.equal(count(changed, 'plank'), action === 'collect' ? 2 : 0); assert.equal(count(changed, 'stone'), 0);
  }
});
test('idle crafting rejects invalid clock and current catalog item references on reconfigure', () => {
  const w = setup(d => { instance(d, 'clock').module = 'test.clock'; }); fails(w, 'clock', 'set', { now: {} }, 'INVALID_CLOCK');
  const d = w.definition; recipes(d).plank!.outputs = { missing: 1 }; assert.throws(() => reconfigureWorld(registry(), w, d));
});
test('nested rewind cannot erase an existing order baseline by cancelling', () => {
  const w = setup(d => { instance(d, 'clock').module = 'test.clock'; d.modules.push({ id: 'sequence', module: 'test.sequence', config: {} }); });
  ok(w, 'clock', 'set', { now: { elapsedSeconds: 10 } }); ok(w, 'crafting', 'start', { recipe: 'plank' });
  fails(w, 'sequence', 'run', { operations: [ { capability: 'time', action: 'set', input: { now: { elapsedSeconds: 9 } } }, { capability: 'crafting', action: 'cancel', input: {} } ] }, 'CLOCK_BACKWARD');
});

test('active paid jobs reject invalid catalog reconfiguration while retaining collect and cancel paths', () => {
  for (const action of ['cancel', 'collect']) {
    const w = setup(); ok(w, 'crafting', 'start', { recipe: 'plank' }); const before = w.snapshot();
    const d = w.definition; recipes(d).unrelated = { name: '无效新增配方', inputs: { wood: 1 }, outputs: { missing: 1 }, durationSeconds: 1 };
    assert.throws(() => reconfigureWorld(registry(), w, d), (error: any) => error.code === 'UNKNOWN_ITEM');
    assert.deepEqual(w.snapshot(), before);
    if (action === 'collect') ok(w, 'clock', 'advance', { seconds: 20 });
    ok(w, 'crafting', action);
    assert.equal(status(w).job, null); assert.equal(count(w, 'wood'), action === 'cancel' ? 4 : 2); assert.equal(count(w, 'plank'), action === 'collect' ? 2 : 0);
  }
});
