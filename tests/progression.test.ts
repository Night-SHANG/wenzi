import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { locationModule } from '../src/modules/location.ts';
import { progressionRulesModule } from '../src/modules/progression-rules.ts';
import { progressionModule } from '../src/modules/progression.ts';
import { vitalsModule } from '../src/modules/vitals.ts';
import { recoveryModule } from '../src/modules/recovery.ts';

const levels = () => [{ experience: 0, values: { maxHp: 20, attack: 4, defense: 1 } }, { experience: 20, values: { maxHp: 26, attack: 6, defense: 2 } }, { experience: 60, values: { maxHp: 34, attack: 8, defense: 3 } }];
const resolved = (experience: number): JsonObject => ({ experience, level: 1, floorExperience: 0, nextExperience: null, values: { maxHp: 20 } });
const externalRules: ModuleDefinition = {
  manifest: { id: 'test.progression-rule', title: '外部经验规则', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'progression-rule': '1.0.0' } }, initialState: () => ({}),
  queries: { resolve: { execute(ctx, input) { return input.experience === 0 ? resolved(0) : { ...resolved(input.experience as number), ...ctx.config.result as JsonObject }; } } }
};
const externalVitals: ModuleDefinition = {
  manifest: { id: 'test.vitals', title: '外部生命', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { vitals: '1.0.0' } }, initialState: () => ({ hp: 5 }),
  queries: { status: { execute(ctx) { return { hp: ctx.state<{ hp: number }>().hp, maxHp: 20 }; } } },
  commands: { heal: { execute(ctx) { ctx.write({ hp: 20 }); return ctx.config.result!; } } }
};
function registry(extra: ModuleDefinition[] = []) { return new ModuleRegistry([...capacityModules, inventoryModule, locationModule, progressionRulesModule, progressionModule, vitalsModule, recoveryModule, externalRules, externalVitals, ...extra]); }
function definition(): WorldDefinition { return { id: 'progression-test', title: '成长测试', version: '1', modules: [
  { id: 'capacity', module: 'capacity.slots', config: {} },
  { id: 'inventory', module: 'inventory.basic', config: { items: { tonic: { name: '药剂', weight: 1, volume: 1, length: 1 } }, containers: { bag: { limits: {}, items: { tonic: 2 } } } } },
  { id: 'location', module: 'location.nodes', config: { start: 'town', nodes: { town: { name: '城镇', description: '', exits: ['forest'] }, forest: { name: '林地', description: '', exits: ['town'] } } } },
  { id: 'rules', module: 'progression.curve', config: { levels: levels() } },
  { id: 'progression', module: 'progression.track', config: { initialExperience: 0 } },
  { id: 'vitals', module: 'vitals.pool', config: { initialHp: 20 } },
  { id: 'recovery', module: 'recovery.items', config: { container: 'bag', remedies: { tonic: { name: '药剂', item: 'tonic', healing: 20, locations: ['town'] } } } }
] }; }
function instance(d: WorldDefinition, id: string) { const m = d.modules.find(m => m.id === id); assert.ok(m); return m; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw Error('动作失败'); return r.value; }
function fails(w: World, target: string, action: string, input: JsonObject = {}) { const before = w.snapshot(); const r = w.dispatch({ target, action, input }); assert.equal(r.ok, false, JSON.stringify(r)); assert.deepEqual(w.snapshot(), before); }
function hp(w: World) { return w.query('vitals', 'status'); }
function xp(w: World) { return w.query('progression', 'status') as JsonObject; }
function count(w: World, item = 'tonic') { return (w.query('inventory', 'count', { container: 'bag', item }) as JsonObject).quantity; }
function remedies(d: WorldDefinition) { return instance(d, 'recovery').config.remedies as Record<string, JsonObject>; }
function external(result: JsonObject) { return setup(d => { instance(d, 'rules').module = 'test.progression-rule'; instance(d, 'rules').config = { result }; }); }

test('total experience resolves thresholds, preserves overflow and reaches a null next threshold', () => {
  const w = setup(); assert.deepEqual(xp(w), { experience: 0, level: 1, floorExperience: 0, nextExperience: 20, values: { maxHp: 20, attack: 4, defense: 1 } });
  assert.deepEqual(ok(w, 'progression', 'gain', { amount: 25 }), { experience: 25, level: 2, floorExperience: 20, nextExperience: 60, values: { maxHp: 26, attack: 6, defense: 2 } });
  ok(w, 'progression', 'gain', { amount: 50 }); assert.equal(xp(w).experience, 75); assert.equal(xp(w).level, 3); assert.equal(xp(w).nextExperience, null);
  const jump = setup(); ok(jump, 'progression', 'gain', { amount: 75 }); assert.deepEqual(xp(jump), xp(w));
});
test('curve rejects invalid thresholds and values and progression rejects bad initial experience', () => {
  for (const curve of [[], [{ experience: 1, values: {} }], [{ experience: 0, values: {} }, { experience: 0, values: {} }], [{ experience: 0, values: {} }, { experience: -1, values: {} }], [{ experience: 0.5, values: {} }], [{ experience: 0, values: { attack: -1 } }], [{ experience: 0, values: { attack: 0.5 } }], Array.from({ length: 1001 }, (_, experience) => ({ experience, values: {} }))]) assert.throws(() => setup(d => { instance(d, 'rules').config.levels = curve; }));
  for (const initialExperience of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup(d => { instance(d, 'progression').config.initialExperience = initialExperience; }));
});
test('gain accepts positive safe integers only and overflow leaves complete snapshot unchanged', () => {
  const w = setup(); for (const amount of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) fails(w, 'progression', 'gain', { amount });
  ok(w, 'progression', 'gain', { amount: Number.MAX_SAFE_INTEGER }); fails(w, 'progression', 'gain', { amount: 1 });
});
test('external rules support public capability replacement and reject malformed resolve fields atomically', () => {
  const w = external({}); ok(w, 'progression', 'gain', { amount: 25 }); assert.equal(xp(w).experience, 25);
  for (const result of [{ experience: 0 }, { experience: -1 }, { experience: 0.5 }, { level: 0 }, { level: 1.5 }, { level: 1001 }, { floorExperience: -1 }, { floorExperience: 0.5 }, { floorExperience: 26 }, { nextExperience: 25 }, { nextExperience: -1 }, { nextExperience: 25.5 }, { level: 2, floorExperience: 0 }, { level: 1, floorExperience: 1 }, { level: 1000, floorExperience: 1, nextExperience: 30 }, { values: { attack: -1 } }, { values: { attack: 1.5 } }, { values: [] }]) fails(external(result), 'progression', 'gain', { amount: 25 });
});
test('nonobject external rule results reject current state at assembly', () => {
  for (const result of [null, [], {}, { ...resolved(0), experience: 1 }, { ...resolved(0), level: -1 }]) {
    const bad: ModuleDefinition = { ...externalRules, manifest: { ...externalRules.manifest, id: 'test.bad-rule' }, queries: { resolve: { execute: () => result } } };
    const d = definition(); instance(d, 'rules').module = 'test.bad-rule'; instance(d, 'rules').config = {}; assert.throws(() => createWorld(registry([bad]), d));
  }
});
test('damage clamps at zero, growth leaves hp unchanged, healing clamps and full healing fails', () => {
  const w = setup(); assert.deepEqual(hp(w), { hp: 20, maxHp: 20 }); assert.deepEqual(ok(w, 'vitals', 'damage', { amount: 8 }), { hp: 12, maxHp: 20 });
  ok(w, 'progression', 'gain', { amount: 25 }); assert.deepEqual(hp(w), { hp: 12, maxHp: 26 }); assert.deepEqual(ok(w, 'vitals', 'heal', { amount: 20 }), { hp: 26, maxHp: 26 });
  fails(w, 'vitals', 'heal', { amount: 1 }); ok(w, 'vitals', 'damage', { amount: Number.MAX_SAFE_INTEGER }); assert.deepEqual(hp(w), { hp: 0, maxHp: 26 }); ok(w, 'vitals', 'heal', { amount: Number.MAX_SAFE_INTEGER }); assert.deepEqual(hp(w), { hp: 26, maxHp: 26 });
  for (const action of ['heal', 'damage']) for (const amount of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) fails(w, 'vitals', action, { amount });
});
test('maxHp must be a positive safe count and lowered curves cannot invalidate existing hp', () => {
  for (const maxHp of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '20']) assert.throws(() => setup(d => { const values = (instance(d, 'rules').config.levels as any)[0].values; delete values.maxHp; if (maxHp !== undefined) values.maxHp = maxHp; }));
  for (const initialHp of [-1, 0.5, 21, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => setup(d => { instance(d, 'vitals').config.initialHp = initialHp; }));
  const w = setup(); const before = w.snapshot(); const d = w.definition; (instance(d, 'rules').config.levels as any)[0].values.maxHp = 19; assert.throws(() => reconfigureWorld(registry(), w, d)); assert.deepEqual(w.snapshot(), before);
});
test('recovery at town consumes exactly one item and heals, including from zero', () => {
  const w = setup(); ok(w, 'vitals', 'damage', { amount: 8 }); assert.deepEqual(ok(w, 'recovery', 'use', { remedy: 'tonic' }), { hp: 20, maxHp: 20 }); assert.equal(count(w), 1);
  ok(w, 'vitals', 'damage', { amount: 20 }); ok(w, 'recovery', 'use', { remedy: 'tonic' }); assert.equal(count(w), 0); assert.deepEqual(hp(w), { hp: 20, maxHp: 20 });
});
test('full hp, wrong location, missing item and inherited remedy failures roll back complete snapshots', () => {
  const w = setup(); fails(w, 'recovery', 'use', { remedy: 'tonic' }); assert.equal(count(w), 2); ok(w, 'vitals', 'damage', { amount: 8 });
  ok(w, 'location', 'move', { to: 'forest' }); fails(w, 'recovery', 'use', { remedy: 'tonic' }); ok(w, 'location', 'move', { to: 'town' });
  ok(w, 'inventory', 'remove', { container: 'bag', item: 'tonic', quantity: 2 }); fails(w, 'recovery', 'use', { remedy: 'tonic' }); fails(w, 'recovery', 'use', { remedy: 'toString' });
});
test('malformed external healing results roll back the actual inventory removal and healer write', () => {
  for (const result of [null, [], {}, { hp: -1, maxHp: 20 }, { hp: 0.5, maxHp: 20 }, { hp: 21, maxHp: 20 }, { hp: 20, maxHp: 0 }, { hp: 20, maxHp: '20' }, { hp: 5, maxHp: 20 }]) {
    const w = setup(d => { instance(d, 'vitals').module = 'test.vitals'; instance(d, 'vitals').config = { result }; }); fails(w, 'recovery', 'use', { remedy: 'tonic' }); assert.equal(count(w), 2); assert.deepEqual(hp(w), { hp: 5, maxHp: 20 });
  }
});
test('all remedy references and optional location requirements validate at assembly', () => {
  for (const edit of [{ item: 'missing' }, { healing: 0 }, { healing: 0.5 }, { locations: ['missing'] }, { locations: ['town', 'town'] }]) assert.throws(() => setup(d => { Object.assign(remedies(d).tonic!, edit); }));
  assert.throws(() => setup(d => { d.modules = d.modules.filter(m => m.id !== 'location'); }));
  const w = setup(d => { d.modules = d.modules.filter(m => m.id !== 'location'); remedies(d).tonic!.locations = []; }); ok(w, 'vitals', 'damage', { amount: 1 }); ok(w, 'recovery', 'use', { remedy: 'tonic' });
  assert.throws(() => setup(d => { remedies(d).unselected = { name: '其他', item: 'missing', healing: 1, locations: [] }; }));
});
test('save restore and valid rule edits preserve total XP and actual hp', () => {
  const w = setup(); ok(w, 'progression', 'gain', { amount: 25 }); ok(w, 'vitals', 'damage', { amount: 8 }); const restored = restoreWorld(registry(), w.snapshot()); assert.deepEqual(xp(restored), xp(w)); assert.deepEqual(hp(restored), { hp: 12, maxHp: 26 });
  const d = restored.definition; instance(d, 'rules').config.levels = [{ experience: 0, values: { maxHp: 30 } }, { experience: 10, values: { maxHp: 40 } }]; const changed = reconfigureWorld(registry(), restored, d); assert.equal(xp(changed).experience, 25); assert.equal(xp(changed).level, 2); assert.deepEqual(hp(changed), { hp: 12, maxHp: 40 });
});
test('arbitrary own remedy item and stat keys survive queries commands and restore', () => {
  for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'white space " key', '药 剂']) {
    const w = setup(d => { instance(d, 'inventory').config.items = Object.fromEntries([[key, { name: key, weight: 0, volume: 0, length: 0 }]]); (instance(d, 'inventory').config.containers as any).bag.items = Object.fromEntries([[key, 1]]); instance(d, 'recovery').config.remedies = Object.fromEntries([[key, { name: key, item: key, healing: 20, locations: [] }]]); (instance(d, 'rules').config.levels as any)[0].values = Object.fromEntries([['maxHp', 20], [key, 7]]); });
    assert.equal((xp(w).values as JsonObject)[key], 7); assert.deepEqual(w.query('recovery', 'list'), { remedies: [{ id: key, name: key, item: key, healing: 20, locations: [] }] }); ok(w, 'vitals', 'damage', { amount: 1 }); ok(w, 'recovery', 'use', { remedy: key }); assert.equal(count(w, key), 0); assert.deepEqual(hp(restoreWorld(registry(), w.snapshot())), { hp: 20, maxHp: 20 });
  }
});

test('external level bounds require enough distinct integer thresholds for the reported level', () => {
  fails(external({ level: 3, floorExperience: 1, nextExperience: null }), 'progression', 'gain', { amount: 25 });
});
test('vitals independently checks consumed maxHp from an external progression capability', () => {
  for (const result of [null, [], {}, { values: null }, { values: {} }, { values: { maxHp: '20' } }, { values: { maxHp: 0 } }, { values: { maxHp: -1 } }, { values: { maxHp: 0.5 } }, { values: { maxHp: Number.MAX_SAFE_INTEGER + 1 } }]) {
    const provider: ModuleDefinition = { manifest: { id: 'test.progression', title: '外部成长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' } }, initialState: () => ({}), queries: { status: { execute: () => result } } };
    const d = definition(); instance(d, 'progression').module = 'test.progression'; instance(d, 'progression').config = {}; assert.throws(() => createWorld(registry([provider]), d));
  }
});
test('recovery validates external health inventory and location fields at their consumption boundaries', () => {
  for (const result of [null, {}, { hp: -1, maxHp: 20 }, { hp: 0.5, maxHp: 20 }, { hp: 21, maxHp: 20 }, { hp: 1, maxHp: 0 }]) {
    const provider: ModuleDefinition = { ...externalVitals, manifest: { ...externalVitals.manifest, id: 'test.bad-vitals' }, queries: { status: { execute: () => result } } };
    const d = definition(); instance(d, 'vitals').module = 'test.bad-vitals'; instance(d, 'vitals').config = {}; assert.throws(() => createWorld(registry([provider]), d));
  }
  for (const [action, result] of [['list', null], ['list', {}], ['list', { items: {} }], ['count', null], ['count', {}], ['count', { quantity: '2' }], ['count', { quantity: -1 }], ['count', { quantity: 0.5 }]] as [string, JsonValue][]) {
    const provider: ModuleDefinition = { ...inventoryModule, manifest: { ...inventoryModule.manifest, id: 'test.bad-inventory' }, queries: { ...inventoryModule.queries, [action]: { execute: () => result } } };
    const d = definition(); instance(d, 'inventory').module = 'test.bad-inventory'; assert.throws(() => createWorld(registry([provider]), d));
  }
  for (const action of ['describe', 'current']) for (const result of [null, {}, { id: 2 }, { id: '' }, { id: 'forest' }]) {
    const provider: ModuleDefinition = { ...locationModule, manifest: { ...locationModule.manifest, id: 'test.bad-location' }, queries: { ...locationModule.queries, [action]: { execute: () => result } } };
    const d = definition(); instance(d, 'location').module = 'test.bad-location';
    if (action === 'describe') assert.throws(() => createWorld(registry([provider]), d));
    else { const w = createWorld(registry([provider]), d); ok(w, 'vitals', 'damage', { amount: 1 }); fails(w, 'recovery', 'use', { remedy: 'tonic' }); }
  }
});

test('rebinding a valid external rule preserves accumulated XP while resolving its new curve', () => {
  const w = setup(); ok(w, 'progression', 'gain', { amount: 25 }); ok(w, 'vitals', 'damage', { amount: 8 });
  const d = w.definition; d.modules.push({ id: 'replacement', module: 'test.progression-rule', config: { result: {} } }); instance(d, 'progression').bindings = { 'progression-rule': 'replacement' };
  const changed = reconfigureWorld(registry(), w, d); assert.deepEqual(xp(changed), { experience: 25, level: 1, floorExperience: 0, nextExperience: null, values: { maxHp: 20 } }); assert.deepEqual(hp(changed), { hp: 12, maxHp: 20 });
});
test('progression supports arbitrary count stats without requiring a vitals-specific maxHp', () => {
  const w = setup(d => { d.modules = d.modules.filter(m => !['vitals', 'recovery'].includes(m.id)); instance(d, 'rules').config.levels = [{ experience: 0, values: { toString: 0, luck: 7 } }]; });
  assert.deepEqual(ok(w, 'progression', 'gain', { amount: 10 }), { experience: 10, level: 1, floorExperience: 0, nextExperience: null, values: { toString: 0, luck: 7 } });
});
test('rule queries use inclusive threshold boundaries and remain side effect free', () => {
  const w = setup(); const before = w.snapshot();
  for (const [experience, level, floorExperience, nextExperience] of [[0, 1, 0, 20], [19, 1, 0, 20], [20, 2, 20, 60], [59, 2, 20, 60], [60, 3, 60, null]] as const) {
    const result = w.query('rules', 'resolve', { experience }) as JsonObject; assert.equal(result.experience, experience); assert.equal(result.level, level); assert.equal(result.floorExperience, floorExperience); assert.equal(result.nextExperience, nextExperience);
  }
  w.query('recovery', 'list'); xp(w); hp(w); assert.deepEqual(w.snapshot(), before);
});
test('healing near the safe integer maximum clamps before addition', () => {
  const w = setup(d => { instance(d, 'rules').config.levels = [{ experience: 0, values: { maxHp: Number.MAX_SAFE_INTEGER } }]; instance(d, 'vitals').config.initialHp = Number.MAX_SAFE_INTEGER - 1; });
  assert.deepEqual(ok(w, 'vitals', 'heal', { amount: Number.MAX_SAFE_INTEGER }), { hp: Number.MAX_SAFE_INTEGER, maxHp: Number.MAX_SAFE_INTEGER });
});
