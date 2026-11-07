import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { WorldRuntime } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import { parseActionCommand } from '../src/presentation/actions.ts';
import { patchWorldPackage } from '../src/authoring/patch.ts';
import { inspectWorldPackage } from '../src/authoring/packages.ts';
import type { JsonObject, ModuleInstance, WorldDefinition } from '../src/contracts.ts';

async function setup(name = 'loadout') {
  assert.ok((await worldNames()).includes(name), `${name} must be discoverable`);
  const pack = await loadWorldPackage(name);
  return { pack, world: createWorld(builtinRegistry(), pack.world) };
}
function act(world: WorldRuntime, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function instance(definition: WorldDefinition, id: string): ModuleInstance {
  const row = definition.modules.find(row => row.id === id); assert.ok(row); return row;
}
function bag(world: WorldRuntime): JsonObject {
  return ((world.snapshot().modules.inventory!.state as JsonObject).containers as JsonObject).player as JsonObject;
}
function attributes(world: WorldRuntime): JsonObject { return (world.query('attributes', 'status') as JsonObject).values as JsonObject; }
function finalState(world: WorldRuntime) {
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 105);
  assert.equal((world.query('progression', 'status') as JsonObject).level, 3);
  assert.deepEqual(world.query('vitals', 'status'), { hp: 34, maxHp: 34 });
  assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 90 });
  assert.deepEqual(world.query('market', 'balance'), { coins: 16 });
  assert.deepEqual(world.query('encounters', 'records'), { wins: { wolf: 2, raider: 1 } });
  assert.deepEqual(world.query('encounters', 'status'), { phase: 'idle', battle: null });
  assert.deepEqual((world.snapshot().modules.quests!.state as JsonObject).completed, { supply: 1, patrol: 1, guard: 1 });
  assert.deepEqual(attributes(world), { maxHp: 34, attack: 10, defense: 4 });
  assert.deepEqual((world.query('effects', 'status') as JsonObject).effects, []);
  const items = bag(world);
  assert.deepEqual([items.sword, items.knife, items.armor, items.spark, items.tonic, items.badge, items.medal], [0, 1, 0, 0, 0, 1, 1]);
}

test('both loadout clocks complete the real equipment, skills, quests and expired-effect route', async () => {
  for (const name of ['loadout', 'loadout-continuous']) {
    const { pack, world } = await setup(name);
    assert.equal(pack.demo.length, 48);
    for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true, JSON.stringify(command));
    finalState(world);
    const before = world.snapshot(), view = readTextView(world);
    assert.ok(view.lines.some(line => line.includes('训练剑')));
    assert.ok(view.lines.some(line => line.includes('攻击 10')));
    assert.ok(view.lines.some(line => line.includes('基础 8') && line.includes('装备 +2')));
    assert.deepEqual(world.snapshot(), before);
    assert.deepEqual(restoreWorld(builtinRegistry(), before).snapshot(), before);
  }
});

test('an active skilled battle restores and continues with a different clock without changing earlier facts', async () => {
  const { pack, world } = await setup();
  const firstSkill = pack.demo.findIndex(command => command.target === 'skills');
  assert.ok(firstSkill > 0);
  for (const command of pack.demo.slice(0, firstSkill + 1)) assert.equal(world.dispatch(command).ok, true);
  assert.deepEqual(world.query('vitals', 'status'), { hp: 17, maxHp: 20 });
  assert.equal(((world.query('encounters', 'status') as JsonObject).battle as JsonObject).enemyHp, 1);
  assert.deepEqual(attributes(world), { maxHp: 20, attack: 8, defense: 2 });
  assert.equal(bag(world).spark, 2);
  const saved = world.snapshot(), restored = restoreWorld(builtinRegistry(), saved);
  const switched = reconfigureWorld(builtinRegistry(), restored, (await loadWorldPackage('loadout-continuous')).world);
  for (const command of pack.demo.slice(firstSkill + 1)) {
    const next = command.target === 'clock' ? { ...command, input: { seconds: (command.input!.steps as number) * 10 } } : command;
    assert.equal(switched.dispatch(next).ok, true, JSON.stringify(next));
  }
  finalState(switched);
  assert.deepEqual(restored.snapshot(), saved);
});

test('real skill failure leaves costs, effects, enemy, player and cooldown untouched', async () => {
  const { pack, world } = await setup();
  const firstSkill = pack.demo.findIndex(command => command.target === 'skills');
  for (const command of pack.demo.slice(0, firstSkill + 1)) assert.equal(world.dispatch(command).ok, true);
  let before = world.snapshot();
  assert.equal(world.dispatch({ target: 'skills', action: 'use', input: { skill: 'cleave' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  act(world, 'equipment', 'unequip', { slot: 'hand' });
  act(world, 'clock', 'advance', { steps: 1 });
  before = world.snapshot();
  assert.equal(world.dispatch({ target: 'skills', action: 'use', input: { skill: 'cleave' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  const next = structuredClone(world.definition);
  // A legal modifier for the catalog is forbidden by this world's additive policy.
  const effects = instance(next, 'effect-rules').config.effects as JsonObject;
  (effects.rally as JsonObject).modifiers = { maxHp: 10 };
  const changed = reconfigureWorld(builtinRegistry(), world, next);
  act(changed, 'equipment', 'equip', { item: 'sword', slot: 'hand' });
  before = changed.snapshot();
  const failed = changed.dispatch({ target: 'skills', action: 'use', input: { skill: 'cleave' } });
  assert.equal(failed.ok, false);
  assert.deepEqual(changed.snapshot(), before);
});

test('duration strategy replacement preserves an active effect and changes only reapplication', async () => {
  const { world } = await setup();
  act(world, 'effects', 'apply', { effect: 'rally' });
  act(world, 'clock', 'advance', { steps: 1 });
  const next = structuredClone(world.definition);
  instance(next, 'effect-duration').module = 'effect-duration.extend';
  // Stateless strategy replacement needs the explicit empty-state migration of each provider.
  const changed = reconfigureWorld(builtinRegistry(), world, next);
  assert.equal(((changed.query('effects', 'status') as JsonObject).effects as JsonObject[])[0]!.expiresAt, 20);
  act(changed, 'effects', 'apply', { effect: 'rally' });
  assert.equal(((changed.query('effects', 'status') as JsonObject).effects as JsonObject[])[0]!.expiresAt, 40);
  act(changed, 'clock', 'advance', { steps: 3 });
  assert.deepEqual((changed.query('effects', 'status') as JsonObject).effects, []);
  assert.deepEqual(attributes(changed), { maxHp: 20, attack: 4, defense: 1 });
});

test('loadout gameplay remains complete when every text view is removed', async () => {
  const { pack } = await setup();
  pack.world.modules = pack.world.modules.filter(row => !['view', 'campaign-view', 'loadout-view'].includes(row.id));
  delete pack.world.entryView;
  const world = createWorld(builtinRegistry(), pack.world);
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  finalState(world);
});

test('composed equipment and skill hints use quoted actual bindings and execute against real providers', async () => {
  const { pack } = await setup();
  const ids = new Map(pack.world.modules.map(row => [row.id, `模块 "${row.id}" 😀`]));
  for (const row of pack.world.modules) {
    row.id = ids.get(row.id)!;
    for (const key of Object.keys(row.bindings ?? {})) row.bindings![key] = ids.get(row.bindings![key]!)!;
  }
  pack.world.entryView!.instance = ids.get('loadout-view')!;
  const world = createWorld(builtinRegistry(), pack.world);
  const lines = readTextView(world).lines;
  const commands = lines.filter(line => line.includes('do {')).map(line => parseActionCommand(line.slice(line.indexOf('do {') + 3)));
  const equip = commands.find(command => command.target === ids.get('equipment') && command.action === 'equip' && command.input!.item === 'sword');
  assert.ok(equip); assert.equal(world.dispatch(equip).ok, true);
  act(world, ids.get('location')!, 'move', { to: 'forest' });
  act(world, ids.get('encounters')!, 'start', { encounter: 'wolf' });
  const skillLine = readTextView(world).lines.find(line => line.includes('do {') && line.includes('cleave'));
  assert.ok(skillLine);
  assert.equal(world.dispatch(parseActionCommand(skillLine.slice(skillLine.indexOf('do {') + 3))).ok, true);
  assert.equal((((world.query(ids.get('encounters')!, 'status') as JsonObject).battle as JsonObject).enemyHp), 1);
});

test('author patch changes a real skill resource cost and preserves independent old campaign behavior', async () => {
  const { pack } = await setup();
  const index = pack.world.modules.findIndex(row => row.id === 'skill-rules');
  const authored = patchWorldPackage(pack, [
    { op: 'test', path: `/world/modules/${index}/id`, value: 'skill-rules' },
    { op: 'replace', path: `/world/modules/${index}/config/skills/cleave/costs`, value: {} },
  ]);
  const inspection = inspectWorldPackage(builtinRegistry(), authored, { runDemo: true });
  assert.equal(inspection.ok, true);
  const world = createWorld(builtinRegistry(), authored.world);
  for (const command of authored.demo) assert.equal(world.dispatch(command).ok, true);
  assert.equal(bag(world).spark, 3);
  assert.deepEqual(world.query('vitals', 'status'), { hp: 34, maxHp: 34 });
  const legacy = await loadWorldPackage('campaign'), old = createWorld(builtinRegistry(), legacy.world);
  for (const command of legacy.demo) assert.equal(old.dispatch(command).ok, true);
  assert.deepEqual(old.query('vitals', 'status'), { hp: 22, maxHp: 34 });
});

test('campaign optional attributes view accepts the published old empty-state shape but rejects invented history', async () => {
  const pack = await loadWorldPackage('campaign'), registry = builtinRegistry();
  const world = createWorld(registry, pack.world), saved = world.snapshot();
  saved.modules['campaign-view']!.definitionVersion = '1.0.0';
  const restored = restoreWorld(registry, saved);
  assert.equal(restored.snapshot().modules['campaign-view']!.definitionVersion, '1.1.0');
  assert.ok(readTextView(restored).lines.some(line => line.includes('攻击 4')));
  saved.modules['campaign-view']!.state = { hidden: 1 };
  assert.throws(() => restoreWorld(registry, saved));
});

test('depleted skill consumables still permit another patrol with the unlocked no-cost skill', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  act(world, 'quests', 'accept', { quest: 'patrol' });
  act(world, 'location', 'move', { to: 'forest' });
  act(world, 'encounters', 'start', { encounter: 'wolf' });
  act(world, 'skills', 'use', { skill: 'heavy' });
  act(world, 'encounters', 'claim');
  act(world, 'clock', 'advance', { steps: 1 });
  act(world, 'encounters', 'start', { encounter: 'wolf' });
  act(world, 'skills', 'use', { skill: 'heavy' });
  act(world, 'encounters', 'claim');
  act(world, 'location', 'move', { to: 'town' });
  act(world, 'quests', 'turnIn', { quest: 'patrol' });
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 145);
  assert.deepEqual(world.query('encounters', 'records'), { wins: { wolf: 4, raider: 1 } });
  assert.deepEqual(world.query('vitals', 'status'), { hp: 34, maxHp: 34 });
  assert.equal(bag(world).spark, 0);
  assert.equal(((world.snapshot().modules.quests!.state as JsonObject).completed as JsonObject).patrol, 2);
});

test('loadout view rejects inconsistent foreign effect, skill and equipment display data without writes', async () => {
  const cases = [
    { capability: 'effects', action: 'status', result: { now: 0, effects: [{ id: 'bad', name: '坏效果', startedAt: 0, expiresAt: 0, remainingSeconds: 0, modifiers: {} }] } },
    { capability: 'skills', action: 'list', result: { skills: [{ id: 'bad', name: '坏技能', known: true, available: true, reasons: [], requiredTags: [], remainingSeconds: 1, minLevel: 1, attackBonus: 0, costs: {}, cooldownSeconds: 1, effect: null }] } },
    { capability: 'equipment', action: 'status', result: { slots: [{ slot: 'hand', item: { id: 'bad', name: '坏装备', slot: 'body' } }] } },
  ];
  for (const row of cases) {
    const { pack } = await setup(), registry = builtinRegistry();
    registry.register({
      manifest: { id: 'foreign.view-data', title: '外部显示数据', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { [row.capability]: '1.0.0' } },
      initialState: () => ({}), queries: { [row.action]: { execute: () => row.result as JsonObject } },
    });
    pack.world.modules.push({ id: 'foreign-view', module: 'foreign.view-data', config: {} });
    instance(pack.world, 'loadout-view').bindings![row.capability] = 'foreign-view';
    const world = createWorld(registry, pack.world), before = world.snapshot();
    assert.throws(() => readTextView(world), { code: 'INVALID_VIEW_DATA' });
    assert.deepEqual(world.snapshot(), before);
  }
});
