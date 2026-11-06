import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { WorldRuntime } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import type { JsonObject, ModuleInstance, WorldDefinition } from '../src/contracts.ts';
import { encountersModule } from '../src/modules/encounters.ts';

async function setup(name = 'campaign') {
  assert.ok((await worldNames()).includes(name), `${name} must be a discoverable world`);
  const pack = await loadWorldPackage(name);
  return { pack, world: createWorld(builtinRegistry(), pack.world) };
}
function act(world: WorldRuntime, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function instance(definition: WorldDefinition, id: string): ModuleInstance {
  const found = definition.modules.find(row => row.id === id); assert.ok(found); return found;
}
function finalState(world: WorldRuntime) {
  const progression = world.query('progression', 'status') as JsonObject;
  assert.equal(progression.experience, 105); assert.equal(progression.level, 3);
  assert.deepEqual(world.query('vitals', 'status'), { hp: 22, maxHp: 34 });
  assert.deepEqual(world.query('market', 'balance'), { coins: 16 });
  assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 60 });
  assert.deepEqual(world.query('encounters', 'records'), { wins: { wolf: 2, raider: 1 } });
  assert.deepEqual(world.query('encounters', 'status'), { battle: null, phase: 'idle' });
  assert.deepEqual(world.snapshot().modules.quests!.state, { active: {}, completed: { supply: 1, patrol: 1, guard: 1 } });
  assert.equal((world.query('workshop', 'status') as JsonObject).job, null);
  const items = (world.snapshot().modules.inventory!.state as JsonObject).containers as JsonObject;
  const bag = items.player as JsonObject;
  assert.deepEqual([bag.wood, bag.stone, bag.reed, bag.tonic, bag.pelt, bag.ore, bag.badge, bag.medal], [1, 1, 2, 0, 0, 0, 1, 1]);
}

test('both campaign clocks complete the actual quest, combat, production and trade chain', async () => {
  for (const name of ['campaign', 'campaign-continuous']) {
    const { pack, world } = await setup(name);
    assert.equal(pack.demo.length, 46);
    for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true, JSON.stringify(command));
    finalState(world);
    const before = world.snapshot(), view = readTextView(world);
    assert.ok(view.lines.some(line => line.includes('等级 3')));
    assert.ok(view.lines.some(line => line.includes('镇口补给')));
    assert.deepEqual(world.snapshot(), before);
    assert.deepEqual(restoreWorld(builtinRegistry(), before).snapshot(), before);
  }
});

test('campaign saves an active battle and quests then continues after replacing the clock strategy', async () => {
  const { pack, world } = await setup();
  const firstAttack = pack.demo.findIndex(command => command.target === 'encounters' && command.action === 'attack');
  assert.ok(firstAttack > 0);
  for (const command of pack.demo.slice(0, firstAttack + 1)) assert.equal(world.dispatch(command).ok, true);
  const saved = world.snapshot(), restored = restoreWorld(builtinRegistry(), saved);
  const next = (await loadWorldPackage('campaign-continuous')).world;
  const switched = reconfigureWorld(builtinRegistry(), restored, next);
  for (const command of pack.demo.slice(firstAttack + 1)) {
    const adapted = command.target === 'clock' ? { ...command, input: { seconds: (command.input!.steps as number) * 10 } } : command;
    assert.equal(switched.dispatch(adapted).ok, true, JSON.stringify(adapted));
  }
  finalState(switched);
  assert.deepEqual(restored.snapshot(), saved);
});

test('a full campaign bag preserves won battle and XP until a successful retry', async () => {
  const { pack, world } = await setup();
  const firstClaim = pack.demo.findIndex(command => command.target === 'encounters' && command.action === 'claim');
  for (const command of pack.demo.slice(0, firstClaim)) assert.equal(world.dispatch(command).ok, true);
  const next = structuredClone(world.definition);
  const containers = instance(next, 'inventory').config.containers as JsonObject;
  ((containers.player as JsonObject).limits as JsonObject).slots = 4;
  const constrained = reconfigureWorld(builtinRegistry(), world, next), before = constrained.snapshot();
  const failed = constrained.dispatch({ target: 'encounters', action: 'claim' });
  assert.equal(failed.ok, false);
  assert.deepEqual(constrained.snapshot(), before);
  assert.equal((constrained.query('encounters', 'status') as JsonObject).phase, 'victory');
  assert.equal((constrained.query('progression', 'status') as JsonObject).experience, 10);
  act(constrained, 'market', 'sell', { item: 'wood', quantity: 1 });
  act(constrained, 'encounters', 'claim');
  assert.deepEqual(constrained.query('encounters', 'records'), { wins: { wolf: 1 } });
  assert.equal((constrained.query('progression', 'status') as JsonObject).experience, 20);
  const awarded = constrained.snapshot();
  assert.equal(constrained.dispatch({ target: 'encounters', action: 'claim' }).ok, false);
  assert.deepEqual(constrained.snapshot(), awarded);
});

test('an accepted campaign quest keeps its reward when the live catalog changes', async () => {
  const { pack, world } = await setup();
  const delivery = pack.demo.findIndex(command => command.target === 'quests' && command.action === 'turnIn');
  for (const command of pack.demo.slice(0, delivery)) assert.equal(world.dispatch(command).ok, true);
  const next = structuredClone(world.definition);
  const quests = instance(next, 'quest-rules').config.quests as JsonObject;
  (quests.supply as JsonObject).experience = 900;
  const changed = reconfigureWorld(builtinRegistry(), world, next);
  act(changed, 'quests', 'turnIn', { quest: 'supply' });
  assert.equal((changed.query('progression', 'status') as JsonObject).experience, 10);
  act(changed, 'inventory', 'add', { container: 'player', item: 'toolkit', quantity: 1 });
  act(changed, 'quests', 'accept', { quest: 'supply' });
  act(changed, 'quests', 'turnIn', { quest: 'supply' });
  assert.equal((changed.query('progression', 'status') as JsonObject).experience, 910);
});

test('campaign rules run with both text views removed', async () => {
  const { pack } = await setup();
  pack.world.modules = pack.world.modules.filter(row => !['view', 'campaign-view'].includes(row.id));
  delete pack.world.entryView;
  const world = createWorld(builtinRegistry(), pack.world);
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  finalState(world);
});

test('repeatable campaign patrol starts a new baseline and supports another complete loop', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  act(world, 'quests', 'accept', { quest: 'patrol' });
  const patrol = ((world.query('quests', 'list') as JsonObject).quests as JsonObject[]).find(row => row.id === 'patrol')!;
  assert.equal(patrol.ready, false); assert.deepEqual(patrol.remainingVictories, { wolf: 2 });
  act(world, 'location', 'move', { to: 'forest' });
  for (let run = 0; run < 2; run++) {
    act(world, 'clock', 'advance', { steps: 1 });
    act(world, 'encounters', 'start', { encounter: 'wolf' });
    act(world, 'encounters', 'attack'); act(world, 'encounters', 'attack'); act(world, 'encounters', 'claim');
  }
  act(world, 'location', 'move', { to: 'town' });
  act(world, 'quests', 'turnIn', { quest: 'patrol' });
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 145);
  assert.deepEqual(world.query('encounters', 'records'), { wins: { wolf: 4, raider: 1 } });
  assert.equal(((world.snapshot().modules.quests!.state as JsonObject).completed as JsonObject).patrol, 2);
});

test('a defeated character can return, consume a crafted remedy and retreat without rewards', async () => {
  const { world } = await setup();
  act(world, 'location', 'move', { to: 'river' }); act(world, 'gathering', 'gather', { site: 'reed' });
  act(world, 'location', 'move', { to: 'town' }); act(world, 'workshop', 'start', { recipe: 'tonic' });
  act(world, 'clock', 'advance', { steps: 1 }); act(world, 'workshop', 'collect');
  act(world, 'location', 'move', { to: 'quarry' }); act(world, 'encounters', 'start', { encounter: 'raider' });
  for (let i = 0; i < 3; i++) act(world, 'encounters', 'attack');
  assert.equal((world.query('encounters', 'status') as JsonObject).phase, 'defeat');
  assert.deepEqual(world.query('vitals', 'status'), { hp: 0, maxHp: 20 });
  act(world, 'location', 'move', { to: 'town' }); act(world, 'recovery', 'use', { remedy: 'tonic' });
  assert.equal((world.query('encounters', 'status') as JsonObject).phase, 'defeat');
  act(world, 'encounters', 'retreat');
  assert.deepEqual(world.query('vitals', 'status'), { hp: 20, maxHp: 20 });
  assert.deepEqual(world.query('encounters', 'records'), { wins: {} });
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 0);
});

test('composed campaign view rejects malformed foreign quest readiness without changing state', async () => {
  const { pack } = await setup(), registry = builtinRegistry();
  registry.register({
    manifest: { id: 'external.quest-view-data', title: '错误任务数据', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { quests: '1.0.0' } },
    initialState: () => ({}),
    queries: { list: { execute: () => ({ quests: [{ id: 'bad', name: '错误任务', description: '', status: 'ready', ready: 'yes', completed: 0, remainingDelivery: {}, remainingVictories: {}, rewards: {}, experience: 0, locations: [] }] }) } },
  });
  const journal = instance(pack.world, 'quests');
  journal.module = 'external.quest-view-data'; journal.config = {}; delete journal.bindings;
  const world = createWorld(registry, pack.world), before = world.snapshot();
  assert.throws(() => readTextView(world), /任务交付状态|布尔值/);
  assert.deepEqual(world.snapshot(), before);
});

test('campaign view follows Unicode code-point ID bounds at foreign quest boundaries', async () => {
  for (const size of [65, 128, 129]) {
    const { pack } = await setup(), registry = builtinRegistry(), id = '😀'.repeat(size);
    registry.register({
      manifest: { id: 'external.unicode-quest', title: 'Unicode 任务', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { quests: '1.0.0' } },
      initialState: () => ({}),
      queries: { list: { execute: () => ({ quests: [{ id, name: 'Unicode 任务', description: '', status: 'available', ready: false, completed: 0, remainingDelivery: { [id]: 1 }, remainingVictories: {}, rewards: {}, experience: 0, locations: [id] }] }) } },
    });
    const journal = instance(pack.world, 'quests');
    journal.module = 'external.unicode-quest'; journal.config = {}; delete journal.bindings;
    const world = createWorld(registry, pack.world), before = world.snapshot();
    if (size <= 128) assert.ok(readTextView(world).lines.some(line => line.includes(id)));
    else assert.throws(() => readTextView(world), /ID长度无效/);
    assert.deepEqual(world.snapshot(), before);
  }
});

test('campaign view rejects foreign battle phases inconsistent with displayed health', async () => {
  for (const [phase, enemyHp] of [['active', 0], ['victory', 1], ['defeat', 0]] as const) {
    const { pack } = await setup(), registry = builtinRegistry();
    registry.register({
      ...encountersModule,
      manifest: { ...encountersModule.manifest, id: 'external.battle-phase' },
      queries: { ...encountersModule.queries, status: { execute: () => ({ phase, battle: { phase, name: '敌人', enemyHp, enemyMaxHp: 10, loot: {}, experience: 0 } }) } },
    });
    instance(pack.world, 'encounters').module = 'external.battle-phase';
    const world = createWorld(registry, pack.world), before = world.snapshot();
    assert.throws(() => readTextView(world), /战斗阶段与生命不一致/);
    assert.deepEqual(world.snapshot(), before);
  }
});
