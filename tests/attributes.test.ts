import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld } from '../src/engine/index.ts';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { attributesModule } from '../src/modules/attributes.ts';
import { effectRulesModule } from '../src/modules/effect-rules.ts';
import { effectRefreshModule } from '../src/modules/effect-duration.ts';
import { effectsModule } from '../src/modules/effects.ts';
import { progressionRulesModule } from '../src/modules/progression-rules.ts';
import { progressionModule } from '../src/modules/progression.ts';
import { timeModules } from '../src/modules/time.ts';

// Ordinary replacement providers expose the complete status shape while the sibling
// equipment owner works in parallel; no private equipment state is consumed.
const equipment: ModuleDefinition = {
  manifest: { id: 'test.attribute-equipment', title: '替换装备', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { equipment: '1.0.0' } },
  initialState: () => ({}), queries: { status: { execute: ctx => Object.hasOwn(ctx.config, 'result') ? ctx.config.result! : { slots: [], modifiers: { attack: 2, defense: 1 }, tags: [] } } }
};
const externalProgression: ModuleDefinition = {
  manifest: { id: 'test.attribute-progression', title: '替换成长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' } },
  initialState: () => ({}), queries: { status: { execute: ctx => ctx.config.result! } }
};
const externalEffects: ModuleDefinition = {
  manifest: { id: 'test.attribute-effects', title: '替换效果', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { effects: '1.0.0' } },
  initialState: () => ({}), queries: { status: { execute: ctx => ctx.config.result! } }
};
function registry() { return new ModuleRegistry([attributesModule, effectRulesModule, effectRefreshModule, effectsModule, progressionRulesModule, progressionModule, ...timeModules, equipment, externalProgression, externalEffects]); }
function definition(): WorldDefinition { return { id: 'attributes-test', title: '属性测试', version: '1', modules: [
  { id: 'clock', module: 'time.continuous', config: {} },
  { id: 'effect-rules', module: 'effects.catalog', config: { effects: { vigor: { name: '振奋', durationSeconds: 20, modifiers: { attack: 2 } } } } },
  { id: 'duration', module: 'effect-duration.refresh', config: {} }, { id: 'effects', module: 'effects.timed', config: {} },
  { id: 'progression-rules', module: 'progression.curve', config: { levels: [{ experience: 0, values: { maxHp: 20, attack: 4, defense: 1 } }] } },
  { id: 'progression', module: 'progression.track', config: { initialExperience: 0 } },
  { id: 'equipment', module: 'test.attribute-equipment', config: {} },
  { id: 'attributes', module: 'attributes.additive', config: { keys: ['attack', 'defense'] } }
] }; }
function instance(d: WorldDefinition, id: string) { const value = d.modules.find(x => x.id === id); assert.ok(value); return value; }
function setup(edit?: (d: WorldDefinition) => void) { const d = definition(); edit?.(d); return createWorld(registry(), d); }
type World = ReturnType<typeof setup>;
function status(w: World) { return w.query('attributes', 'status'); }
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); }
function removeEquipment(d: WorldDefinition) { d.modules = d.modules.filter(m => m.id !== 'equipment'); }
function removeEffects(d: WorldDefinition) { d.modules = d.modules.filter(m => !['effects', 'effect-rules', 'duration', 'clock'].includes(m.id)); }
function withModifiers(modifiers: JsonObject) { return { slots: [], modifiers, tags: [] }; }

// Losing any contribution or writing computed totals into progression breaks these literals.
test('base4/1 plus gear2/1 plus effect2/0 gives8/2 with pure queries and unchanged XP', () => {
  const w = setup(); ok(w, 'effects', 'apply', { effect: 'vigor' }); const before = w.snapshot();
  assert.deepEqual(status(w), { base: { maxHp: 20, attack: 4, defense: 1 }, equipment: { attack: 2, defense: 1 }, effects: { attack: 2 }, values: { maxHp: 20, attack: 8, defense: 2 } });
  status(w); assert.deepEqual(w.snapshot(), before); assert.deepEqual(w.read('progression'), { experience: 0 });
});
test('effect removal and exact expiry restore base plus gear, leaving XP untouched', () => {
  const w = setup(); ok(w, 'effects', 'apply', { effect: 'vigor' }); ok(w, 'effects', 'remove', { effect: 'vigor' });
  assert.deepEqual(status(w), { base: { maxHp: 20, attack: 4, defense: 1 }, equipment: { attack: 2, defense: 1 }, effects: {}, values: { maxHp: 20, attack: 6, defense: 2 } });
  ok(w, 'effects', 'apply', { effect: 'vigor' }); ok(w, 'clock', 'advance', { seconds: 20 }); assert.equal((status(w) as JsonObject).values && ((status(w) as JsonObject).values as JsonObject).attack, 6); assert.deepEqual(w.read('progression'), { experience: 0 });
});
test('optional sources can both be absent, or either present; empty configured keys allow unmodified base', () => {
  const bare = setup(d => { removeEquipment(d); removeEffects(d); instance(d, 'attributes').config.keys = []; });
  assert.deepEqual(status(bare), { base: { maxHp: 20, attack: 4, defense: 1 }, equipment: {}, effects: {}, values: { maxHp: 20, attack: 4, defense: 1 } });
  const gear = setup(removeEffects); assert.deepEqual((status(gear) as JsonObject).values, { maxHp: 20, attack: 6, defense: 2 });
  const effect = setup(removeEquipment); ok(effect, 'effects', 'apply', { effect: 'vigor' }); assert.deepEqual((status(effect) as JsonObject).values, { maxHp: 20, attack: 6, defense: 1 });
  ok(effect, 'effects', 'remove', { effect: 'vigor' }); assert.deepEqual((status(effect) as JsonObject).values, { maxHp: 20, attack: 4, defense: 1 });
});
test('config keys reject maxHp modifiers explicitly and a failed application rolls back all states', () => {
  assert.throws(() => setup(d => { instance(d, 'equipment').config.result = withModifiers({ maxHp: 1 }); }), (error: unknown) => (error as { code: string }).code === 'INVALID_ATTRIBUTE_MODIFIER');
  const w = setup(d => { const effects = instance(d, 'effect-rules').config.effects as JsonObject; (effects.vigor as JsonObject).modifiers = { maxHp: 2 }; }); const before = w.snapshot();
  const result = w.dispatch({ target: 'effects', action: 'apply', input: { effect: 'vigor' } }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'INVALID_ATTRIBUTE_MODIFIER'); assert.deepEqual(w.snapshot(), before);
  for (const keys of [['attack', 'attack'], [''], ['🌟'.repeat(129)]]) assert.throws(() => setup(d => { instance(d, 'attributes').config.keys = keys; }));
});
test('new attribute fields start at zero and signed modifiers can reduce a value to zero', () => {
  const w = setup(d => { removeEffects(d); instance(d, 'attributes').config.keys = ['attack', 'luck']; instance(d, 'equipment').config.result = withModifiers({ attack: -4, luck: 3 }); });
  assert.deepEqual(status(w), { base: { maxHp: 20, attack: 4, defense: 1 }, equipment: { attack: -4, luck: 3 }, effects: {}, values: { maxHp: 20, attack: 0, defense: 1, luck: 3 } });
});
test('negative final values and intermediate arithmetic overflow reject rather than clamp', () => {
  for (const modifiers of [{ attack: -5 }, { attack: Number.MAX_SAFE_INTEGER }]) assert.throws(() => setup(d => { removeEffects(d); instance(d, 'equipment').config.result = withModifiers(modifiers); }));
  assert.throws(() => setup(d => {
    instance(d, 'equipment').config.result = withModifiers({ attack: Number.MAX_SAFE_INTEGER });
    instance(d, 'effects').module = 'test.attribute-effects'; instance(d, 'effects').config = { result: { now: 0, effects: [], modifiers: { attack: -Number.MAX_SAFE_INTEGER } } };
  }));
});
test('malformed external modifier and progression consumed fields reject at assembly', () => {
  for (const result of [null, [], {}, { modifiers: [] }, withModifiers({ attack: 0.1 }), withModifiers({ attack: Number.MAX_SAFE_INTEGER + 1 }), withModifiers({ ['🌟'.repeat(129)]: 1 })]) assert.throws(() => setup(d => { instance(d, 'equipment').config.result = result; }));
  for (const result of [null, [], {}, { values: [] }, { values: { attack: -1 } }, { values: { attack: 0.5 } }, { values: { ['🌟'.repeat(129)]: 1 } }]) assert.throws(() => setup(d => { instance(d, 'progression').module = 'test.attribute-progression'; instance(d, 'progression').config = { result }; }));
  for (const result of [null, [], {}, { now: 0, effects: [], modifiers: { attack: 0.5 } }]) assert.throws(() => setup(d => { instance(d, 'effects').module = 'test.attribute-effects'; instance(d, 'effects').config = { result }; }));
});
test('Unicode code point and ordinary own attribute keys are preserved as data', () => {
  const key = '🌟'.repeat(128);
  const w = setup(d => { removeEffects(d); instance(d, 'attributes').config.keys = [key, 'toString', 'valueOf']; instance(d, 'equipment').config.result = withModifiers({ [key]: 2, toString: 3, valueOf: -1 }); instance(d, 'progression-rules').config.levels = [{ experience: 0, values: { [key]: 1, toString: 4, valueOf: 2 } }]; });
  assert.deepEqual(status(w), { base: { [key]: 1, toString: 4, valueOf: 2 }, equipment: { [key]: 2, toString: 3, valueOf: -1 }, effects: {}, values: { [key]: 3, toString: 7, valueOf: 1 } });
});
