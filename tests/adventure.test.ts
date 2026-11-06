import assert from 'node:assert/strict';
import test from 'node:test';
import { ModuleRegistry, createWorld, restoreWorld } from '../src/engine/index.ts';
import { adventureModules } from '../src/modules/adventure.ts';
import type { ModuleDefinition, WorldDefinition } from '../src/contracts.ts';

const registry = () => new ModuleRegistry(adventureModules);
const narrative: WorldDefinition = { id: 'story', title: '故事', version: '1.0.0', modules: [
  { id: 'story', module: 'narrative.branching', config: { start: 'gate', nodes: {
    gate: { text: '门在眼前。', choices: [{ id: 'enter', label: '进入', next: 'room' }] },
    room: { text: '房间空旷。', choices: [] },
  } } },
  { id: 'view', module: 'view.narrative.text', config: {} },
] };
const battle = (): WorldDefinition => ({ id: 'battle', title: '独立战棋', version: '1.0.0', modules: [
  { id: 'rng', module: 'random.seeded', config: { seed: 1 } },
  { id: 'board', module: 'tactics.grid', config: { width: 5, height: 4, movePoints: 2, units: [
    { id: 'hero', name: '守卫', side: 'player', x: 0, y: 0, hp: 8, damage: 4, hitChance: 1 },
    { id: 'friend', name: '同伴', side: 'player', x: 0, y: 1, hp: 8, damage: 1, hitChance: 1 },
    { id: 'foe', name: '敌人', side: 'enemy', x: 2, y: 0, hp: 8, damage: 2, hitChance: 1 },
  ] } },
  { id: 'view', module: 'view.tactics.text', config: {} },
] });

test('narrative runs with its view alone and invalid choice rolls back', () => {
  const world = createWorld(registry(), narrative);
  assert.deepEqual(world.query('story', 'scene'), { node: 'gate', text: '门在眼前。', choices: [{ id: 'enter', label: '进入', next: 'room' }], visits: 1 });
  assert.match(JSON.stringify(world.query('view', 'render')), /门在眼前/);
  const before = world.snapshot();
  assert.equal(world.dispatch({ target: 'story', action: 'choose', input: { choice: 'missing' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  const result = world.dispatch({ target: 'story', action: 'choose', input: { choice: 'enter' } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.events[0]?.type, 'narrative.changed');
  assert.deepEqual(world.read('story'), { node: 'room', visits: 2 });
});

test('narrative graph rejects bad start, dangling next and duplicate choice IDs', () => {
  for (const change of ['start', 'next', 'duplicate']) {
    const definition = structuredClone(narrative);
    const config = definition.modules[0]!.config;
    if (change === 'start') config.start = 'absent';
    else {
      const nodes = config.nodes as Record<string, { text: string; choices: { id: string; label: string; next: string }[] }>;
      if (change === 'next') nodes.gate!.choices[0]!.next = 'absent';
      else nodes.gate!.choices.push({ id: 'enter', label: '再次进入', next: 'room' });
    }
    assert.throws(() => createWorld(registry(), definition));
  }
});

test('tactics rejects wrong side, range, bounds, occupied cells and repeated attack without spending randomness', () => {
  const world = createWorld(registry(), battle());
  for (const input of [{ unit: 'foe', x: 3, y: 0 }, { unit: 'hero', x: 4, y: 0 }, { unit: 'hero', x: -1, y: 0 }, { unit: 'hero', x: 0, y: 1 }]) {
    const before = world.snapshot();
    assert.equal(world.dispatch({ target: 'board', action: 'move', input }).ok, false);
    assert.deepEqual(world.snapshot(), before);
  }
  const before = world.snapshot();
  assert.equal(world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  assert.equal(world.dispatch({ target: 'board', action: 'move', input: { unit: 'hero', x: 1, y: 0 } }).ok, true);
  assert.equal(world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } }).ok, true);
  const after = world.snapshot();
  assert.equal(world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } }).ok, false);
  assert.deepEqual(world.snapshot(), after);
  // Attack expenditure and movement allowance are independent.
  assert.equal(world.dispatch({ target: 'board', action: 'move', input: { unit: 'hero', x: 1, y: 1 } }).ok, true);
});

test('legal battle resets incoming side, preserves dead units, renders and guards terminal state', () => {
  const world = createWorld(registry(), battle());
  for (const command of [
    { action: 'move', input: { unit: 'hero', x: 1, y: 0 } },
    { action: 'attack', input: { unit: 'hero', target: 'foe' } },
    { action: 'endTurn' },
    { action: 'attack', input: { unit: 'foe', target: 'hero' } },
    { action: 'endTurn' },
    { action: 'attack', input: { unit: 'hero', target: 'foe' } },
  ]) assert.equal(world.dispatch({ target: 'board', ...command }).ok, true);
  const board = world.query('board', 'board') as { turn: number; side: string; winner: string; units: { id: string; hp: number; acted: boolean; remainingMove: number }[] };
  assert.equal(board.turn, 3);
  assert.equal(board.side, 'player');
  assert.equal(board.winner, 'player');
  assert.equal(board.units.find(u => u.id === 'foe')?.hp, 0);
  assert.equal(board.units.find(u => u.id === 'friend')?.remainingMove, 2);
  assert.match(JSON.stringify(world.query('view', 'render')), /守卫/);
  const before = world.snapshot();
  for (const action of ['endTurn', 'move', 'attack']) {
    const input = action === 'move' ? { unit: 'hero', x: 0, y: 0 } : action === 'attack' ? { unit: 'hero', target: 'foe' } : {};
    assert.equal(world.dispatch({ target: 'board', action, input }).ok, false);
    assert.deepEqual(world.snapshot(), before);
  }
});

test('xorshift32 has documented seed semantics and restores the future stream', () => {
  const definition: WorldDefinition = { id: 'rng-only', title: '随机', version: '1.0.0', modules: [{ id: 'rng', module: 'random.seeded', config: { seed: 1 } }] };
  const world = createWorld(registry(), definition);
  const first = world.dispatch({ target: 'rng', action: 'next' });
  assert.equal(first.ok, true);
  if (first.ok) assert.deepEqual(first.value, { value: 270369 / 4294967296 });
  const restored = restoreWorld(registry(), world.snapshot());
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(world.dispatch({ target: 'rng', action: 'next' }), restored.dispatch({ target: 'rng', action: 'next' }));
  }
  const zero = structuredClone(definition);
  zero.modules[0]!.config.seed = 0;
  assert.deepEqual(createWorld(registry(), zero).read('rng'), { value: 0x6d2b79f5 });
});

test('nested failure rolls back RNG owned solely by random module', () => {
  const failing: ModuleDefinition = {
    manifest: { id: 'external.failure-probe', title: '外部探针', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { random: { version: '^1.0.0' } } },
    initialState: () => ({}), commands: { spendThenFail: { execute(context) { context.call('random', 'next'); context.fail('PROBE', '事务失败'); } } },
  };
  const world = createWorld(new ModuleRegistry([...adventureModules, failing]), { id: 'probe', title: '探针', version: '1.0.0', modules: [
    { id: 'rng', module: 'random.seeded', config: { seed: 1 } },
    { id: 'probe', module: failing.manifest.id, config: {} },
  ] });
  const before = world.snapshot();
  assert.equal(world.dispatch({ target: 'probe', action: 'spendThenFail' }).ok, false);
  assert.deepEqual(world.snapshot(), before);
  const next = world.dispatch({ target: 'rng', action: 'next' });
  if (next.ok) assert.deepEqual(next.value, { value: 270369 / 4294967296 });
  else assert.fail(next.error.message);
});

test('zero hit chance still consumes one attack and one deterministic random draw', () => {
  const definition = battle();
  const units = definition.modules[1]!.config.units as unknown as { hitChance: number }[];
  units[0]!.hitChance = 0;
  const world = createWorld(registry(), definition);
  assert.equal(world.dispatch({ target: 'board', action: 'move', input: { unit: 'hero', x: 1, y: 0 } }).ok, true);
  const attack = world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } });
  assert.equal(attack.ok, true);
  if (attack.ok) assert.deepEqual(attack.value, { unit: 'hero', target: 'foe', hit: false, roll: 270369 / 4294967296, damage: 0, hp: 8, winner: null });
  assert.deepEqual(world.read('rng'), { value: 270369 });
  const before = world.snapshot();
  assert.equal(world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } }).ok, false);
  assert.deepEqual(world.snapshot(), before);
});

test('malformed random provider result fails with a useful domain error and rolls back', () => {
  const invalidRandom: ModuleDefinition = {
    manifest: { id: 'external.invalid-random', title: '不合法随机源', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { random: '1.0.0' } },
    initialState: () => ({ draws: 0 }), commands: { next: { execute(context) { context.write({ draws: 1 }); return null; } } },
  };
  const definition = battle();
  definition.modules[0]!.module = invalidRandom.manifest.id;
  definition.modules[0]!.config = {};
  const world = createWorld(new ModuleRegistry([...adventureModules, invalidRandom]), definition);
  assert.equal(world.dispatch({ target: 'board', action: 'move', input: { unit: 'hero', x: 1, y: 0 } }).ok, true);
  const before = world.snapshot();
  const attack = world.dispatch({ target: 'board', action: 'attack', input: { unit: 'hero', target: 'foe' } });
  assert.equal(attack.ok, false);
  if (!attack.ok) assert.equal(attack.error.code, 'TACTICS_RANDOM');
  assert.deepEqual(world.snapshot(), before);
});

test('arbitrary module identifiers use the public host without fixed gameplay kinds', () => {
  const renamed = adventureModules.map(module => ({ ...module, manifest: { ...module.manifest, id: `trusted.custom.${module.manifest.id}` } }));
  const definition = structuredClone(narrative);
  for (const instance of definition.modules) instance.module = `trusted.custom.${instance.module}`;
  const world = createWorld(new ModuleRegistry(renamed), definition);
  assert.equal(world.dispatch({ target: 'story', action: 'choose', input: { choice: 'enter' } }).ok, true);
  assert.match(JSON.stringify(world.query('view', 'render')), /房间空旷/);
});
