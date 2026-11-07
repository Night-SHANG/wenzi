import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import { parseActionCommand } from '../src/presentation/actions.ts';
import { patchWorldPackage } from '../src/authoring/patch.ts';
import { inspectWorldPackage } from '../src/authoring/packages.ts';
import type { Command, JsonObject, WorldDefinition } from '../src/contracts.ts';

type World = ReturnType<typeof createWorld>;
function instance(definition: WorldDefinition, id: string) {
  const found = definition.modules.find(row => row.id === id);
  assert.ok(found, `missing instance ${id}`);
  return found;
}
function object(value: unknown): JsonObject {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as JsonObject;
}
function act(world: World, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function run(world: World, commands: Command[]) {
  for (const [index, command] of commands.entries()) {
    const result = world.dispatch(command);
    assert.equal(result.ok, true, JSON.stringify({ step: index + 1, command, result }));
  }
}
function coins(world: World, account: string): number {
  return object(world.query('wallet', 'balance', { account })).coins as number;
}
function quantity(world: World, container: string, item: string): number {
  return object(world.query('inventory', 'count', { container, item })).quantity as number;
}
function state(world: World, id: string): JsonObject {
  return object(world.snapshot().modules[id]!.state);
}
function finalState(world: World, expectedPlayer = 2, expectedSupplier = 4, vouchers = 2) {
  assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 190 });
  assert.equal(coins(world, 'player'), expectedPlayer);
  assert.equal(coins(world, 'supplier'), expectedSupplier);
  assert.equal(coins(world, 'player') + coins(world, 'supplier'), 6);
  assert.equal(quantity(world, 'supplier', 'seed'), 1);
  assert.equal(quantity(world, 'supplier', 'turnip'), 0);
  assert.equal(quantity(world, 'player', 'seed'), 0);
  assert.equal(quantity(world, 'player', 'turnip'), 0);
  assert.equal(quantity(world, 'player', 'meal'), 0);
  assert.equal(quantity(world, 'player', 'voucher'), vouchers);
  assert.deepEqual(state(world, 'shop'), { trades: 4 });
  assert.deepEqual(state(world, 'quests'), { active: {}, completed: { delivery: 2 } });
  assert.equal(state(world, 'seedworks').job, null);
  assert.equal(state(world, 'kitchen').job, null);
  assert.deepEqual(world.query('crops', 'plots'), { plots: [] });
}
async function setup(name = 'settlement') {
  const pack = await loadWorldPackage(name);
  return { pack, world: createWorld(builtinRegistry(), pack.world) };
}

test('two settlement clocks compose 63 definitions and complete the literal 32-command finite economy', async () => {
  assert.equal(builtinRegistry().catalog().length, 63);
  assert.equal((await worldNames()).length, 16);
  for (const name of ['settlement', 'settlement-continuous']) {
    const { pack, world } = await setup(name);
    assert.equal(pack.world.modules.length, 21);
    assert.equal(pack.demo.length, 32);
    assert.ok(pack.world.modules.every(row => !/^(vitals|battle|progression)\./.test(row.module)));
    assert.ok(pack.demo.every(command => !['add', 'credit', 'gain'].includes(command.action)));
    for (const [index, command] of pack.demo.entries()) {
      const result = world.dispatch(command);
      assert.equal(result.ok, true, JSON.stringify({ step: index + 1, result }));
      if (index + 1 === 3) {
        assert.equal(coins(world, 'player'), 0);
        assert.equal(coins(world, 'supplier'), 6);
        assert.equal(quantity(world, 'supplier', 'seed'), 0);
      }
      if (index + 1 === 11) {
        assert.equal(object(state(world, 'seedworks').job).readyAt, 40);
        assert.equal(object(state(world, 'kitchen').job).readyAt, 40);
      }
      if (index + 1 === 22) {
        assert.deepEqual(world.query('hours', 'status'), { open: false, opensInSeconds: 10, closesInSeconds: null });
      }
      if (index + 1 === 30) assert.equal(quantity(world, 'player', 'voucher'), 2);
      if (index + 1 === 31) {
        assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 150 });
        assert.deepEqual(world.query('hours', 'status'), { open: false, opensInSeconds: 40, closesInSeconds: null });
      }
    }
    finalState(world);
    assert.deepEqual(world.query('calendar', 'now'), {
      elapsedSeconds: 190, dayIndex: 3, dayOfWeek: 0, secondOfDay: 10, secondsPerDay: 60, daysPerWeek: 3,
    });
    assert.deepEqual(world.query('hours', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 40 });
    const before = world.snapshot();
    assert.ok(readTextView(world).lines.length > 0);
    world.query('shop', 'status');
    world.query('shop', 'quote', { side: 'buy', item: 'seed', quantity: 1 });
    world.query('calendar', 'now');
    world.query('hours', 'status');
    world.query('quests', 'list');
    assert.deepEqual(world.snapshot(), before);
    assert.deepEqual(restoreWorld(builtinRegistry(), before).snapshot(), before);
  }
});

test('active two workshops, a planted box, money and a delivery survive save and clock replacement', async () => {
  const pack = await loadWorldPackage('settlement');
  const definition = structuredClone(pack.world);
  const containers = object(instance(definition, 'inventory').config.containers);
  object(containers.player).items = { seed: 1 };
  const world = createWorld(builtinRegistry(), definition);
  run(world, pack.demo.slice(0, 11));
  act(world, 'crops', 'plant', { plot: 'extra box', crop: 'turnip' });
  const before = world.snapshot();
  assert.equal(object(state(world, 'seedworks').job).readyAt, 40);
  assert.equal(object(state(world, 'kitchen').job).readyAt, 40);
  assert.ok(Object.hasOwn(object(state(world, 'quests').active), 'delivery'));
  assert.equal(object(object(state(world, 'crops').plots)['extra box']).progress, 0);
  const restored = restoreWorld(builtinRegistry(), before);
  const clockSwap = restored.definition;
  instance(clockSwap, 'clock').module = 'time.continuous';
  instance(clockSwap, 'clock').config = {};
  const changed = reconfigureWorld(builtinRegistry(), restored, clockSwap);
  for (const command of pack.demo.slice(11)) {
    const converted = command.target === 'clock'
      ? { ...command, input: { seconds: (command.input!.steps as number) * 10 } }
      : command;
    run(changed, [converted]);
  }
  const direct = createWorld(builtinRegistry(), definition);
  run(direct, pack.demo.slice(0, 11));
  act(direct, 'crops', 'plant', { plot: 'extra box', crop: 'turnip' });
  run(direct, pack.demo.slice(11));
  for (const row of definition.modules) assert.deepEqual(state(changed, row.id), state(direct, row.id));
  assert.deepEqual(changed.query('crops', 'plots'), { plots: [{ id: 'extra box', crop: 'turnip', name: '芜菁', progress: 1 }] });
  assert.equal(quantity(changed, 'player', 'voucher'), 2);
  assert.deepEqual(world.snapshot(), before);
  assert.deepEqual(restored.snapshot(), before);
});

test('fixed-to-stock replacement preserves holdings and changes the very next real trade', async () => {
  const pack = await loadWorldPackage('settlement');
  object(object(instance(pack.world, 'wallet').config.accounts).player).coins = 6;
  const world = createWorld(builtinRegistry(), pack.world);
  act(world, 'clock', 'advance', { steps: 1 });
  const before = world.snapshot();
  assert.equal(object(world.query('shop', 'quote', { side: 'buy', item: 'seed', quantity: 1 })).total, 2);
  const definition = world.definition;
  instance(definition, 'price').module = 'trade-price.stock';
  const changed = reconfigureWorld(builtinRegistry(), world, definition);
  assert.deepEqual(state(changed, 'wallet'), state(world, 'wallet'));
  assert.deepEqual(state(changed, 'inventory'), state(world, 'inventory'));
  assert.equal(object(changed.query('shop', 'quote', { side: 'buy', item: 'seed', quantity: 1 })).total, 4);
  act(changed, 'shop', 'buy', { item: 'seed', quantity: 1 });
  assert.equal(coins(changed, 'player'), 2);
  assert.equal(coins(changed, 'supplier'), 8);
  assert.equal(quantity(changed, 'player', 'seed'), 1);
  assert.equal(quantity(changed, 'supplier', 'seed'), 0);
  assert.deepEqual(world.snapshot(), before);
});

test('schedule-to-always at time zero changes next trade while preserving money and goods', async () => {
  const { world } = await setup();
  const before = world.snapshot();
  const closed = object(world.query('shop', 'quote', { side: 'buy', item: 'seed', quantity: 1 }));
  assert.equal(closed.available, false);
  assert.deepEqual(closed.reasons, ['CLOSED']);
  const definition = world.definition;
  instance(definition, 'hours').module = 'availability.always';
  instance(definition, 'hours').config = {};
  instance(definition, 'hours').bindings = {};
  const changed = reconfigureWorld(builtinRegistry(), world, definition);
  assert.deepEqual(state(changed, 'wallet'), state(world, 'wallet'));
  assert.deepEqual(state(changed, 'inventory'), state(world, 'inventory'));
  assert.equal(object(changed.query('shop', 'quote', { side: 'buy', item: 'seed', quantity: 1 })).available, true);
  act(changed, 'shop', 'buy', { item: 'seed', quantity: 1 });
  assert.equal(coins(changed, 'player'), 0);
  assert.equal(coins(changed, 'supplier'), 6);
  assert.equal(quantity(changed, 'player', 'seed'), 1);
  assert.deepEqual(world.snapshot(), before);
});

test('real customer and supplier capacity failures roll back payment and retry exactly once after repair', async () => {
  for (const supplier of [false, true]) {
    const pack = await loadWorldPackage('settlement');
    const containers = object(instance(pack.world, 'inventory').config.containers);
    const limited = object(containers[supplier ? 'supplier' : 'player']);
    object(limited.limits).slots = supplier ? 1 : 0;
    if (supplier) object(containers.player).items = { turnip: 1 };
    const world = createWorld(builtinRegistry(), pack.world);
    act(world, 'clock', 'advance', { steps: 1 });
    const command: Command = { id: supplier ? 'supplier-full-once' : 'customer-full-once', target: 'shop', action: supplier ? 'sell' : 'buy', input: { item: supplier ? 'turnip' : 'seed', quantity: 1 } };
    const before = world.snapshot();
    assert.equal(object(world.query('shop', 'quote', { ...command.input!, side: command.action })).available, true);
    const failure = world.dispatch(command);
    assert.equal(failure.ok, false);
    if (!failure.ok) assert.equal(failure.error.code, 'CAPACITY_EXCEEDED');
    assert.deepEqual(world.snapshot(), before);
    const definition = world.definition;
    object(object(object(instance(definition, 'inventory').config.containers)[supplier ? 'supplier' : 'player']).limits).slots = 6;
    const repaired = reconfigureWorld(builtinRegistry(), world, definition);
    assert.equal(repaired.dispatch(command).ok, true);
    assert.equal(coins(repaired, 'player'), supplier ? 4 : 0);
    assert.equal(coins(repaired, 'supplier'), supplier ? 2 : 6);
    assert.deepEqual(state(repaired, 'shop'), { trades: 1 });
    const paid = repaired.snapshot();
    const replay = repaired.dispatch(command);
    assert.equal(replay.ok, true);
    if (replay.ok) assert.equal(replay.replayed, true);
    assert.deepEqual(repaired.snapshot(), paid);
    assert.deepEqual(world.snapshot(), before);
  }
});

test('paid workshops freeze recipe terms across edit or deletion and finish while newly closed hours reject trades', async () => {
  for (const removed of [false, true]) {
    const { pack, world } = await setup();
    run(world, pack.demo.slice(0, 11));
    const before = world.snapshot();
    const definition = world.definition;
    for (const [id, recipe] of [['supplier-recipes', 'press'], ['kitchen-recipes', 'cook']]) {
      const recipes = object(instance(definition, id!).config.recipes);
      if (removed) delete recipes[recipe!];
      else {
        object(recipes[recipe!]).outputs = { voucher: 3 };
        object(recipes[recipe!]).durationSeconds = 100;
      }
    }
    instance(definition, 'hours').config.days = [2];
    const changed = reconfigureWorld(builtinRegistry(), world, definition);
    assert.equal(object(changed.query('hours', 'status')).open, false);
    assert.deepEqual(state(changed, 'seedworks'), state(world, 'seedworks'));
    assert.deepEqual(state(changed, 'kitchen'), state(world, 'kitchen'));
    act(changed, 'clock', 'advance', { steps: 1 });
    assert.equal(object(changed.query('hours', 'status')).open, false);
    act(changed, 'seedworks', 'collect');
    act(changed, 'kitchen', 'collect');
    assert.equal(quantity(changed, 'supplier', 'seed'), 1);
    assert.equal(quantity(changed, 'player', 'meal'), 1);
    assert.equal(quantity(changed, 'player', 'voucher'), 0);
    const closed = changed.snapshot();
    const failure = changed.dispatch({ target: 'shop', action: 'buy', input: { item: 'seed', quantity: 1 } });
    assert.equal(failure.ok, false);
    if (!failure.ok) assert.equal(failure.error.code, 'TRADE_UNAVAILABLE');
    assert.deepEqual(changed.snapshot(), closed);
    assert.deepEqual(world.snapshot(), before);
    const bad = world.definition;
    object(object(instance(bad, 'kitchen-recipes').config.recipes).cook).outputs = { absent: 1 };
    assert.throws(() => reconfigureWorld(builtinRegistry(), world, bad));
    assert.deepEqual(world.snapshot(), before);
  }
});

test('removing all text views leaves a third paid production and delivery cycle playable', async () => {
  const pack = await loadWorldPackage('settlement');
  const definition = structuredClone(pack.world);
  definition.modules = definition.modules.filter(row => !row.module.startsWith('view.'));
  delete definition.entryView;
  const world = createWorld(builtinRegistry(), definition);
  run(world, pack.demo);
  finalState(world);
  act(world, 'quests', 'accept', { quest: 'delivery' });
  run(world, pack.demo.slice(2, 15));
  assert.equal(quantity(world, 'player', 'voucher'), 3);
  assert.equal(coins(world, 'player'), 2);
  assert.equal(coins(world, 'supplier'), 4);
  assert.equal(quantity(world, 'supplier', 'seed'), 1);
  assert.equal(quantity(world, 'supplier', 'turnip'), 0);
  assert.deepEqual(state(world, 'shop'), { trades: 6 });
  assert.deepEqual(state(world, 'quests'), { active: {}, completed: { delivery: 3 } });
});

test('all 21 renamed Unicode and quoted instance IDs bind correctly and actionable hints dispatch to both workshops', async () => {
  const pack = await loadWorldPackage('settlement');
  const names = new Map(pack.world.modules.map(row => [row.id, `城镇 "${row.id}" 😀`]));
  assert.equal(names.size, 21);
  for (const row of pack.world.modules) {
    row.id = names.get(row.id)!;
    for (const [key, value] of Object.entries(row.bindings ?? {})) row.bindings![key] = names.get(value)!;
  }
  pack.world.entryView!.instance = names.get(pack.world.entryView!.instance)!;
  for (const command of pack.demo) command.target = names.get(command.target)!;
  const world = createWorld(builtinRegistry(), pack.world);
  const hinted = (target: string, action: string, input: JsonObject) => {
    const before = world.snapshot();
    const commands = readTextView(world).lines.flatMap(line => {
      const offset = line.indexOf('do ');
      return offset < 0 ? [] : [parseActionCommand(line.slice(offset + 3))];
    });
    assert.deepEqual(world.snapshot(), before);
    const command = commands.find(row => row.target === names.get(target) && row.action === action && JSON.stringify(row.input) === JSON.stringify(input));
    assert.ok(command, `missing hint ${target}.${action}: ${JSON.stringify(commands)}`);
    assert.equal(world.dispatch(command).ok, true);
  };
  run(world, pack.demo.slice(0, 2));
  hinted('shop', 'buy', { item: 'seed', quantity: 1 });
  run(world, pack.demo.slice(3, 8));
  hinted('shop', 'sell', { item: 'turnip', quantity: 1 });
  hinted('seedworks', 'start', { recipe: 'press', batches: 1 });
  hinted('kitchen', 'start', { recipe: 'cook', batches: 1 });
  run(world, pack.demo.slice(11, 12));
  hinted('seedworks', 'collect', {});
  hinted('kitchen', 'collect', {});
  run(world, pack.demo.slice(14));
  assert.deepEqual(object(world.query(names.get('wallet')!, 'balance', { account: 'player' })), { account: 'player', coins: 2 });
  assert.deepEqual(object(world.query(names.get('wallet')!, 'balance', { account: 'supplier' })), { account: 'supplier', coins: 4 });
  assert.deepEqual(world.query(names.get('inventory')!, 'count', { container: 'player', item: 'voucher' }), { quantity: 2 });
  assert.deepEqual(state(world, names.get('shop')!), { trades: 4 });
});

test('author patch to seed buy price changes actual balances to four and two without changing original package', async () => {
  const pack = await loadWorldPackage('settlement');
  const before = structuredClone(pack);
  const index = pack.world.modules.findIndex(row => row.id === 'shop-rules');
  const changed = patchWorldPackage(pack, [
    { op: 'test', path: `/world/modules/${index}/id`, value: 'shop-rules' },
    { op: 'replace', path: `/world/modules/${index}/config/shops/riverside/offers/seed/buy`, value: 1 },
  ]);
  const check = inspectWorldPackage(builtinRegistry(), changed, { runDemo: true });
  assert.equal(check.ok, true, JSON.stringify(check));
  const world = createWorld(builtinRegistry(), changed.world);
  run(world, changed.demo);
  finalState(world, 4, 2);
  assert.deepEqual(pack, before);
});
