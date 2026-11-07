import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinRegistry } from '../src/catalog.ts';
import { createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { loadWorldPackage, worldNames } from '../src/worlds.ts';
import { readTextView } from '../src/adapters/text.ts';
import { parseActionCommand } from '../src/presentation/actions.ts';
import { patchWorldPackage } from '../src/authoring/patch.ts';
import { inspectWorldPackage } from '../src/authoring/packages.ts';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';

type World = ReturnType<typeof createWorld>;
async function setup(name = 'party') {
  assert.ok((await worldNames()).includes(name), `${name} must be discoverable`);
  const pack = await loadWorldPackage(name);
  return { pack, world: createWorld(builtinRegistry(), pack.world) };
}
function act(world: World, target: string, action: string, input: JsonObject = {}) {
  const result = world.dispatch({ target, action, input });
  assert.equal(result.ok, true, JSON.stringify(result)); return result;
}
function instance(definition: WorldDefinition, id: string) { const found = definition.modules.find(row => row.id === id); assert.ok(found); return found; }
function hp(world: World, member: string) { return (world.query('party', 'member', { member }) as JsonObject).hp; }
function state(world: World) { return world.query('battles', 'status') as JsonObject; }
function finalState(world: World) {
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 105);
  assert.equal((world.query('progression', 'status') as JsonObject).level, 3);
  assert.deepEqual(world.query('vitals', 'status'), { hp: 20, maxHp: 34 });
  assert.deepEqual([hp(world, 'mira'), hp(world, 'lin')], [14, 14]);
  assert.deepEqual(world.query('clock', 'now'), { elapsedSeconds: 90 });
  assert.deepEqual(world.query('market', 'balance'), { coins: 16 });
  assert.deepEqual(world.query('battles', 'records'), { wins: { wolves: 2, raiders: 1 } });
  assert.deepEqual(state(world), { phase: 'idle', battle: null, current: null });
  assert.deepEqual(world.query('session', 'status'), { owner: null });
  assert.deepEqual((world.snapshot().modules.quests!.state as JsonObject).completed, { supply: 1, patrol: 1, guard: 1 });
  assert.deepEqual((world.query('attributes', 'status') as JsonObject).values, { maxHp: 34, attack: 10, defense: 4 });
  assert.deepEqual((world.query('effects', 'status') as JsonObject).effects, []);
  for (const item of ['spark', 'tonic']) assert.deepEqual(world.query('inventory', 'count', { container: 'player', item }), { quantity: 0 });
  for (const item of ['badge', 'medal']) assert.deepEqual(world.query('inventory', 'count', { container: 'player', item }), { quantity: 1 });
}
test('two party clocks complete the hand-calculated 63-action loop with persistent wounds and paid revival', async () => {
  assert.equal(builtinRegistry().catalog().length, 53);
  assert.equal((await worldNames()).length, 14);
  for (const name of ['party', 'party-continuous']) {
    const { pack, world } = await setup(name);
    assert.equal(pack.world.modules.length, 35); assert.equal(pack.demo.length, 63);
    for (const [i, command] of pack.demo.entries()) {
      const result = world.dispatch(command); assert.equal(result.ok, true, JSON.stringify({ step: i + 1, result }));
      if (i + 1 === 27) {
        assert.deepEqual(state(world).current, { side: 'party', id: 'mira' });
        assert.equal((((state(world).battle as JsonObject).enemies as JsonObject[])[0]!).hp, 1);
      }
      if (i + 1 === 31) assert.deepEqual([hp(world, 'hero'), hp(world, 'mira'), hp(world, 'lin')], [20, 18, 10]);
      if (i + 1 === 38) assert.deepEqual([hp(world, 'hero'), hp(world, 'mira'), hp(world, 'lin')], [20, 16, 10]);
      if (i + 1 === 52) assert.deepEqual([hp(world, 'hero'), hp(world, 'mira'), hp(world, 'lin')], [20, 18, 0]);
      if (i + 1 === 54) assert.deepEqual([hp(world, 'hero'), hp(world, 'mira'), hp(world, 'lin')], [20, 14, 0]);
    }
    finalState(world);
    const before = world.snapshot(), view = readTextView(world);
    assert.ok(view.lines.some(line => line.includes('米拉') && line.includes('14/18')));
    assert.ok(view.lines.some(line => line.includes('恢复对象') && line.includes('林')));
    assert.deepEqual(world.snapshot(), before);
    assert.deepEqual(restoreWorld(builtinRegistry(), before).snapshot(), before);
  }
});
test('mid-target skill battle saves and swaps clock with party wounds, queue, effects and cooldown intact', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo.slice(0, 27)) assert.equal(world.dispatch(command).ok, true);
  const before = world.snapshot();
  const restored = restoreWorld(builtinRegistry(), before);
  const changed = reconfigureWorld(builtinRegistry(), restored, (await loadWorldPackage('party-continuous')).world);
  assert.deepEqual(state(changed), state(world));
  for (const command of pack.demo.slice(27)) {
    const converted = command.target === 'clock' ? { ...command, input: { seconds: (command.input!.steps as number) * 10 } } : command;
    assert.equal(changed.dispatch(converted).ok, true, JSON.stringify(converted));
  }
  finalState(changed); assert.deepEqual(world.snapshot(), before); assert.deepEqual(restored.snapshot(), before);
});
test('live strategy swaps keep current queue and change next-round ordering and next enemy target', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo.slice(0, 27)) assert.equal(world.dispatch(command).ok, true);
  const before = state(world), d = world.definition;
  instance(d, 'initiative').module = 'initiative.speed'; instance(d, 'targeting').module = 'targeting.first';
  const swapped = reconfigureWorld(builtinRegistry(), world, d);
  assert.deepEqual(state(swapped), before);
  act(swapped, 'battles', 'attack', { actor: 'mira', target: 'fang' });
  act(swapped, 'battles', 'attack', { actor: 'lin', target: 'howl' });
  assert.equal(hp(swapped, 'hero'), 18); assert.equal(hp(swapped, 'lin'), 14);
  assert.equal((state(swapped).battle as JsonObject).round, 2);
  assert.deepEqual(state(swapped).current, { side: 'party', id: 'lin' });
  act(swapped, 'battles', 'attack', { actor: 'lin', target: 'howl' });
  act(swapped, 'battles', 'attack', { actor: 'hero', target: 'howl' }); act(swapped, 'battles', 'claim');
  assert.deepEqual(swapped.query('battles', 'records'), { wins: { wolves: 1 } });
});
test('a companion turn blocks leader skills, movement and formation changes without consuming resources', async () => {
  const { pack, world } = await setup();
  for (const command of pack.demo.slice(0, 27)) assert.equal(world.dispatch(command).ok, true);
  act(world, 'clock', 'advance', { steps: 1 });
  for (const command of [
    { target: 'skills', action: 'use', input: { skill: 'cleave', target: 'howl' } },
    { target: 'party', action: 'setActive', input: { members: ['lin'] } },
    { target: 'location', action: 'move', input: { to: 'town' } },
    { target: 'session', action: 'release', input: { owner: 'battles' } },
  ]) {
    const before = world.snapshot(); assert.equal(world.dispatch(command).ok, false); assert.deepEqual(world.snapshot(), before);
  }
});
test('author patch changes actual rewards while original content stays immutable', async () => {
  const { pack } = await setup();
  const index = pack.world.modules.findIndex(row => row.id === 'squad-rules');
  const original = structuredClone(pack);
  const changed = patchWorldPackage(pack, [
    { op: 'test', path: `/world/modules/${index}/id`, value: 'squad-rules' },
    { op: 'replace', path: `/world/modules/${index}/config/encounters/wolves/loot/pelt`, value: 2 },
  ]);
  const check = inspectWorldPackage(builtinRegistry(), changed, { runDemo: true });
  assert.equal(check.ok, true, JSON.stringify(check));
  const world = createWorld(builtinRegistry(), changed.world);
  for (const command of changed.demo) assert.equal(world.dispatch(command).ok, true);
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'pelt' }), { quantity: 2 });
  assert.deepEqual(pack, original);
});
test('the whole party loop works after removing every view and can continue without skill materials', async () => {
  const { pack } = await setup();
  const d = structuredClone(pack.world); d.modules = d.modules.filter(row => !row.module.startsWith('view.')); delete d.entryView;
  const world = createWorld(builtinRegistry(), d);
  for (const command of pack.demo) assert.equal(world.dispatch(command).ok, true);
  finalState(world);
  act(world, 'quests', 'accept', { quest: 'patrol' }); act(world, 'location', 'move', { to: 'forest' });
  act(world, 'battles', 'start', { encounter: 'wolves' });
  act(world, 'skills', 'use', { skill: 'heavy', target: 'fang' });
  act(world, 'battles', 'attack', { actor: 'mira', target: 'howl' });
  act(world, 'battles', 'attack', { actor: 'lin', target: 'howl' });
  act(world, 'battles', 'attack', { actor: 'hero', target: 'howl' }); act(world, 'battles', 'claim');
  assert.equal((world.query('progression', 'status') as JsonObject).experience, 115);
  assert.deepEqual(world.query('inventory', 'count', { container: 'player', item: 'spark' }), { quantity: 0 });
});
test('party text hints use renamed Unicode instances and carry concrete enemy targets', async () => {
  const { pack } = await setup(); const d = structuredClone(pack.world);
  const names = new Map(d.modules.map(row => [row.id, `${row.id} "队 😀"`]));
  for (const row of d.modules) {
    row.id = names.get(row.id)!;
    if (row.bindings) for (const [key, value] of Object.entries(row.bindings)) row.bindings[key] = names.get(value)!;
  }
  d.entryView!.instance = names.get(d.entryView!.instance)!;
  const world = createWorld(builtinRegistry(), d);
  for (const command of pack.demo.slice(0, 26)) assert.equal(world.dispatch({ ...command, target: names.get(command.target)! }).ok, true);
  const view = readTextView(world);
  const line = view.lines.find(line => line.includes('do ') && line.includes('cleave') && line.includes('fang')); assert.ok(line);
  const command = parseActionCommand(line.slice(line.indexOf('do ') + 3));
  assert.equal(command.target, names.get('skills')); assert.deepEqual(command.input, { skill: 'cleave', target: 'fang' });
  assert.equal(world.dispatch(command).ok, true);
});

test('a later real enemy AI failure rolls back the entire skill, and successful receipt replay cannot charge twice', async () => {
  const { pack } = await setup();
  const targeting: ModuleDefinition = {
    manifest: { id: 'test.party-late-ai', title: 'Late AI failure fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { targeting: '1.0.0' } },
    initialState: () => ({}), queries: { choose: { execute(ctx, input) {
      const candidate = (input.candidates as JsonObject[])[0]!;
      return { target: ctx.config.bad && (candidate.hp as number) < 20 ? 'absent' : candidate.id! };
    } } },
  };
  const registry = builtinRegistry(); registry.register(targeting);
  instance(pack.world, 'targeting').module = 'test.party-late-ai'; instance(pack.world, 'targeting').config = { bad: true };
  const world = createWorld(registry, pack.world);
  act(world, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); act(world, 'equipment', 'equip', { item: 'armor', slot: 'body' });
  act(world, 'location', 'move', { to: 'forest' }); act(world, 'battles', 'start', { encounter: 'wolves' });
  const command = { id: 'once-cleave', target: 'skills', action: 'use', input: { skill: 'cleave', target: 'fang' } };
  const before = world.snapshot(), failure = world.dispatch(command);
  assert.equal(failure.ok, false); if (!failure.ok) assert.equal(failure.error.code, 'INVALID_TARGETING');
  assert.deepEqual(world.snapshot(), before);
  const d = world.definition; instance(d, 'targeting').config.bad = false;
  const repaired = reconfigureWorld(registry, world, d);
  const result = repaired.dispatch(command); assert.equal(result.ok, true);
  assert.equal(hp(repaired, 'hero'), 15);
  assert.deepEqual(repaired.query('inventory', 'count', { container: 'player', item: 'spark' }), { quantity: 2 });
  const paid = repaired.snapshot(), replay = repaired.dispatch(command);
  assert.equal(replay.ok, true); if (replay.ok) assert.equal(replay.replayed, true);
  assert.deepEqual(repaired.snapshot(), paid);
});

test('party view rejects malformed external phase, actor and enemy data without changing the world', async () => {
  const { pack } = await setup();
  const proxy: ModuleDefinition = {
    manifest: { id: 'test.party-view-proxy', title: 'View boundary fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'party-battle': '1.0.0' }, requires: { 'party-battle': { version: '^1.0.0' } } },
    initialState: () => ({}), queries: {
      status: { execute(ctx) {
        const value = ctx.query('party-battle', 'status') as JsonObject;
        if (ctx.config.bad === 'phase') value.phase = 'unknown';
        if (ctx.config.bad === 'actor') value.current = { side: 'enemy', id: 'fang' };
        if (ctx.config.bad === 'health') (((value.battle as JsonObject).enemies as JsonObject[])[0]!).hp = 13;
        return value;
      } },
      list: { execute: ctx => ctx.query('party-battle', 'list') },
    },
  };
  for (const bad of ['phase', 'actor', 'health']) {
    const d = structuredClone(pack.world);
    d.modules.push({ id: 'proxy', module: 'test.party-view-proxy', config: { bad }, bindings: { 'party-battle': 'battles' } });
    instance(d, 'party-view').bindings!['party-battle'] = 'proxy';
    const registry = builtinRegistry(); registry.register(proxy);
    const world = createWorld(registry, d);
    for (const command of pack.demo.slice(0, 26)) assert.equal(world.dispatch(command).ok, true);
    const before = world.snapshot(); assert.throws(() => readTextView(world)); assert.deepEqual(world.snapshot(), before);
  }
});

test('loadout view migrates only the exact old empty state while all legacy worlds remain usable', async () => {
  const pack = await loadWorldPackage('loadout'), world = createWorld(builtinRegistry(), pack.world);
  const before = world.snapshot(); before.modules['loadout-view']!.definitionVersion = '1.0.0';
  const restored = restoreWorld(builtinRegistry(), before);
  assert.equal(restored.snapshot().modules['loadout-view']!.definitionVersion, '1.1.0');
  assert.deepEqual(readTextView(restored), readTextView(world));
  before.modules['loadout-view']!.state = { unknown: true };
  assert.throws(() => restoreWorld(builtinRegistry(), before));
});
