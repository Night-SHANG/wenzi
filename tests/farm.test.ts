import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { farmModules } from '../src/modules/farm.ts';
import type { JsonObject, JsonValue, ModuleDefinition, ModuleInstance, WorldDefinition } from '../src/contracts.ts';

function definition(): WorldDefinition {
  return { id: 'farm-test', title: '农场测试', version: '1.0.0', modules: [
    { id: 'capacity', module: 'capacity.slots', config: {} },
    { id: 'inventory', module: 'inventory.basic', config: {
      items: { seed: { name: '种子', weight: 1, volume: 1, length: 1 }, crop: { name: '麦子', weight: 100, volume: 100, length: 10 }, stone: { name: '石头', weight: 1000, volume: 20, length: 20 } },
      containers: { player: { limits: { slots: 3, maxWeight: 1500, maxVolume: 1000, maxLength: 100 }, items: { seed: 3 } }, warehouse: { limits: { slots: 1 }, items: {} } }
    } },
    { id: 'clock', module: 'time.step', config: { secondsPerStep: 10 } },
    { id: 'growth', module: 'growth.linear', config: { multiplier: 1 } },
    { id: 'planting', module: 'planting.basic', config: { container: 'player', crops: { wheat: { name: '小麦', seedItem: 'seed', harvestItem: 'crop', durationSeconds: 20, yield: 2 } } } },
    { id: 'market', module: 'market.fixed', config: { container: 'player', initialCoins: 0, prices: { crop: 5 } } },
    { id: 'view', module: 'view.farm.text', config: { title: '我的农场', container: 'player' } }
  ] };
}
const registry = () => new ModuleRegistry(farmModules);
function setup(edit?: (definition: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
function instance(d: WorldDefinition, id: string): ModuleInstance { const value = d.modules.find(m => m.id === id); assert.ok(value); return value; }
function ok(world: ReturnType<typeof setup>, target: string, action: string, input: JsonObject = {}) { const result = world.dispatch({ target, action, input }); assert.equal(result.ok, true, JSON.stringify(result)); return result; }
function count(world: ReturnType<typeof setup>, item: string, container = 'player') { return (world.query('inventory', 'count', { container, item }) as JsonObject).quantity; }

test('farm seed-grow-harvest-sale uses structured public queries and Chinese view', () => {
  const w = setup(); ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); assert.equal(count(w, 'seed'), 2);
  ok(w, 'clock', 'advance', { steps: 2 }); ok(w, 'planting', 'harvest', { plot: 'A' }); assert.equal(count(w, 'crop'), 2);
  ok(w, 'market', 'sell', { item: 'crop', quantity: 2 }); assert.equal(count(w, 'crop'), 0); assert.deepEqual(w.query('market', 'balance'), { coins: 10 });
  const view = w.query('view', 'render') as JsonObject; assert.equal(view.title, '我的农场'); assert.match((view.lines as string[]).join('\n'), /金币.*10/);
});
test('failed plant preserves seed and occupied plot', () => {
  const w = setup(); ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); const before = w.snapshot();
  assert.equal(w.dispatch({ target: 'planting', action: 'plant', input: { plot: 'A', crop: 'wheat' } }).ok, false); assert.deepEqual(w.snapshot(), before);
  assert.equal(w.dispatch({ target: 'planting', action: 'plant', input: { plot: 'B', crop: 'missing' } }).ok, false); assert.equal(count(w, 'seed'), 2);
});
test('full harvest destination leaves mature plot and inventory intact', () => {
  const w = setup(d => { (instance(d, 'inventory').config.containers as any).player.limits.slots = 1; });
  ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); ok(w, 'clock', 'advance', { steps: 2 }); const before = w.snapshot();
  assert.equal(w.dispatch({ target: 'planting', action: 'harvest', input: { plot: 'A' } }).ok, false); assert.deepEqual(w.snapshot(), before);
});
test('transfer to full destination preserves source and target', () => {
  const w = setup(); ok(w, 'inventory', 'add', { container: 'warehouse', item: 'stone', quantity: 1 }); const before = w.snapshot();
  assert.equal(w.dispatch({ target: 'inventory', action: 'transfer', input: { from: 'player', to: 'warehouse', item: 'seed', quantity: 1 } }).ok, false); assert.deepEqual(w.snapshot(), before);
});
test('slot capacity counts stacks while physical and combined check g ml mm', () => {
  const w = createWorld(registry(), { id: 'capacity', title: 'capacity', version: '1', modules: ['slots', 'physical', 'combined'].map(policy => ({ id: policy, module: `capacity.${policy}`, config: {} })) });
  const input = { items: [{ id: 'stone', quantity: 100, weight: 1000, volume: 20, length: 20 }], limits: { slots: 1, maxWeight: 1500, maxVolume: 1000, maxLength: 100 } };
  assert.equal((w.query('slots', 'check', input) as JsonObject).allowed, true);
  assert.equal((w.query('physical', 'check', input) as JsonObject).allowed, false); assert.equal((w.query('combined', 'check', input) as JsonObject).allowed, false);
  assert.equal((w.query('slots', 'check', { items: [{ ...input.items[0]!, quantity: 0 }], limits: { slots: 0 } }) as JsonObject).allowed, true);
});
test('step and continuous clocks produce equivalent progress for equal elapsed seconds', () => {
  const step = setup(); const continuous = setup(d => { const c = instance(d, 'clock'); c.module = 'time.continuous'; c.config = {}; });
  for (const w of [step, continuous]) ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' });
  ok(step, 'clock', 'advance', { steps: 1 }); ok(continuous, 'clock', 'advance', { seconds: 10 }); assert.deepEqual(step.query('planting', 'plots'), continuous.query('planting', 'plots'));
});
test('planting ignores time events from unbound providers', () => {
  const w = setup(d => { d.modules.push({ id: 'other-clock', module: 'time.continuous', config: {} }); instance(d, 'planting').bindings = { time: 'clock' }; instance(d, 'view').bindings = { time: 'clock' }; });
  ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); const before = w.query('planting', 'plots'); ok(w, 'other-clock', 'advance', { seconds: 200 }); assert.deepEqual(w.query('planting', 'plots'), before);
  ok(w, 'clock', 'advance', { steps: 1 }); assert.notDeepEqual(w.query('planting', 'plots'), before);
});
test('market cannot credit failed sale or accept unknown price', () => {
  const w = setup(); const before = w.snapshot();
  for (const input of [{ item: 'crop', quantity: 1 }, { item: 'seed', quantity: 1 }, { item: 'crop', quantity: -1 }, { item: 'crop', quantity: 0.5 }]) assert.equal(w.dispatch({ target: 'market', action: 'sell', input }).ok, false);
  assert.deepEqual(w.snapshot(), before);
});
test('growth capacity and time policies explicitly migrate and retain applicable state', () => {
  const r = registry(); const w = setup(); ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); ok(w, 'clock', 'advance', { steps: 1 });
  const d = w.definition; instance(d, 'capacity').module = 'capacity.combined'; instance(d, 'growth').module = 'growth.greenhouse'; instance(d, 'growth').config = { multiplier: 2 }; instance(d, 'clock').module = 'time.continuous'; instance(d, 'clock').config = {};
  const next = reconfigureWorld(r, w, d); assert.deepEqual(next.query('clock', 'now'), { elapsedSeconds: 10 }); assert.deepEqual(next.query('inventory', 'list', { container: 'player' }), w.query('inventory', 'list', { container: 'player' }));
  ok(next, 'clock', 'advance', { seconds: 5 }); ok(next, 'planting', 'harvest', { plot: 'A' }); assert.equal(count(next, 'crop'), 2);
});
test('unsafe or fractional quantities and time input never commit', () => {
  const w = setup(); const before = w.snapshot();
  for (const quantity of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) assert.equal(w.dispatch({ target: 'inventory', action: 'add', input: { container: 'player', item: 'seed', quantity } }).ok, false);
  for (const steps of [-1, 0, 0.5, Number.MAX_SAFE_INTEGER]) assert.equal(w.dispatch({ target: 'clock', action: 'advance', input: { steps } }).ok, false);
  assert.deepEqual(w.snapshot(), before);
});
test('invalid configs references counts capacity and crop metadata reject assembly', () => {
  for (const edit of [
    (d: WorldDefinition) => { (instance(d, 'inventory').config.containers as any).player.items.seed = -1; },
    (d: WorldDefinition) => { (instance(d, 'inventory').config.containers as any).player.items.missing = 1; },
    (d: WorldDefinition) => { (instance(d, 'inventory').config.containers as any).player.limits.slots = 0; },
    (d: WorldDefinition) => { (instance(d, 'planting').config.crops as any).wheat.seedItem = 'missing'; },
    (d: WorldDefinition) => { (instance(d, 'planting').config.crops as any).wheat.durationSeconds = 0; },
    (d: WorldDefinition) => { (instance(d, 'market').config.prices as any).crop = -1; }
  ]) assert.throws(() => setup(edit));
});
test('slot-only policy ignores physical totals and physical handles volume and length separately', () => {
  const w = createWorld(registry(), { id: 'limits', title: 'limits', version: '1', modules: ['slots', 'physical'].map(policy => ({ id: policy, module: `capacity.${policy}`, config: {} })) });
  assert.equal((w.query('slots', 'check', { items: [{ id: 'bulk', quantity: Number.MAX_SAFE_INTEGER, weight: 2, volume: 2, length: 2 }], limits: { slots: 1 } }) as JsonObject).allowed, true);
  for (const limits of [{ maxVolume: 1 }, { maxLength: 1 }]) assert.equal((w.query('physical', 'check', { items: [{ id: 'large', quantity: 1, weight: 0, volume: 2, length: 2 }], limits }) as JsonObject).allowed, false);
});
test('inventory instances own resources independently and unripe or absent harvest cannot mutate', () => {
  const w = setup(d => { d.modules.push({ id: 'other-inventory', module: 'inventory.basic', config: instance(d, 'inventory').config }); for (const id of ['planting', 'market', 'view']) instance(d, id).bindings = { inventory: 'inventory' }; });
  ok(w, 'inventory', 'remove', { container: 'player', item: 'seed', quantity: 1 }); assert.deepEqual(w.query('other-inventory', 'count', { container: 'player', item: 'seed' }), { quantity: 3 });
  ok(w, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); const before = w.snapshot();
  for (const plot of ['A', 'missing']) assert.equal(w.dispatch({ target: 'planting', action: 'harvest', input: { plot } }).ok, false); assert.deepEqual(w.snapshot(), before);
});

const farmOrchestrator: ModuleDefinition = {
  manifest: { id: 'test.farm-orchestrator', title: 'Nested public calls', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { time: { version: '^1.0.0' }, planting: { version: '^1.0.0' } } },
  initialState: () => ({}),
  commands: { run: { execute(ctx, input) {
    for (const op of input.operations as JsonObject[]) ctx.call(op.capability as string, op.action as string, op.input as JsonObject);
    return null;
  } } }
};
const faultyClock: ModuleDefinition = {
  manifest: { id: 'test.farm-clock', title: 'Clock contract probe', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { time: '1.0.0' } },
  initialState: () => ({ now: { elapsedSeconds: 0 } }),
  queries: { now: { execute: ctx => ctx.state<{ now: JsonValue }>().now } },
  commands: { inject: { execute(ctx, input) { ctx.write({ now: input.now! }); if (input.event) ctx.emit('time.advanced', input.event as JsonObject); return null; } } }
};
function nestedSetup(options: { faultClock?: boolean } = {}) {
  const d = definition(); const clock = instance(d, 'clock'); clock.module = options.faultClock ? 'test.farm-clock' : 'time.continuous'; clock.config = {};
  (instance(d, 'planting').config.crops as any).wheat.durationSeconds = 10;
  d.modules.push({ id: 'orchestrator', module: 'test.farm-orchestrator', config: {} });
  const r = new ModuleRegistry([...farmModules, farmOrchestrator, faultyClock]); return { world: createWorld(r, d), registry: r };
}
const advance = (seconds: number) => ({ capability: 'time', action: 'advance', input: { seconds } });
const plant = (plot: string) => ({ capability: 'planting', action: 'plant', input: { plot, crop: 'wheat' } });
const harvest = (plot: string) => ({ capability: 'planting', action: 'harvest', input: { plot } });
function progresses(w: ReturnType<typeof setup>) { return Object.fromEntries(((w.query('planting', 'plots') as JsonObject).plots as JsonObject[]).map(p => [p.id, p.progress])); }

test('queued time before planting cannot grow the newly created plot retroactively', () => {
  const { world } = nestedSetup(); ok(world, 'orchestrator', 'run', { operations: [advance(10), plant('A')] }); assert.deepEqual(progresses(world), { A: 0 });
});
test('planting before a nested advance grows during that elapsed interval', () => {
  const { world } = nestedSetup(); ok(world, 'orchestrator', 'run', { operations: [plant('A'), advance(10)] }); assert.deepEqual(progresses(world), { A: 1 });
});
test('multiple queued advances and intervening planting count each relevant second once', () => {
  const { world } = nestedSetup(); ok(world, 'orchestrator', 'run', { operations: [advance(2), plant('A'), advance(2), plant('B'), advance(2)] });
  assert.deepEqual(progresses(world), { A: 0.4, B: 0.2 });
});
test('advance then harvest synchronizes maturity before nested harvest and replacement planting', () => {
  const { world } = nestedSetup(); ok(world, 'planting', 'plant', { plot: 'A', crop: 'wheat' });
  ok(world, 'orchestrator', 'run', { operations: [advance(10), harvest('A'), plant('A')] }); assert.equal(count(world, 'crop'), 2); assert.deepEqual(progresses(world), { A: 0 });
});
test('clock baselines survive restore and compatible time policy replacement', () => {
  const { world, registry: r } = nestedSetup(); ok(world, 'orchestrator', 'run', { operations: [advance(5), plant('A'), advance(2)] });
  const restored = restoreWorld(r, world.snapshot()); assert.deepEqual(restored.read('planting'), world.read('planting'));
  const d = restored.definition; instance(d, 'clock').module = 'time.step'; instance(d, 'clock').config = { secondsPerStep: 3 };
  const replaced = reconfigureWorld(r, restored, d); assert.deepEqual(replaced.read('planting'), restored.read('planting'));
  ok(replaced, 'clock', 'advance', { steps: 1 }); assert.deepEqual(progresses(replaced), { A: 0.5 });
});
test('malformed or backward bound clock values roll back even without a time event', () => {
  const { world } = nestedSetup({ faultClock: true });
  ok(world, 'clock', 'inject', { now: { elapsedSeconds: 10 }, event: { elapsedSeconds: 10, deltaSeconds: 10 } });
  for (const now of [null, {}, { elapsedSeconds: '10' }, { elapsedSeconds: -1 }, { elapsedSeconds: 5 }, { elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }]) {
    const before = world.snapshot(); const result = world.dispatch({ target: 'clock', action: 'inject', input: { now } }); assert.equal(result.ok, false, JSON.stringify(now)); assert.deepEqual(world.snapshot(), before);
  }
});
test('malformed future duplicate or backward bound events fail atomically', () => {
  const { world } = nestedSetup({ faultClock: true });
  ok(world, 'clock', 'inject', { now: { elapsedSeconds: 10 }, event: { elapsedSeconds: 10, deltaSeconds: 10 } });
  for (const event of [{}, { elapsedSeconds: '20', deltaSeconds: 10 }, { elapsedSeconds: 30, deltaSeconds: 10 }, { elapsedSeconds: 20, deltaSeconds: 0 }, { elapsedSeconds: 20, deltaSeconds: -1 }, { elapsedSeconds: 20, deltaSeconds: 21 }, { elapsedSeconds: 10, deltaSeconds: 10 }, { elapsedSeconds: 5, deltaSeconds: 5 }]) {
    const before = world.snapshot(); assert.equal(world.dispatch({ target: 'clock', action: 'inject', input: { now: { elapsedSeconds: 20 }, event } }).ok, false, JSON.stringify(event)); assert.deepEqual(world.snapshot(), before);
  }
});
test('fractional simulated seconds do not falsely fail clock comparisons', () => {
  const { world } = nestedSetup(); ok(world, 'orchestrator', 'run', { operations: [plant('A'), advance(0.1), advance(0.6)] });
  assert.ok(Math.abs((progresses(world).A as number) - 0.07) < 1e-12);
});
test('planting explicitly migrates empty legacy state and rejects occupied legacy plots with unknown history', () => {
  const { world, registry: r } = nestedSetup(); const emptyLegacy = world.snapshot(); emptyLegacy.modules.planting!.stateVersion = 1; emptyLegacy.modules.planting!.state = { plots: {} };
  const migrated = restoreWorld(r, emptyLegacy); assert.equal(migrated.snapshot().modules.planting!.stateVersion, 2);
  ok(migrated, 'planting', 'plant', { plot: 'A', crop: 'wheat' }); ok(migrated, 'clock', 'advance', { seconds: 5 }); assert.deepEqual(progresses(migrated), { A: 0.5 });
  const occupiedLegacy = world.snapshot(); occupiedLegacy.modules.planting!.stateVersion = 1; occupiedLegacy.modules.planting!.state = { plots: { A: { crop: 'wheat', progress: 0.5 } } };
  assert.throws(() => restoreWorld(r, occupiedLegacy), /时钟基线/);
});
