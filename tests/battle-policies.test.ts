import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject, JsonValue, PreviousState, ReadContext } from '../src/contracts.ts';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { squadRulesModule, readSquad } from '../src/modules/squad-rules.ts';
import { initiativeListedModule, initiativeSpeedModule } from '../src/modules/initiative.ts';
import { targetFirstModule, targetLowestHpModule } from '../src/modules/targeting.ts';

const definitions = [squadRulesModule, initiativeListedModule, initiativeSpeedModule, targetFirstModule, targetLowestHpModule];
function registry() { return new ModuleRegistry(definitions); }
function setup(module: string, config: JsonObject = {}) {
  return createWorld(registry(), { id: 'policies', title: '策略测试', version: '1', modules: [{ id: 'policy', module, config }] });
}
const actors = [{ side: 'party', id: 'a', speed: 5 }, { side: 'party', id: 'b', speed: 9 }, { side: 'enemy', id: 'a', speed: 9 }];
const candidates = [{ id: 'a', hp: 8, maxHp: 100 }, { id: 'b', hp: 9, maxHp: 10 }, { id: 'c', hp: 8, maxHp: 8 }];
const encounter = { name: '巡查', location: '林地', enemies: [{ id: 'a', name: '灰狼', maxHp: 10, attack: 3, defense: 1, speed: 7 }, { id: 'b', name: '山贼', maxHp: 20, attack: 4, defense: 0, speed: 2 }], loot: { herb: 2 }, experience: 5, cooldownSeconds: 0.5 };
function catalog(entry: JsonObject = encounter) { return setup('squads.catalog', { encounters: { patrol: entry } }); }
const readerContext = { fail(code: string, message: string): never { throw Error(`${code}: ${message}`); } } as ReadContext;

// Reversed sort, unstable tie order or string-only actor keys must change these literal outputs.
test('listed keeps source order while speed uses descending stable order and side-qualified identity', () => {
  const listed = setup('initiative.listed'), speed = setup('initiative.speed');
  assert.deepEqual(listed.query('policy', 'order', { actors }), { order: [{ side: 'party', id: 'a' }, { side: 'party', id: 'b' }, { side: 'enemy', id: 'a' }] });
  assert.deepEqual(speed.query('policy', 'order', { actors }), { order: [{ side: 'party', id: 'b' }, { side: 'enemy', id: 'a' }, { side: 'party', id: 'a' }] });
  assert.deepEqual(actors, [{ side: 'party', id: 'a', speed: 5 }, { side: 'party', id: 'b', speed: 9 }, { side: 'enemy', id: 'a', speed: 9 }]);
});
test('initiative refuses empty, duplicate, unsafe or malformed actors without changing state', () => {
  for (const module of ['initiative.listed', 'initiative.speed']) {
    const w = setup(module), before = w.snapshot();
    const invalid: JsonValue[] = [[], [actors[0]!, actors[0]!], [{ side: 'party', id: 'a', speed: -1 }], [{ side: 'party', id: 'a', speed: 0.5 }], [{ side: 'party', id: 'a', speed: Number.MAX_SAFE_INTEGER + 1 }], [{ side: 'neutral', id: 'a', speed: 1 }], [{ side: 'enemy', id: '', speed: 1 }], [{ side: 'party', id: 'a', speed: 1, hp: 1 }], [{ side: 'party', id: 'a' }], null, {}];
    for (const input of invalid) assert.throws(() => w.query('policy', 'order', { actors: input }));
    assert.throws(() => w.query('policy', 'order', { actors, extra: true }));
    assert.deepEqual(w.snapshot(), before);
  }
});
// Replacing absolute HP with a percentage or disturbing ties breaks the second lowest-HP result.
test('targeting uses given first or lowest absolute hp with source-order ties', () => {
  const first = setup('targeting.first'), lowest = setup('targeting.lowest-hp');
  assert.deepEqual(first.query('policy', 'choose', { candidates }), { target: 'a' });
  assert.deepEqual(lowest.query('policy', 'choose', { candidates }), { target: 'a' });
  const reordered = [candidates[1]!, candidates[2]!, candidates[0]!];
  assert.deepEqual(first.query('policy', 'choose', { candidates: reordered }), { target: 'b' });
  assert.deepEqual(lowest.query('policy', 'choose', { candidates: reordered }), { target: 'c' });
});
test('targeting rejects dead, empty, duplicated, unsafe and unknown candidate shapes purely', () => {
  for (const module of ['targeting.first', 'targeting.lowest-hp']) {
    const w = setup(module), before = w.snapshot();
    const invalid: JsonValue[] = [[], [candidates[0]!, candidates[0]!], [{ id: 'a', hp: 0, maxHp: 1 }], [{ id: 'a', hp: 2, maxHp: 1 }], [{ id: 'a', hp: 1, maxHp: 0 }], [{ id: 'a', hp: -1, maxHp: 1 }], [{ id: 'a', hp: 0.5, maxHp: 1 }], [{ id: 'a', hp: 1, maxHp: 1.5 }], [{ id: 'a', hp: Number.MAX_SAFE_INTEGER + 1, maxHp: Number.MAX_SAFE_INTEGER + 1 }], [{ id: 'a', hp: 1, maxHp: 1, speed: 1 }], [{ id: '', hp: 1, maxHp: 1 }], [{ id: 'a', hp: 1 }], null, {}];
    for (const input of invalid) assert.throws(() => w.query('policy', 'choose', { candidates: input }));
    assert.throws(() => w.query('policy', 'choose', { candidates, extra: true }));
    assert.deepEqual(w.snapshot(), before);
  }
});
test('both policy families swap only exact known version1 empty states and remain stateless', () => {
  for (const [from, to, action, input, want] of [
    ['initiative.listed', 'initiative.speed', 'order', { actors }, { order: [{ side: 'party', id: 'b' }, { side: 'enemy', id: 'a' }, { side: 'party', id: 'a' }] }],
    ['targeting.first', 'targeting.lowest-hp', 'choose', { candidates: [candidates[1]!, candidates[2]!, candidates[0]!] }, { target: 'c' }]
  ] as const) {
    const w = setup(from), next = structuredClone(w.snapshot().definition); next.modules[0]!.module = to;
    const swapped = reconfigureWorld(registry(), w, next);
    assert.deepEqual(swapped.query('policy', action, input as unknown as JsonObject), want);
    assert.deepEqual(swapped.read('policy'), {});
    next.modules[0]!.module = from;
    const back = reconfigureWorld(registry(), swapped, next);
    assert.deepEqual(restoreWorld(registry(), back.snapshot()).snapshot(), back.snapshot());
  }
  for (const module of definitions.filter(d => d.manifest.id !== 'squads.catalog')) {
    const counterpart = module.manifest.id.startsWith('initiative.') ? 'initiative.listed' : 'targeting.first';
    const valid: PreviousState = { moduleId: counterpart, version: '1.0.0', stateVersion: 1, state: {} };
    assert.deepEqual(module.migrate!(valid, {}), {});
    for (const bad of [{ moduleId: 'unknown' }, { moduleId: 'squads.catalog' }, { version: '1.0.1' }, { version: '2.0.0' }, { stateVersion: 2 }, { state: { queue: [] } }, { state: [] }, { state: null }]) assert.throws(() => module.migrate!({ ...valid, ...bad }, {}));
  }
});
test('squad get/list and public reader agree without touching external location or inventory', () => {
  const w = catalog(), before = w.snapshot(), expected = { id: 'patrol', ...encounter };
  assert.deepEqual(w.query('policy', 'get', { encounter: 'patrol' }), expected);
  assert.deepEqual(w.query('policy', 'list'), { encounters: [expected] });
  assert.deepEqual(readSquad(readerContext, w.query('policy', 'get', { encounter: 'patrol' }), 'patrol'), expected);
  assert.deepEqual(w.snapshot(), before);
  assert.throws(() => w.query('policy', 'get', { encounter: 'unknown' }));
  assert.throws(() => w.query('policy', 'get', { encounter: 'patrol', extra: true }));
  assert.throws(() => w.query('policy', 'list', { extra: true }));
});
test('squad rejects empty or duplicate enemies and unsafe reward/stat/time terms', () => {
  const edits: JsonObject[] = [
    { enemies: [] }, { enemies: [encounter.enemies[0]!, encounter.enemies[0]!] }, { enemies: [{ ...encounter.enemies[0]!, maxHp: 0 }] }, { enemies: [{ ...encounter.enemies[0]!, attack: 0 }] }, { enemies: [{ ...encounter.enemies[0]!, defense: -1 }] }, { enemies: [{ ...encounter.enemies[0]!, speed: 0.5 }] }, { enemies: [{ ...encounter.enemies[0]!, maxHp: Number.MAX_SAFE_INTEGER + 1 }] }, { enemies: [{ ...encounter.enemies[0]!, extra: 1 }] },
    { name: '' }, { location: '' }, { loot: { herb: 0 } }, { loot: { herb: 1.5 } }, { loot: { herb: Number.MAX_SAFE_INTEGER + 1 } }, { experience: -1 }, { experience: 0.1 }, { experience: Number.MAX_SAFE_INTEGER + 1 }, { cooldownSeconds: -1 }, { cooldownSeconds: Number.MAX_SAFE_INTEGER + 1 }, { unknown: true }
  ];
  for (const edit of edits) assert.throws(() => catalog({ ...encounter, ...edit }));
  assert.throws(() => setup('squads.catalog', { encounters: {}, unknown: true }));
});
test('public squad reader rejects mismatched identity, malformed enemies and rewards from external providers', () => {
  const valid = { id: 'patrol', ...encounter };
  for (const bad of [null, [], {}, { ...valid, id: 'other' }, { ...valid, enemies: [] }, { ...valid, enemies: [encounter.enemies[0]!, encounter.enemies[0]!] }, { ...valid, enemies: [{ ...encounter.enemies[0]!, hp: 5 }] }, { ...valid, enemies: [{ ...encounter.enemies[0]!, speed: 0.5 }] }, { ...valid, experience: Infinity }, { ...valid, loot: { herb: 0 } }, { ...valid, cooldownSeconds: NaN }, { ...valid, unexpected: 1 }]) assert.throws(() => readSquad(readerContext, bad as JsonValue, 'patrol'));
});
test('Unicode code-point IDs and own keys work across catalog and policy identities', () => {
  const long = '🌟'.repeat(128), special = '名字 " 含空格';
  const terms = { ...encounter, location: long, enemies: [{ ...encounter.enemies[0]!, id: long }], loot: { toString: 1, [long]: 2 } };
  const w = setup('squads.catalog', { encounters: { [long]: terms, toString: encounter, [special]: encounter } });
  assert.deepEqual(w.query('policy', 'get', { encounter: long }), { id: long, ...terms });
  assert.equal((w.query('policy', 'get', { encounter: 'toString' }) as JsonObject).id, 'toString');
  assert.equal((w.query('policy', 'get', { encounter: special }) as JsonObject).id, special);
  assert.throws(() => w.query('policy', 'get', { encounter: 'hasOwnProperty' }));
  assert.throws(() => setup('squads.catalog', { encounters: { ['🌟'.repeat(129)]: encounter } }));
  for (const module of ['initiative.listed', 'initiative.speed']) {
    assert.deepEqual(setup(module).query('policy', 'order', { actors: [{ side: 'enemy', id: long, speed: Number.MAX_SAFE_INTEGER }, { side: 'party', id: long, speed: 0 }] }), { order: [{ side: 'enemy', id: long }, { side: 'party', id: long }] });
    assert.throws(() => setup(module).query('policy', 'order', { actors: [{ side: 'party', id: '🌟'.repeat(129), speed: 0 }] }));
  }
  for (const module of ['targeting.first', 'targeting.lowest-hp']) assert.deepEqual(setup(module).query('policy', 'choose', { candidates: [{ id: long, hp: Number.MAX_SAFE_INTEGER, maxHp: Number.MAX_SAFE_INTEGER }] }), { target: long });
});
test('stateless modules reject restored nonempty states and nonempty policy config', () => {
  for (const module of definitions) {
    const w = module.manifest.id === 'squads.catalog' ? catalog() : setup(module.manifest.id);
    const saved = w.snapshot(); saved.modules.policy!.state = { surprise: 1 };
    assert.throws(() => restoreWorld(registry(), saved));
    if (module.manifest.id !== 'squads.catalog') assert.throws(() => setup(module.manifest.id, { surprise: 1 }));
  }
});
