import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, restoreWorld } from '../src/engine/index.ts';
import { loadWorldPackage } from '../src/worlds.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';

const target = { id: 'fang', name: '前锋', hp: 12, maxHp: 12 };
const other = { id: 'howl', name: '游击', hp: 14, maxHp: 14 };
const actionProvider: ModuleDefinition = {
  manifest: {
    id: 'test.combat-action', title: 'Generic action fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'combat-action': '1.0.0' }, requires: { attributes: { version: '^1.0.0' } },
  },
  initialState: () => ({ phase: 'active', canAct: true, targets: [target, other] }),
  queries: { actionStatus: { execute: ctx => Object.hasOwn(ctx.config, 'status') ? ctx.config.status! : ctx.state<JsonObject>() } },
  commands: {
    performStrike: { execute(ctx, input) {
      const state = ctx.state<JsonObject>();
      const targets = state.targets as JsonObject[];
      const chosen = targets.find(row => row.id === input.target);
      if (!chosen) return ctx.fail('BAD_TARGET', '目标不在列表');
      const values = (ctx.query('attributes', 'status') as JsonObject).values as JsonObject;
      chosen.hp = Math.max(0, (chosen.hp as number) - (values.attack as number) - (input.attackBonus as number));
      state.targets = targets.filter(row => (row.hp as number) > 0);
      state.canAct = false;
      ctx.write(state);
      if (ctx.config.reject) ctx.fail('ACTION_REJECTED', '下游拒绝');
      return Object.hasOwn(ctx.config, 'result') ? ctx.config.result! : state;
    } },
  },
};
const recordsProvider: ModuleDefinition = {
  manifest: { id: 'test.encounter-records', title: 'Records fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'encounter-records': '1.0.0' } },
  initialState: () => ({ wins: { wolf: 7, raider: 0 } }),
  queries: {
    records: { execute: ctx => Object.hasOwn(ctx.config, 'badRecords') ? ctx.config.badRecords! : ctx.state<JsonObject>() },
    describe: { execute: (ctx, input) => Object.hasOwn(ctx.config, 'badDescription') ? ctx.config.badDescription! : { id: input.encounter! } },
  },
  commands: { win: { execute(ctx) { const state = ctx.state<{ wins: Record<string, number> }>(); state.wins.wolf!++; ctx.write(state); return state; } } },
};
function registry() { const result = builtinRegistry(); result.register(actionProvider); result.register(recordsProvider); return result; }
function instance(world: WorldDefinition, id: string) { const found = world.modules.find(row => row.id === id); assert.ok(found); return found; }
async function definition(genericOnly = true) {
  const world = (await loadWorldPackage('loadout')).world;
  if (genericOnly) {
    world.modules = world.modules.filter(row => !['encounters', 'encounter-rules', 'quests', 'quest-rules', 'campaign-view', 'loadout-view'].includes(row.id));
    delete world.entryView;
    delete instance(world, 'skills').bindings!.encounters;
  }
  world.modules.push({ id: 'action', module: 'test.combat-action', config: {} });
  instance(world, 'skills').bindings = { ...instance(world, 'skills').bindings, 'combat-action': 'action' };
  return world;
}
type World = ReturnType<typeof createWorld>;
function ok(world: World, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw Error('command failed');
  return result.value as JsonObject;
}
function fail(world: World, target: string, action: string, input: JsonObject = {}, code?: string) {
  const before = world.snapshot(), result = world.dispatch({ target, action, input });
  assert.equal(result.ok, false);
  if (!result.ok && code) assert.equal(result.error.code, code);
  assert.deepEqual(world.snapshot(), before);
}
function equip(world: World) { ok(world, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); }
function rows(world: World) { return (world.query('skills', 'list') as JsonObject).skills as JsonObject[]; }

test('generic skill targets apply leader effect before a real inventory payment and preserve all state on bad target', async () => {
  const world = createWorld(registry(), await definition()); equip(world);
  assert.deepEqual(rows(world)[0]!.targets, [target, other]);
  fail(world, 'skills', 'use', { skill: 'cleave' });
  fail(world, 'skills', 'use', { skill: 'cleave', target: 'absent' });
  const result = ok(world, 'skills', 'use', { skill: 'cleave', target: 'fang' });
  assert.equal(result.readyAt, 10);
  assert.deepEqual((result.battle as JsonObject).targets, [{ ...target, hp: 1 }, other]);
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'spark' }), { quantity: 2 });
  assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 0 });
  assert.equal(rows(world)[0]!.available, false);
  const saved = world.snapshot();
  assert.deepEqual(restoreWorld(registry(), saved).snapshot(), saved);
});

test('generic skill late action failure and lying return roll back costs, effects, action state and cooldown', async () => {
  for (const config of [{ reject: true }, { result: { phase: 'idle', canAct: false, targets: [] } }, { result: { phase: 'active', canAct: true, targets: [target, other] } }]) {
    const d = await definition(); instance(d, 'action').config = config;
    const world = createWorld(registry(), d); equip(world);
    fail(world, 'skills', 'use', { skill: 'cleave', target: 'fang' });
  }
});

test('generic skill validates every consumed target/phase field and leader turn availability', async () => {
  const valid = { phase: 'active', canAct: true, targets: [target] };
  for (const status of [null, {}, { ...valid, canAct: 1 }, { ...valid, targets: [] }, { ...valid, targets: [target, target] }, { ...valid, targets: [{ ...target, hp: 0 }] }, { ...valid, targets: [{ ...target, hp: 13 }] }, { ...valid, phase: 'victory' }]) {
    const d = await definition(); instance(d, 'action').config.status = status;
    assert.throws(() => createWorld(registry(), d));
  }
  const d = await definition(); instance(d, 'action').config.status = { ...valid, canAct: false };
  const world = createWorld(registry(), d); equip(world);
  assert.equal(rows(world)[0]!.available, false);
  fail(world, 'skills', 'use', { skill: 'cleave', target: 'fang' });
});

test('skills source selection permits mixed controllers and refuses silent optional-capability rerouting', async () => {
  const ambiguous = await definition(false);
  assert.throws(() => createWorld(registry(), ambiguous), (error: any) => error.code === 'AMBIGUOUS_COMBAT');
  for (const source of ['encounters', 'combat-action']) {
    const d = await definition(false); instance(d, 'skills').config.battleSource = source;
    const world = createWorld(registry(), d); equip(world);
    if (source === 'encounters') {
      ok(world, 'location', 'move', { to: 'forest' }); ok(world, 'encounters', 'start', { encounter: 'wolf' });
      const beforeAction = world.snapshot().modules.action;
      fail(world, 'skills', 'use', { skill: 'cleave', target: 'howl' });
      ok(world, 'skills', 'use', { skill: 'cleave', target: 'wolf' });
      assert.deepEqual(world.snapshot().modules.action, beforeAction);
      assert.equal(((world.query('encounters', 'status') as JsonObject).battle as JsonObject).enemyHp, 1);
      assert.equal(Object.hasOwn(rows(world)[0]!, 'targets'), false);
    } else {
      ok(world, 'skills', 'use', { skill: 'cleave', target: 'fang' });
      assert.equal((world.query('encounters', 'status') as JsonObject).phase, 'idle');
    }
  }
  const missing = await definition(); instance(missing, 'skills').config.battleSource = 'encounters';
  assert.throws(() => createWorld(registry(), missing));
});

test('skills 1.0.0 migration preserves cooldown and rejects unknown saved identity', async () => {
  const d = (await loadWorldPackage('loadout')).world;
  const world = createWorld(registry(), d); equip(world);
  ok(world, 'location', 'move', { to: 'forest' }); ok(world, 'encounters', 'start', { encounter: 'wolf' });
  ok(world, 'skills', 'use', { skill: 'cleave' });
  const saved = world.snapshot(); saved.modules.skills!.definitionVersion = '1.0.0';
  const migrated = restoreWorld(registry(), saved);
  assert.equal(migrated.snapshot().modules.skills!.definitionVersion, '1.1.0');
  assert.deepEqual(migrated.snapshot().modules.skills!.state, saved.modules.skills!.state);
  saved.modules.skills!.definitionVersion = '0.9.0'; assert.throws(() => restoreWorld(registry(), saved));
});

async function questDefinition(source?: string) {
  const d = (await loadWorldPackage('loadout')).world;
  instance(d, 'quest-rules').config.quests = { patrol: { name: '巡查', description: '', prerequisites: [], delivery: {}, victories: { wolf: 1 }, rewards: {}, experience: 0, locations: [], repeatable: true } };
  d.modules.push({ id: 'records', module: 'test.encounter-records', config: {} });
  instance(d, 'quests').bindings = { ...instance(d, 'quests').bindings, 'encounter-records': 'records' };
  if (source) instance(d, 'quests').config.victorySource = source;
  return d;
}
test('quests explicitly bind narrow records and retain accepted baseline without singular enemy data', async () => {
  const d = await questDefinition('encounter-records');
  const world = createWorld(registry(), d); ok(world, 'quests', 'accept', { quest: 'patrol' });
  const save = world.snapshot();
  assert.deepEqual(((((save.modules.quests!.state as JsonObject).active as JsonObject).patrol as JsonObject).baselineWins), { wolf: 7 });
  const restored = restoreWorld(registry(), save); ok(restored, 'records', 'win'); ok(restored, 'quests', 'turnIn', { quest: 'patrol' });
  assert.deepEqual((restored.snapshot().modules.quests!.state as JsonObject).completed, { patrol: 1 });
  assert.deepEqual(restored.query('encounters', 'records'), { wins: {} });
  ok(restored, 'quests', 'accept', { quest: 'patrol' });
  assert.deepEqual(((restored.query('quests', 'list') as JsonObject).quests as JsonObject[])[0]!.remainingVictories, { wolf: 1 });
});

test('quests reject ambiguous/malformed records, explicitly retain legacy source, and migrate old baselines', async () => {
  const ambiguous = await questDefinition();
  assert.throws(() => createWorld(registry(), ambiguous), (error: any) => error.code === 'AMBIGUOUS_ENCOUNTERS');
  for (const badRecords of [null, {}, { wins: { wolf: -1 } }, { wins: { wolf: 0.5 } }] as JsonValue[]) {
    const d = await questDefinition('encounter-records'); instance(d, 'records').config.badRecords = badRecords;
    assert.throws(() => createWorld(registry(), d));
  }
  const bad = await questDefinition('encounter-records'); instance(bad, 'records').config.badDescription = { id: 'wrong' };
  assert.throws(() => createWorld(registry(), bad));
  const world = createWorld(registry(), await questDefinition('encounters'));
  ok(world, 'quests', 'accept', { quest: 'patrol' }); ok(world, 'records', 'win');
  assert.deepEqual(((world.query('quests', 'list') as JsonObject).quests as JsonObject[])[0]!.remainingVictories, { wolf: 1 });
  fail(world, 'quests', 'turnIn', { quest: 'patrol' });
  const saved = world.snapshot(); saved.modules.quests!.definitionVersion = '1.0.0';
  const restored = restoreWorld(registry(), saved);
  assert.equal(restored.snapshot().modules.quests!.definitionVersion, '1.2.0');
  assert.deepEqual(restored.snapshot().modules.quests!.state, saved.modules.quests!.state);
  saved.modules.quests!.definitionVersion = '0.9.0'; assert.throws(() => restoreWorld(registry(), saved));
});
