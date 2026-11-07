import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { sessionModule } from '../src/modules/battle-session.ts';
import { companionRulesModule } from '../src/modules/companion-rules.ts';
import { partyModule, readPartyMember, readPartyStatus } from '../src/modules/party.ts';
import { partyVitalsModule } from '../src/modules/party-vitals.ts';
import { progressionRulesModule } from '../src/modules/progression-rules.ts';
import { progressionModule } from '../src/modules/progression.ts';
import { attributesModule } from '../src/modules/attributes.ts';
import { vitalsModule } from '../src/modules/vitals.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { recoveryModule } from '../src/modules/recovery.ts';

const terms = { name: '阿岚', maxHp: 12, attack: 3, defense: 2, speed: 4 };
// These are ordinary capability providers used to exercise untrusted public responses.
const externalCatalog: ModuleDefinition = {
  manifest: { id: 'test.party-catalog', title: '外部目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'companion-rule': '1.0.0' } }, initialState: () => ({}),
  queries: {
    list: { execute: ctx => Object.hasOwn(ctx.config, 'list') ? ctx.config.list! : { companions: [{ id: 'alan', ...terms }] } },
    get: { execute: ctx => Object.hasOwn(ctx.config, 'get') ? ctx.config.get! : { id: 'alan', ...terms } }
  }
};
const externalVitals: ModuleDefinition = {
  manifest: { id: 'test.party-vitals', title: '外部生命', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { vitals: '1.0.0' } }, initialState: () => ({ hp: 10 }),
  queries: { status: { execute: ctx => Object.hasOwn(ctx.config, 'status') ? ctx.config.status! : { hp: ctx.state<{ hp: number }>().hp, maxHp: 20 } } },
  commands: Object.fromEntries(['heal', 'damage'].map(action => [action, { execute(ctx: import('../src/contracts.ts').ExecutionContext, input: JsonObject) {
    const before = ctx.state<{ hp: number }>().hp, amount = input.amount as number;
    const hp = action === 'heal' ? Math.min(20, before + amount) : Math.max(0, before - amount);
    ctx.write({ hp: ctx.config.noWrite ? before : hp }); ctx.emit('fixture.changed');
    if (ctx.config.fail) ctx.fail('LATE_FAILURE', '写入后拒绝');
    return Object.hasOwn(ctx.config, 'result') ? ctx.config.result! : { hp, maxHp: 20 };
  } }]))
};
const externalValues: ModuleDefinition = {
  manifest: { id: 'test.party-values', title: '外部属性', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { attributes: '1.0.0' } }, initialState: () => ({}), queries: { status: { execute: ctx => ctx.config.result! } }
};
const probe: ModuleDefinition = {
  manifest: { id: 'test.party-reader', title: '公开读取校验', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { party: { version: '^1.0.0' } } }, initialState: () => ({}),
  queries: { status: { execute: ctx => readPartyStatus(ctx) }, member: { execute: ctx => readPartyMember(ctx, ctx.query('party', 'member', { member: 'leader' }), 'leader') } }
};
const externalParty: ModuleDefinition = {
  manifest: { id: 'test.party', title: '外部队伍', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { party: '1.0.0' } }, initialState: () => ({}),
  queries: { status: { execute: ctx => ctx.config.result! }, member: { execute: ctx => ctx.config.member! } }
};
const externalPartyHealth: ModuleDefinition = {
  manifest: { id: 'test.party-health', title: '可替换队伍健康', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { party: '1.0.0' } }, initialState: () => ({ hp: 10 }),
  queries: {
    member: { execute(ctx) { return { id: 'leader', name: '领队', hp: ctx.state<{ hp: number }>().hp, maxHp: 20, attack: 5, defense: 1, speed: 6, isLeader: true, recruited: true, active: true, ...ctx.config.member as JsonObject }; } },
    status: { execute(ctx) { return { leader: 'leader', capacity: 0, active: ['leader'], members: [{ id: 'leader', name: '领队', hp: ctx.state<{ hp: number }>().hp, maxHp: 20, attack: 5, defense: 1, speed: 6, isLeader: true, recruited: true, active: true }] }; } }
  },
  commands: Object.fromEntries(['heal', 'damage'].map(action => [action, { execute(ctx: import('../src/contracts.ts').ExecutionContext, input: JsonObject) {
    const before = ctx.state<{ hp: number }>().hp, amount = input.amount as number;
    const hp = action === 'heal' ? Math.min(20, before + amount) : Math.max(0, before - amount);
    ctx.write({ hp: ctx.config.noWrite ? before : hp }); ctx.emit('fixture.party-health');
    return Object.hasOwn(ctx.config, 'result') ? ctx.config.result! : { id: 'leader', hp, maxHp: 20 };
  } }]))
};
const externalSession: ModuleDefinition = {
  manifest: { id: 'test.party-session', title: '外部会话', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'battle-session': '1.0.0' } }, initialState: () => ({}), queries: { status: { execute: ctx => ctx.config.result! } }
};
function registry() { return new ModuleRegistry([sessionModule, companionRulesModule, partyModule, partyVitalsModule, progressionRulesModule, progressionModule, vitalsModule, attributesModule, inventoryModule, ...capacityModules, recoveryModule, externalCatalog, externalVitals, externalValues, externalParty, externalPartyHealth, externalSession, probe]); }
function definition(): WorldDefinition { return { id: 'party-test', title: '队伍测试', version: '1', modules: [
  { id: 'rules', module: 'progression.curve', config: { levels: [{ experience: 0, values: { maxHp: 20, attack: 5, defense: 1 } }] } },
  { id: 'progression', module: 'progression.track', config: { initialExperience: 0 } },
  { id: 'leader-hp', module: 'vitals.pool', config: { initialHp: 20 } },
  { id: 'session', module: 'battle-session.exclusive', config: {} },
  { id: 'catalog', module: 'companions.catalog', config: { companions: { alan: { ...terms }, mei: { name: '梅', maxHp: 9, attack: 4, defense: 0, speed: 7 } } } },
  { id: 'party', module: 'party.roster', config: { leader: { id: 'leader', name: '领队', speed: 6 }, capacity: 2 }, bindings: { vitals: 'leader-hp' } },
  { id: 'selected', module: 'vitals.party-member', config: { initialMember: 'leader' } },
  { id: 'capacity', module: 'capacity.slots', config: {} },
  { id: 'inventory', module: 'inventory.basic', config: { items: { tonic: { name: '药剂', weight: 1, volume: 1, length: 1 } }, containers: { bag: { limits: {}, items: { tonic: 3 } } } } },
  { id: 'recovery', module: 'recovery.items', config: { container: 'bag', remedies: { tonic: { name: '药剂', item: 'tonic', healing: 5, locations: [] } } }, bindings: { vitals: 'selected' } }
] }; }
function instance(d: WorldDefinition, id: string) { const found = d.modules.find(m => m.id === id); assert.ok(found); return found; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw Error('动作失败'); return r.value; }
function fails(w: World, target: string, action: string, input: JsonObject = {}) { const before = w.snapshot(), r = w.dispatch({ target, action, input }); assert.equal(r.ok, false, JSON.stringify(r)); assert.deepEqual(w.snapshot(), before); }
function member(w: World, id = 'alan') { return w.query('party', 'member', { member: id }) as JsonObject; }
function status(w: World) { return w.query('party', 'status') as JsonObject; }

test('recruit reserve activate damage reserve activate preserves companion HP and real leader HP', () => {
  const w = setup(); assert.equal(member(w).hp, 0); assert.equal(member(w).recruited, false);
  ok(w, 'party', 'recruit', { member: 'alan' }); assert.equal(member(w).hp, 12); assert.equal(member(w).active, false);
  ok(w, 'party', 'setActive', { members: ['alan'] }); ok(w, 'party', 'damage', { member: 'alan', amount: 5 });
  ok(w, 'party', 'setActive', { members: [] }); ok(w, 'party', 'setActive', { members: ['alan'] });
  assert.equal(member(w).hp, 7); assert.deepEqual(status(w).active, ['leader', 'alan']);
  assert.deepEqual(ok(w, 'party', 'damage', { member: 'leader', amount: 3 }), { id: 'leader', hp: 17, maxHp: 20 });
  assert.deepEqual(w.query('leader-hp', 'status'), { hp: 17, maxHp: 20 }); assert.deepEqual(w.read('selected'), { member: 'leader' });
  fails(w, 'party', 'recruit', { member: 'alan' }); assert.equal(member(w).hp, 7);
});
test('frozen companion terms and persistent HP survive current catalog edits deletion and restore', () => {
  const w = setup(); ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'damage', { member: 'alan', amount: 3 });
  const d = w.definition; instance(d, 'catalog').config.companions = { alan: { ...terms, maxHp: 99, attack: 99, name: '改名' } };
  const edited = reconfigureWorld(registry(), w, d); assert.equal(member(edited).name, '阿岚'); assert.equal(member(edited).maxHp, 12); assert.equal(member(edited).attack, 3); assert.equal(member(edited).hp, 9);
  const deleted = edited.definition; instance(deleted, 'catalog').config.companions = {};
  const restored = restoreWorld(registry(), reconfigureWorld(registry(), edited, deleted).snapshot()); assert.equal(member(restored).hp, 9); assert.equal(member(restored).recruited, true);
  ok(restored, 'party', 'setActive', { members: ['alan'] }); assert.deepEqual(status(restored).active, ['leader', 'alan']);
});
test('roster capacity duplicates unknown unowned and leader collisions reject without changing snapshots', () => {
  const w = setup(d => { instance(d, 'party').config.capacity = 1; });
  for (const id of ['missing', 'toString']) fails(w, 'party', 'recruit', { member: id });
  fails(w, 'party', 'setActive', { members: ['alan'] }); fails(w, 'party', 'damage', { member: 'alan', amount: 1 }); fails(w, 'party', 'heal', { member: 'alan', amount: 1 });
  ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'recruit', { member: 'mei' });
  for (const members of [['alan', 'mei'], ['alan', 'alan'], ['leader'], ['missing']]) fails(w, 'party', 'setActive', { members });
  assert.throws(() => setup(d => { (instance(d, 'catalog').config.companions as JsonObject).leader = { ...terms }; }));
  const d = w.definition; (instance(d, 'party').config.leader as JsonObject).id = 'alan'; assert.throws(() => reconfigureWorld(registry(), w, d));
  const zero = setup(d => { instance(d, 'party').config.capacity = 0; }); ok(zero, 'party', 'recruit', { member: 'alan' }); fails(zero, 'party', 'setActive', { members: ['alan'] }); ok(zero, 'party', 'setActive', { members: [] });
});
test('exclusive session requires exact owner and locks roster until accurate release while allowing healing', () => {
  const w = setup(); ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'damage', { member: 'alan', amount: 4 });
  fails(w, 'session', 'release', { owner: 'controller' }); assert.deepEqual(ok(w, 'session', 'acquire', { owner: 'controller' }), { owner: 'controller' });
  for (const owner of ['controller', 'other']) fails(w, 'session', 'acquire', { owner });
  fails(w, 'party', 'recruit', { member: 'mei' }); fails(w, 'party', 'setActive', { members: ['alan'] }); fails(w, 'session', 'release', { owner: 'other' });
  ok(w, 'party', 'heal', { member: 'alan', amount: 2 }); assert.equal(member(w).hp, 10);
  assert.deepEqual(ok(w, 'session', 'release', { owner: 'controller' }), { owner: null }); ok(w, 'party', 'setActive', { members: ['alan'] });
});
test('selected vitals reuse real recovery inventory for leader and reserve companion without copying HP', () => {
  const w = setup(); fails(w, 'selected', 'select', { member: 'alan' }); ok(w, 'party', 'recruit', { member: 'alan' });
  ok(w, 'party', 'damage', { member: 'leader', amount: 8 }); ok(w, 'party', 'damage', { member: 'alan', amount: 9 });
  assert.deepEqual(ok(w, 'selected', 'select', { member: 'alan' }), { member: 'alan', name: '阿岚' });
  assert.deepEqual(ok(w, 'recovery', 'use', { remedy: 'tonic' }), { hp: 8, maxHp: 12 }); assert.equal(member(w).hp, 8); assert.equal(member(w, 'leader').hp, 12);
  assert.deepEqual(w.query('inventory', 'count', { container: 'bag', item: 'tonic' }), { quantity: 2 });
  assert.deepEqual(w.read('selected'), { member: 'alan' }); assert.deepEqual(w.query('selected', 'selection'), { member: 'alan', name: '阿岚' });
  assert.deepEqual(ok(w, 'selected', 'heal', { amount: 99 }), { hp: 12, maxHp: 12 }); fails(w, 'recovery', 'use', { remedy: 'tonic' });
  ok(w, 'selected', 'select', { member: 'leader' }); ok(w, 'recovery', 'use', { remedy: 'tonic' }); assert.equal(member(w, 'leader').hp, 17);
  const restored = restoreWorld(registry(), w.snapshot()); assert.equal(member(restored).hp, 12); assert.equal(member(restored, 'leader').hp, 17); assert.deepEqual(restored.read('selected'), { member: 'leader' });
});
test('healing clamps safely and zero HP remains persistent with positive safe amount requirements', () => {
  const w = setup(); ok(w, 'party', 'recruit', { member: 'alan' }); fails(w, 'party', 'heal', { member: 'alan', amount: 1 });
  assert.deepEqual(ok(w, 'party', 'damage', { member: 'alan', amount: Number.MAX_SAFE_INTEGER }), { id: 'alan', hp: 0, maxHp: 12 });
  assert.deepEqual(ok(w, 'party', 'heal', { member: 'alan', amount: Number.MAX_SAFE_INTEGER }), { id: 'alan', hp: 12, maxHp: 12 });
  for (const amount of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) for (const action of ['heal', 'damage']) { fails(w, 'party', action, { member: 'alan', amount }); fails(w, 'selected', action, { amount }); }
});
test('current external catalogs reject malformed list get mismatch and duplicate IDs even for frozen members', () => {
  const bad: JsonValue[] = [null, [], {}, { companions: [null] }, { companions: [{ id: 'alan', ...terms }, { id: 'alan', ...terms }] }, { companions: [{ id: 'alan', ...terms, attack: 0 }] }];
  for (const list of bad) assert.throws(() => setup(d => { instance(d, 'catalog').module = 'test.party-catalog'; instance(d, 'catalog').config = { list }; }));
  for (const get of [null, {}, { id: 'mei', ...terms }, { id: 'alan', ...terms, name: '' }, { id: 'alan', ...terms, speed: -1 }, { id: 'alan', ...terms, attack: 4 }]) assert.throws(() => setup(d => { instance(d, 'catalog').module = 'test.party-catalog'; instance(d, 'catalog').config = { get }; }));
  const w = setup(); ok(w, 'party', 'recruit', { member: 'alan' }); const d = w.definition; instance(d, 'catalog').module = 'test.party-catalog'; instance(d, 'catalog').config = { get: { id: 'alan', ...terms, maxHp: 0 } }; assert.throws(() => reconfigureWorld(registry(), w, d));
});
test('malformed current leader vitals and attack defense fields fail at public consumption', () => {
  for (const result of [null, [], {}, { hp: -1, maxHp: 20 }, { hp: 21, maxHp: 20 }, { hp: 1.5, maxHp: 20 }, { hp: 1, maxHp: 0 }, { hp: 1, maxHp: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => setup(d => { instance(d, 'leader-hp').module = 'test.party-vitals'; instance(d, 'leader-hp').config = { status: result }; }));
  for (const result of [null, {}, { values: [] }, { values: {} }, { values: { attack: -1, defense: 0 } }, { values: { attack: 1, defense: 0.5 } }, { values: { attack: Number.MAX_SAFE_INTEGER + 1, defense: 0 } }]) assert.throws(() => setup(d => { d.modules.push({ id: 'attributes', module: 'test.party-values', config: { result } }); instance(d, 'party').bindings = { vitals: 'leader-hp', attributes: 'attributes', progression: 'progression' }; }));
  const w = setup(d => { d.modules.push({ id: 'attributes', module: 'test.party-values', config: { result: { values: { attack: 0, defense: 9 } } } }); instance(d, 'party').bindings = { vitals: 'leader-hp', attributes: 'attributes', progression: 'progression' }; }); assert.equal(member(w, 'leader').attack, 0); assert.equal(member(w, 'leader').defense, 9);
});
test('partial leader delegate writes events malformed return and false success all roll back whole snapshots', () => {
  for (const config of [{ fail: true }, { result: { hp: 9, maxHp: 20 } }, { noWrite: true }, { result: null }]) {
    const w = setup(d => { instance(d, 'leader-hp').module = 'test.party-vitals'; instance(d, 'leader-hp').config = config; });
    fails(w, 'party', 'damage', { member: 'leader', amount: 2 }); fails(w, 'selected', 'heal', { amount: 3 }); fails(w, 'recovery', 'use', { remedy: 'tonic' });
  }
});
test('own special keys quoted IDs and astral 65 128 code points survive recruitment selection and restore', () => {
  for (const id of ['toString', 'hasOwnProperty', '伙伴 " 名', '😀'.repeat(65), '😀'.repeat(128)]) {
    const w = setup(d => { instance(d, 'catalog').config.companions = Object.fromEntries([[id, { ...terms }]]); });
    ok(w, 'party', 'recruit', { member: id }); ok(w, 'party', 'setActive', { members: [id] }); ok(w, 'selected', 'select', { member: id }); ok(w, 'selected', 'damage', { amount: 2 });
    assert.equal(member(w, id).hp, 10); assert.deepEqual(status(w).active, ['leader', id]); assert.deepEqual(restoreWorld(registry(), w.snapshot()).read('selected'), { member: id });
  }
  assert.throws(() => setup(d => { instance(d, 'catalog').config.companions = Object.fromEntries([['😀'.repeat(129), { ...terms }]]); }));
  const w = setup(); for (const id of ['', '😀'.repeat(129)]) { fails(w, 'party', 'recruit', { member: id }); fails(w, 'session', 'acquire', { owner: id }); fails(w, 'selected', 'select', { member: id }); }
});
test('queries are pure status member agree and public reader rejects inconsistent leader flags and active lists', () => {
  const w = setup(); ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'setActive', { members: ['alan'] }); const before = w.snapshot();
  const s = status(w); assert.deepEqual((s.members as JsonObject[]).map(m => m.id), ['leader', 'alan', 'mei']); for (const m of s.members as JsonObject[]) assert.deepEqual(member(w, m.id as string), m); w.query('selected', 'status'); w.query('selected', 'selection'); assert.deepEqual(w.snapshot(), before);
  const leader = { id: 'leader', name: '领队', hp: 20, maxHp: 20, attack: 5, defense: 1, speed: 6, isLeader: true, recruited: true, active: true };
  const valid = { leader: 'leader', capacity: 1, active: ['leader'], members: [leader] };
  const read = (result: JsonValue, m: JsonValue = leader) => createWorld(registry(), { id: 'reader', title: 'reader', version: '1', modules: [{ id: 'external', module: 'test.party', config: { result, member: m } }, { id: 'probe', module: 'test.party-reader', config: {} }] });
  assert.deepEqual(read(valid).query('probe', 'status'), valid);
  for (const result of [{ ...valid, active: [] }, { ...valid, active: ['leader', 'leader'] }, { ...valid, active: ['leader', 'missing'] }, { ...valid, members: [leader, leader] }, { ...valid, members: [{ ...leader, active: false }] }, { ...valid, members: [{ ...leader, recruited: false }] }, { ...valid, leader: 'other' }, { ...valid, members: [{ ...leader, isLeader: false }] }]) assert.throws(() => read(result).query('probe', 'status'));
  for (const m of [{ ...leader, id: 'other' }, { ...leader, recruited: false }, { ...leader, active: false }, { ...leader, hp: 21 }]) assert.throws(() => read(valid, m).query('probe', 'member'));
});
test('unknown config state command fields and corrupt saved roster relationships reject', () => {
  for (const id of ['party', 'selected', 'session', 'catalog']) assert.throws(() => setup(d => { instance(d, id).config.extra = 1; }));
  const w = setup(); fails(w, 'party', 'recruit', { member: 'alan', extra: 1 }); fails(w, 'session', 'acquire', { owner: 'x', extra: 1 });
  ok(w, 'party', 'recruit', { member: 'alan' });
  for (const patch of [{ active: ['alan', 'alan'] }, { active: ['missing'] }, { active: ['leader'] }, { members: { alan: { id: 'other', ...terms, hp: 12 } } }, { members: { alan: { id: 'alan', ...terms, hp: 13 } } }]) {
    const snapshot = w.snapshot(); Object.assign(snapshot.modules.party!.state as JsonObject, patch); assert.throws(() => restoreWorld(registry(), snapshot));
  }
});

test('adapter rejects dishonest party health returns and actual readbacks atomically with real item removal', () => {
  for (const config of [{ noWrite: true }, { result: null }, { result: {} }, { result: { id: 'other', hp: 15, maxHp: 20 } }, { result: { id: 'leader', hp: 12, maxHp: 20 } }, { result: { id: 'leader', hp: 15, maxHp: 21 } }]) {
    const w = setup(d => { const p = instance(d, 'party'); p.module = 'test.party-health'; p.config = config; delete p.bindings; });
    fails(w, 'selected', 'heal', { amount: 5 }); fails(w, 'recovery', 'use', { remedy: 'tonic' }); assert.deepEqual(w.read('selected'), { member: 'leader' });
  }
  assert.throws(() => setup(d => { const p = instance(d, 'party'); p.module = 'test.party-health'; p.config = { member: { name: '不同名称' } }; delete p.bindings; }));
});
test('malformed session owners and unowned initial selection fail closed', () => {
  for (const result of [null, {}, { owner: 1 }, { owner: '' }, { owner: '😀'.repeat(129) }]) assert.throws(() => setup(d => { instance(d, 'session').module = 'test.party-session'; instance(d, 'session').config = { result }; }));
  for (const initialMember of ['alan', 'missing']) assert.throws(() => setup(d => { instance(d, 'selected').config.initialMember = initialMember; }));
  const w = setup(); const snapshot = w.snapshot(); (snapshot.modules.selected!.state as JsonObject).member = 'alan'; assert.throws(() => restoreWorld(registry(), snapshot));
});
test('real leader progression and attributes remain live while companion terms remain frozen', () => {
  const w = setup(d => {
    instance(d, 'rules').config.levels = [{ experience: 0, values: { maxHp: 20, attack: 5, defense: 1 } }, { experience: 10, values: { maxHp: 30, attack: 8, defense: 3 } }];
    d.modules.push({ id: 'attributes', module: 'attributes.additive', config: { keys: [] } });
  });
  ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'damage', { member: 'leader', amount: 4 }); ok(w, 'progression', 'gain', { amount: 10 });
  assert.deepEqual(member(w, 'leader'), { id: 'leader', name: '领队', speed: 6, hp: 16, maxHp: 30, attack: 8, defense: 3, isLeader: true, recruited: true, active: true });
  assert.equal(member(w).maxHp, 12); assert.equal(member(w).attack, 3); assert.deepEqual(w.read('party'), { members: { alan: { id: 'alan', ...terms, hp: 12 } }, active: [] });
});
test('companion near maximum safe HP heals by remaining capacity before addition', () => {
  const w = setup(d => { (instance(d, 'catalog').config.companions as JsonObject).alan = { ...terms, maxHp: Number.MAX_SAFE_INTEGER }; });
  ok(w, 'party', 'recruit', { member: 'alan' }); ok(w, 'party', 'damage', { member: 'alan', amount: 1 });
  assert.deepEqual(ok(w, 'party', 'heal', { member: 'alan', amount: Number.MAX_SAFE_INTEGER }), { id: 'alan', hp: Number.MAX_SAFE_INTEGER, maxHp: Number.MAX_SAFE_INTEGER });
});
