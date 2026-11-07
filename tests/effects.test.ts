import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { effectRulesModule } from '../src/modules/effect-rules.ts';
import { effectRefreshModule, effectExtendModule } from '../src/modules/effect-duration.ts';
import { effectsModule } from '../src/modules/effects.ts';
import { timeModules } from '../src/modules/time.ts';

const externalDuration: ModuleDefinition = {
  manifest: { id: 'test.duration', title: '外部持续策略', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'effect-duration': '1.0.0' } },
  initialState: () => ({}), queries: { resolve: { execute: ctx => ctx.config.result! } }
};
const externalCatalog: ModuleDefinition = {
  manifest: { id: 'test.effect-catalog', title: '外部目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'effect-rule': '1.0.0' } },
  initialState: () => ({}), queries: {
    list: { execute: ctx => ctx.config.list! }, get: { execute: ctx => ctx.config.get! }
  }
};
const driver: ModuleDefinition = {
  manifest: { id: 'test.effect-driver', title: '事务调用者', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { effects: { version: '^1.0.0' } } },
  initialState: () => ({ attempts: 0 }), commands: { apply: { execute(ctx, input) { ctx.write({ attempts: 1 }); return ctx.call('effects', 'apply', input); } } }
};
function registry() { return new ModuleRegistry([effectRulesModule, effectRefreshModule, effectExtendModule, effectsModule, ...timeModules, externalDuration, externalCatalog, driver]); }
function definition(): WorldDefinition { return { id: 'effects-test', title: '效果测试', version: '1', modules: [
  { id: 'clock', module: 'time.step', config: { secondsPerStep: 10 } },
  { id: 'rules', module: 'effects.catalog', config: { effects: { vigor: { name: '振奋', durationSeconds: 20, modifiers: { attack: 2 } } } } },
  { id: 'duration', module: 'effect-duration.refresh', config: {} },
  { id: 'effects', module: 'effects.timed', config: {} }
] }; }
function instance(d: WorldDefinition, id: string) { const value = d.modules.find(x => x.id === id); assert.ok(value); return value; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw Error('动作失败'); return r.value; }
function fails(w: World, target: string, action: string, input: JsonObject = {}, code?: string) { const before = w.snapshot(), r = w.dispatch({ target, action, input }); assert.equal(r.ok, false, JSON.stringify(r)); if (!r.ok && code) assert.equal(r.error.code, code); assert.deepEqual(w.snapshot(), before); }
function status(w: World) { return w.query('effects', 'status') as JsonObject; }
function apply(w: World, effect = 'vigor') { return ok(w, 'effects', 'apply', { effect }); }
function advance(w: World, steps = 1) { return ok(w, 'clock', 'advance', { steps }); }
function catalog(d: WorldDefinition) { return instance(d, 'rules').config.effects as Record<string, JsonObject>; }

// Missing extension/refresh or using a relative timer changes these hand-calculated deadlines.
for (const [module, deadline] of [['effect-duration.refresh', 30], ['effect-duration.extend', 40]] as const) test(`${module} reapplies at second10 with an absolute deadline of ${deadline}`, () => {
  const w = setup(d => { instance(d, 'duration').module = module; }); apply(w); advance(w); apply(w);
  assert.deepEqual(status(w), { now: 10, effects: [{ id: 'vigor', name: '振奋', modifiers: { attack: 2 }, startedAt: 10, expiresAt: deadline, remainingSeconds: deadline - 10 }], modifiers: { attack: 2 } });
});
test('refresh preserves a longer deadline and both strategies validate elapsed, overflow and subprecision', () => {
  const w = setup();
  assert.deepEqual(w.query('duration', 'resolve', { now: 10, durationSeconds: 2, currentExpiresAt: 50 }), { expiresAt: 50 });
  assert.deepEqual(w.query('duration', 'resolve', { now: 10.5, durationSeconds: 0.25, currentExpiresAt: 9 }), { expiresAt: 10.75 });
  for (const module of ['effect-duration.refresh', 'effect-duration.extend']) {
    const v = setup(d => { instance(d, 'duration').module = module; });
    for (const input of [{ now: -1, durationSeconds: 2, currentExpiresAt: null }, { now: 0, durationSeconds: 0, currentExpiresAt: null }, { now: 0, durationSeconds: -1, currentExpiresAt: null }, { now: 0, durationSeconds: 1, currentExpiresAt: -1 }, { now: Number.MAX_SAFE_INTEGER, durationSeconds: 1, currentExpiresAt: null }, { now: Number.MAX_SAFE_INTEGER - 1, durationSeconds: 0.01, currentExpiresAt: Number.MAX_SAFE_INTEGER }]) assert.throws(() => v.query('duration', 'resolve', input));
  }
});
test('expiry equality removes contribution; status is pure and commands remove and reapply', () => {
  const w = setup(); apply(w); const before = w.snapshot(); status(w); status(w); assert.deepEqual(w.snapshot(), before);
  advance(w, 2); assert.deepEqual(status(w), { now: 20, effects: [], modifiers: {} }); assert.deepEqual(w.read('effects'), { observedAt: 20, active: {} });
  fails(w, 'effects', 'remove', { effect: 'vigor' }); apply(w); ok(w, 'effects', 'remove', { effect: 'vigor' }); assert.deepEqual(status(w), { now: 20, effects: [], modifiers: {} }); fails(w, 'effects', 'remove', { effect: 'vigor' }); apply(w);
  assert.equal((status(w).effects as JsonObject[])[0]!.expiresAt, 40);
});
test('a query filters expired records without pruning saved state', () => {
  const w = setup(); apply(w); const saved = w.snapshot(); (saved.modules.clock!.state as JsonObject).elapsedSeconds = 20;
  const restored = restoreWorld(registry(), saved), before = restored.snapshot();
  assert.deepEqual(status(restored), { now: 20, effects: [], modifiers: {} }); assert.deepEqual(restored.snapshot(), before);
  assert.ok(Object.hasOwn((restored.read('effects') as JsonObject).active as JsonObject, 'vigor'));
});
test('foreign clock events do not advance observation or prune effects', () => {
  const w = setup(d => { d.modules.push({ id: 'foreign', module: 'time.continuous', config: {} }); instance(d, 'effects').bindings = { time: 'clock' }; }); apply(w);
  ok(w, 'foreign', 'advance', { seconds: 30 }); assert.deepEqual(w.read('effects'), { observedAt: 0, active: { vigor: { id: 'vigor', name: '振奋', modifiers: { attack: 2 }, startedAt: 0, expiresAt: 20 } } });
  advance(w); assert.equal(status(w).now, 10);
});
test('saved active effects survive step/continuous replacement and observedAt rejects backward clocks after pruning', () => {
  const w = setup(); apply(w); advance(w); const saved = w.snapshot(); const restored = restoreWorld(registry(), saved); assert.deepEqual(restored.snapshot(), saved);
  const next = structuredClone(saved.definition); instance(next, 'clock').module = 'time.continuous'; instance(next, 'clock').config = {};
  const continuous = reconfigureWorld(registry(), restored, next); ok(continuous, 'clock', 'advance', { seconds: 0.5 }); assert.equal((status(continuous).effects as JsonObject[])[0]!.remainingSeconds, 9.5);
  const back = structuredClone(next); instance(back, 'clock').module = 'time.step'; instance(back, 'clock').config = { secondsPerStep: 0.5 };
  const step = reconfigureWorld(registry(), continuous, back); advance(step, 19); assert.deepEqual(status(step), { now: 20, effects: [], modifiers: {} });
  const reverse = step.snapshot(); (reverse.modules.clock!.state as JsonObject).elapsedSeconds = 19; assert.throws(() => restoreWorld(registry(), reverse), /时间基线/);
});
test('active name/modifiers/deadline stay frozen under current catalog edits and deletion; reapply adopts new terms', () => {
  const w = setup(); apply(w); advance(w); const next = structuredClone(w.snapshot().definition); catalog(next).vigor = { name: '新振奋', durationSeconds: 5, modifiers: { attack: 7 } };
  const edited = reconfigureWorld(registry(), w, next); assert.deepEqual((status(edited).effects as JsonObject[])[0], { id: 'vigor', name: '振奋', modifiers: { attack: 2 }, startedAt: 0, expiresAt: 20, remainingSeconds: 10 });
  apply(edited); assert.deepEqual((status(edited).effects as JsonObject[])[0], { id: 'vigor', name: '新振奋', modifiers: { attack: 7 }, startedAt: 10, expiresAt: 20, remainingSeconds: 10 });
  const deleted = structuredClone(next); delete catalog(deleted).vigor; const removed = reconfigureWorld(registry(), edited, deleted); assert.equal((status(removed).modifiers as JsonObject).attack, 7); fails(removed, 'effects', 'apply', { effect: 'vigor' }); ok(removed, 'effects', 'remove', { effect: 'vigor' });
  const bad = structuredClone(next); catalog(bad).bad = { name: '坏', durationSeconds: 0, modifiers: {} }; assert.throws(() => reconfigureWorld(registry(), w, bad));
});
test('catalog rejects malformed external list/get terms and disagreements independently of frozen records', () => {
  const valid = { id: 'vigor', name: '振奋', durationSeconds: 20, modifiers: { attack: 2 } };
  for (const [list, get] of [[null, valid], [{ effects: [valid, valid] }, valid], [{ effects: [valid] }, { ...valid, durationSeconds: 21 }], [{ effects: [valid] }, { ...valid, id: 'other' }], [{ effects: [{ ...valid, modifiers: { attack: 0.5 } }] }, valid], [{ effects: [{ ...valid, durationSeconds: -1 }] }, valid]]) assert.throws(() => setup(d => { instance(d, 'rules').module = 'test.effect-catalog'; instance(d, 'rules').config = { list, get }; }));
});
test('bad duration results roll back the caller and effects, including shorter active deadline', () => {
  for (const result of [null, [], {}, { expiresAt: 0 }, { expiresAt: -1 }, { expiresAt: Number.MAX_SAFE_INTEGER + 1 }, { expiresAt: '20' }]) {
    const w = setup(d => { instance(d, 'duration').module = 'test.duration'; instance(d, 'duration').config = { result }; d.modules.push({ id: 'driver', module: 'test.effect-driver', config: {} }); });
    fails(w, 'driver', 'apply', { effect: 'vigor' });
  }
  const w = setup(d => { instance(d, 'duration').module = 'test.duration'; instance(d, 'duration').config = { result: { expiresAt: 20 } }; }); apply(w); advance(w); const next = structuredClone(w.snapshot().definition); instance(next, 'duration').config = { result: { expiresAt: 15 } }; const shorter = reconfigureWorld(registry(), w, next); fails(shorter, 'effects', 'apply', { effect: 'vigor' });
});
test('signed modifier aggregation overflow rolls back the second application', () => {
  const w = setup(d => { catalog(d).vigor!.modifiers = { attack: Number.MAX_SAFE_INTEGER }; catalog(d).extra = { name: '追加', durationSeconds: 20, modifiers: { attack: 1 } }; });
  apply(w); fails(w, 'effects', 'apply', { effect: 'extra' }); assert.equal((status(w).modifiers as JsonObject).attack, Number.MAX_SAFE_INTEGER);
});
test('Unicode code-point IDs and ordinary own keys remain legal without inherited lookups', () => {
  const effect = '🗡'.repeat(128), modifier = '🌟'.repeat(128);
  const w = setup(d => { instance(d, 'rules').config.effects = { [effect]: { name: '星', durationSeconds: 0.5, modifiers: { [modifier]: -2, toString: 3 } }, toString: { name: '自有', durationSeconds: 1, modifiers: { valueOf: 4 } } }; });
  apply(w, effect); apply(w, 'toString'); assert.deepEqual(status(w).modifiers, { [modifier]: -2, toString: 3, valueOf: 4 }); fails(w, 'effects', 'apply', { effect: 'hasOwnProperty' });
  assert.throws(() => setup(d => { instance(d, 'rules').config.effects = { ['🗡'.repeat(129)]: { name: '长', durationSeconds: 1, modifiers: {} } }; }));
});
test('restored frozen records validate their own ID/timestamps/modifiers even when absent from catalog', () => {
  const w = setup(); apply(w);
  for (const changes of [{ id: 'other' }, { startedAt: 1 }, { expiresAt: 0 }, { modifiers: { attack: 0.1 } }]) {
    const saved = w.snapshot(); const state = saved.modules.effects!.state as JsonObject; Object.assign((state.active as JsonObject).vigor as JsonObject, changes); assert.throws(() => restoreWorld(registry(), saved));
  }
});
test('duration policy replacement accepts only known empty stateless version1 and preserves frozen deadline', () => {
  const w = setup(); apply(w); advance(w); const next = structuredClone(w.snapshot().definition); instance(next, 'duration').module = 'effect-duration.extend';
  const extended = reconfigureWorld(registry(), w, next); assert.equal((status(extended).effects as JsonObject[])[0]!.expiresAt, 20); apply(extended); assert.equal((status(extended).effects as JsonObject[])[0]!.expiresAt, 40);
  instance(next, 'duration').module = 'effect-duration.refresh'; const refresh = reconfigureWorld(registry(), extended, next); apply(refresh); assert.equal((status(refresh).effects as JsonObject[])[0]!.expiresAt, 40);
  for (const previous of [{ moduleId: 'effect-duration.refresh', version: '1.0.0', stateVersion: 1, state: { unknown: 1 } }, { moduleId: 'unknown', version: '1.0.0', stateVersion: 1, state: {} }, { moduleId: 'effect-duration.refresh', version: '2.0.0', stateVersion: 1, state: {} }, { moduleId: 'effect-duration.refresh', version: '1.0.0', stateVersion: 2, state: {} }]) assert.throws(() => effectExtendModule.migrate!(previous, {}));
});
test('overflow and invisible positive durations reject complete effect applications, preserving clock and caller', () => {
  for (const durationSeconds of [2, 0.01]) {
    const w = setup(d => { catalog(d).vigor!.durationSeconds = durationSeconds; d.modules.push({ id: 'driver', module: 'test.effect-driver', config: {} }); });
    const saved = w.snapshot(); (saved.modules.clock!.state as JsonObject).elapsedSeconds = Number.MAX_SAFE_INTEGER - 1;
    const nearLimit = restoreWorld(registry(), saved); fails(nearLimit, 'driver', 'apply', { effect: 'vigor' });
  }
});
test('extend checks precision at the retained deadline and refresh accepts an expired current deadline', () => {
  const w = setup(d => { instance(d, 'duration').module = 'effect-duration.extend'; });
  assert.throws(() => w.query('duration', 'resolve', { now: 1, durationSeconds: 0.01, currentExpiresAt: Number.MAX_SAFE_INTEGER - 1 }));
  const refresh = setup(); assert.deepEqual(refresh.query('duration', 'resolve', { now: 10, durationSeconds: 2, currentExpiresAt: 5 }), { expiresAt: 12 });
});
test('negative signed aggregate overflow is rejected atomically as well as positive overflow', () => {
  const w = setup(d => { catalog(d).vigor!.modifiers = { attack: -Number.MAX_SAFE_INTEGER }; catalog(d).extra = { name: '追加', durationSeconds: 20, modifiers: { attack: -1 } }; });
  apply(w); fails(w, 'effects', 'apply', { effect: 'extra' }); assert.deepEqual(status(w).modifiers, { attack: -Number.MAX_SAFE_INTEGER });
});
