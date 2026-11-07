import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { capacityModules, safeCount } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { questRulesModule } from '../src/modules/quest-rules.ts';
import { questsModule } from '../src/modules/quests.ts';

const progression: ModuleDefinition = {
  manifest: { id: 'test.settlement-progression', title: '公开经验提供者', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' } },
  initialState: () => ({ experience: 0 }),
  queries: { status: { execute: ctx => ctx.config.invalid ? null : ctx.state() } },
  commands: { gain: { execute(ctx, input) {
    const experience = safeCount(ctx, ctx.state<{ experience: number }>().experience + (input.amount as number), '经验');
    ctx.write({ experience });
    return { experience };
  } } },
};
function registry() { return new ModuleRegistry([...capacityModules, inventoryModule, questRulesModule, questsModule, progression]); }
function definition(experience = 0, withProgression = false): WorldDefinition {
  return { id: 'test.settlement-orders', title: '纯经营订单', version: '1', modules: [
    { id: 'capacity', module: 'capacity.slots', config: {} },
    { id: 'inventory', module: 'inventory.basic', config: {
      items: Object.fromEntries(['meal', 'voucher'].map(id => [id, { name: id, weight: 1, volume: 1, length: 1 }])),
      containers: { player: { limits: { slots: 2 }, items: { meal: 2, voucher: 0 } } },
    } },
    { id: 'rules', module: 'quests.catalog', config: { quests: { delivery: {
      name: '餐食订单', description: '交付一份餐食', prerequisites: [], delivery: { meal: 1 }, victories: {},
      rewards: { voucher: 1 }, experience, locations: [], repeatable: true,
    } } } },
    { id: 'quests', module: 'quests.journal', config: { container: 'player' } },
    ...(withProgression ? [{ id: 'progression', module: progression.manifest.id, config: {} }] : []),
  ] };
}
type World = ReturnType<typeof createWorld>;
function ok(world: World, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function instance(world: WorldDefinition, id: string) {
  const value = world.modules.find(row => row.id === id);
  assert.ok(value);
  return value;
}
function missingProgression(error: unknown) {
  assert.equal((error as { code: string }).code, 'MISSING_PROGRESSION');
  return true;
}

test('zero-experience delivery orders run twice without any progression or combat provider', () => {
  const world = createWorld(registry(), definition());
  const before = world.snapshot();
  assert.equal((world.query('quests', 'list') as { quests: JsonObject[] }).quests[0]!.experience, 0);
  assert.deepEqual(world.snapshot(), before);
  for (let cycle = 0; cycle < 2; cycle++) {
    ok(world, 'quests', 'accept', { quest: 'delivery' });
    ok(world, 'quests', 'turnIn', { quest: 'delivery' });
  }
  assert.deepEqual(world.read('quests'), { active: {}, completed: { delivery: 2 } });
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'meal' }), { quantity: 0 });
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'voucher' }), { quantity: 2 });
  assert.deepEqual(restoreWorld(registry(), world.snapshot()).snapshot(), world.snapshot());
});

test('current positive experience promises still require a real progression capability', () => {
  assert.throws(() => createWorld(registry(), definition(5)), missingProgression);
  const world = createWorld(registry(), definition(5, true));
  ok(world, 'quests', 'accept', { quest: 'delivery' });
  ok(world, 'quests', 'turnIn', { quest: 'delivery' });
  assert.deepEqual(world.query('progression', 'status'), { experience: 5 });
});

test('editing or deleting a current quest cannot erase its frozen experience promise', () => {
  for (const removeCurrent of [false, true]) {
    const world = createWorld(registry(), definition(5, true));
    ok(world, 'quests', 'accept', { quest: 'delivery' });
    const before = world.snapshot(), next = structuredClone(before.definition);
    next.modules = next.modules.filter(row => row.id !== 'progression');
    const terms = instance(next, 'rules').config.quests as Record<string, JsonObject>;
    if (removeCurrent) delete terms.delivery;
    else terms.delivery!.experience = 0;
    assert.throws(() => reconfigureWorld(registry(), world, next, { allowRemoved: ['progression'] }), missingProgression);
    assert.deepEqual(world.snapshot(), before);
    ok(world, 'quests', 'turnIn', { quest: 'delivery' });
    assert.deepEqual(world.query('progression', 'status'), { experience: 5 });
  }
});

test('journal migrations from exact 1.0 and 1.1 preserve accepted terms and completion history', () => {
  for (const version of ['1.0.0', '1.1.0']) {
    const world = createWorld(registry(), definition(5, true));
    ok(world, 'quests', 'accept', { quest: 'delivery' });
    ok(world, 'quests', 'turnIn', { quest: 'delivery' });
    ok(world, 'quests', 'accept', { quest: 'delivery' });
    const saved = world.snapshot();
    saved.modules.quests!.definitionVersion = version;
    const restored = restoreWorld(registry(), saved);
    assert.equal(restored.snapshot().modules.quests!.definitionVersion, '1.2.0');
    assert.deepEqual(restored.read('quests'), world.read('quests'));
    ok(restored, 'quests', 'turnIn', { quest: 'delivery' });
    assert.deepEqual(restored.query('progression', 'status'), { experience: 10 });
    assert.deepEqual(restored.read('quests'), { active: {}, completed: { delivery: 2 } });
  }
});

test('unknown journal identities and state versions cannot be silently cleared', () => {
  const world = createWorld(registry(), definition(0, true));
  for (const change of [
    { definitionVersion: '1.0.1' }, { definitionVersion: '0.9.0' },
    { definitionVersion: '1.1.0', stateVersion: 2 }, { definitionId: 'other.journal' },
  ]) {
    const saved = world.snapshot();
    Object.assign(saved.modules.quests!, change);
    assert.throws(() => restoreWorld(registry(), saved));
  }
});

test('an installed malformed progression remains invalid even for zero-XP orders', () => {
  const pack = definition(0, true);
  instance(pack, 'progression').config.invalid = true;
  assert.throws(() => createWorld(registry(), pack), /成长/);
});

test('zero-XP delivery keeps its atomic inventory failure and retry behavior', () => {
  const pack = definition();
  const player = (instance(pack, 'inventory').config.containers as Record<string, JsonObject>).player!;
  player.limits = { slots: 1 };
  const world = createWorld(registry(), pack);
  ok(world, 'quests', 'accept', { quest: 'delivery' });
  const before = world.snapshot();
  assert.equal(world.dispatch({ target: 'quests', action: 'turnIn', input: { quest: 'delivery' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  ok(world, 'inventory', 'remove', { container: 'player', item: 'meal', quantity: 1 });
  ok(world, 'quests', 'turnIn', { quest: 'delivery' });
  assert.deepEqual(world.read('quests'), { active: {}, completed: { delivery: 1 } });
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'voucher' }), { quantity: 1 });
});
