import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { equipmentRulesModule } from '../src/modules/equipment-rules.ts';
import { equipmentModule } from '../src/modules/equipment.ts';

const sword = { name: '训练剑', slot: 'hand', modifiers: { attack: 2 }, tags: ['blade'] };
const knife = { name: '猎刀', slot: 'hand', modifiers: { attack: 1 }, tags: ['blade', 'light'] };
const armor = { name: '皮甲', slot: 'body', modifiers: { defense: 1, attack: -1 }, tags: ['light'] };
function registry(extra: ModuleDefinition[] = []) { return new ModuleRegistry([...capacityModules, inventoryModule, equipmentRulesModule, equipmentModule, ...extra]); }
function definition(): WorldDefinition { return { id: 'equipment-test', title: '装备测试', version: '1', modules: [
  { id: 'capacity', module: 'capacity.slots', config: {} },
  { id: 'inventory', module: 'inventory.basic', config: { items: Object.fromEntries(['sword', 'knife', 'armor', 'stone'].map(id => [id, { name: id, weight: id === 'armor' ? 5 : 1, volume: 1, length: 1 }])), containers: { bag: { limits: {}, items: { sword: 1, knife: 1, armor: 1, stone: 2 } }, chest: { limits: {}, items: { sword: 1 } } } } },
  { id: 'rules', module: 'equipment.catalog', config: { items: structuredClone({ sword, knife, armor }) } },
  { id: 'equipment', module: 'equipment.slots', config: { container: 'bag', slots: ['hand', 'body'] } }
] }; }
function instance(d: WorldDefinition, id: string) { const m = d.modules.find(m => m.id === id); assert.ok(m); return m; }
function setup(edit?: (d: WorldDefinition) => void, extra: ModuleDefinition[] = []) { const d = definition(); edit?.(d); return createWorld(registry(extra), d); }
type World = ReturnType<typeof setup>;
function ok(w: World, target: string, action: string, input: JsonObject = {}) { const r = w.dispatch({ target, action, input }); assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw Error('动作失败'); return r.value; }
function fails(w: World, action: string, input: JsonObject, code?: string) { const before = w.snapshot(); const r = w.dispatch({ target: 'equipment', action, input }); assert.equal(r.ok, false, JSON.stringify(r)); if (!r.ok && code) assert.equal(r.error.code, code); assert.deepEqual(w.snapshot(), before); }
function status(w: World) { return w.query('equipment', 'status'); }
function count(w: World, item: string, container = 'bag') { return (w.query('inventory', 'count', { container, item }) as JsonObject).quantity; }
function items(d: WorldDefinition) { return instance(d, 'rules').config.items as Record<string, JsonObject>; }
function containers(d: WorldDefinition) { return instance(d, 'inventory').config.containers as Record<string, JsonObject>; }

test('equip swap and unequip transfer exactly one real inventory unit and expose live totals', () => {
  const w = setup(); ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' });
  assert.equal(count(w, 'sword'), 0); assert.equal(count(w, 'sword', 'chest'), 1);
  assert.deepEqual(status(w), { slots: [{ slot: 'hand', item: { id: 'sword', ...sword } }, { slot: 'body', item: null }], modifiers: { attack: 2 }, tags: ['blade'] });
  ok(w, 'equipment', 'equip', { item: 'armor', slot: 'body' });
  assert.deepEqual((status(w) as JsonObject).modifiers, { attack: 1, defense: 1 });
  ok(w, 'equipment', 'equip', { item: 'knife', slot: 'hand' }); assert.equal(count(w, 'sword'), 1); assert.equal(count(w, 'knife'), 0);
  assert.deepEqual(status(w), { slots: [{ slot: 'hand', item: { id: 'knife', ...knife } }, { slot: 'body', item: { id: 'armor', ...armor } }], modifiers: { attack: 0, defense: 1 }, tags: ['blade', 'light'] });
  ok(w, 'equipment', 'unequip', { slot: 'hand' }); ok(w, 'equipment', 'unequip', { slot: 'body' });
  assert.equal(count(w, 'knife'), 1); assert.equal(count(w, 'armor'), 1); assert.deepEqual(status(w), { slots: [{ slot: 'hand', item: null }, { slot: 'body', item: null }], modifiers: {}, tags: [] });
});
test('full distinct-slot inventory swaps only after removing incoming and rejects overflowing returns atomically', () => {
  const w = setup(d => { containers(d).bag!.limits = { slots: 3 }; containers(d).bag!.items = { sword: 1, knife: 1, stone: 1 }; });
  ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); ok(w, 'inventory', 'add', { container: 'bag', item: 'armor', quantity: 1 });
  ok(w, 'equipment', 'equip', { item: 'knife', slot: 'hand' }); assert.equal(count(w, 'knife'), 0); assert.equal(count(w, 'sword'), 1);
  fails(w, 'unequip', { slot: 'hand' }, 'CAPACITY_EXCEEDED');
  ok(w, 'inventory', 'add', { container: 'bag', item: 'sword', quantity: 1 });
  fails(w, 'equip', { item: 'sword', slot: 'hand' }, 'CAPACITY_EXCEEDED'); assert.equal(count(w, 'sword'), 2);
});
test('invalid slot wrong item slot same equipment missing stock and unknown items reject without writes', () => {
  const w = setup(); fails(w, 'unequip', { slot: 'hand' }, 'EMPTY_EQUIPMENT_SLOT'); fails(w, 'unequip', { slot: 'head' }, 'UNKNOWN_EQUIPMENT_SLOT');
  fails(w, 'equip', { item: 'sword', slot: 'head' }, 'UNKNOWN_EQUIPMENT_SLOT'); fails(w, 'equip', { item: 'sword', slot: 'body' }, 'WRONG_EQUIPMENT_SLOT'); fails(w, 'equip', { item: 'stone', slot: 'hand' }, 'UNKNOWN_EQUIPMENT');
  ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); fails(w, 'equip', { item: 'sword', slot: 'hand' }, 'ALREADY_EQUIPPED');
  ok(w, 'inventory', 'remove', { container: 'bag', item: 'knife', quantity: 1 }); fails(w, 'equip', { item: 'knife', slot: 'hand' }, 'INSUFFICIENT_ITEMS');
});
test('catalog listing shows backpack quantities and local equippability while queries preserve snapshots', () => {
  const w = setup(); ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); ok(w, 'inventory', 'add', { container: 'bag', item: 'sword', quantity: 1 });
  const before = w.snapshot(); assert.deepEqual(w.query('equipment', 'list'), { items: [{ id: 'sword', ...sword, quantity: 1, equippable: false }, { id: 'knife', ...knife, quantity: 1, equippable: true }, { id: 'armor', ...armor, quantity: 1, equippable: true }] });
  assert.deepEqual(w.query('rules', 'get', { item: 'knife' }), { id: 'knife', ...knife }); status(w); assert.deepEqual(w.snapshot(), before);
  const handOnly = setup(d => { instance(d, 'equipment').config.slots = ['hand']; }); assert.equal(((handOnly.query('equipment', 'list') as JsonObject).items as JsonObject[])[2]!.equippable, false);
});
test('frozen worn terms survive catalog changes deletion and save restore but newly equipped terms update', () => {
  const w = setup(); ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); const before = status(w);
  const d = w.definition; items(d).sword = { name: '新剑', slot: 'hand', modifiers: { attack: 9 }, tags: ['new'] };
  const changed = reconfigureWorld(registry(), w, d); assert.deepEqual(status(changed), before);
  ok(changed, 'equipment', 'unequip', { slot: 'hand' }); ok(changed, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); assert.deepEqual((status(changed) as JsonObject).modifiers, { attack: 9 });
  const removed = changed.definition; delete items(removed).sword; const without = reconfigureWorld(registry(), changed, removed);
  assert.deepEqual(status(restoreWorld(registry(), without.snapshot())), status(changed)); ok(without, 'equipment', 'unequip', { slot: 'hand' }); assert.equal(count(without, 'sword'), 1);
});
test('current catalog references and frozen inventory references stay validated independently', () => {
  assert.throws(() => setup(d => { items(d).missing = { ...sword }; }));
  const w = setup(); ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); const d = w.definition;
  delete items(d).sword; delete (instance(d, 'inventory').config.items as JsonObject).sword; delete (containers(d).bag!.items as JsonObject).sword; delete (containers(d).chest!.items as JsonObject).sword;
  assert.throws(() => reconfigureWorld(registry(), w, d));
  const malformed = w.definition; items(malformed).knife!.tags = ['blade', 'blade']; assert.throws(() => reconfigureWorld(registry(), w, malformed));
});
test('independent slot instances use disjoint containers and physical capacity policy remains authoritative', () => {
  const w = setup(d => { d.modules.push({ id: 'other', module: 'equipment.slots', config: { container: 'chest', slots: ['hand'] }, bindings: { inventory: 'inventory', 'equipment-rule': 'rules' } }); });
  ok(w, 'other', 'equip', { item: 'sword', slot: 'hand' }); assert.equal(count(w, 'sword'), 1); assert.equal(count(w, 'sword', 'chest'), 0); assert.deepEqual((status(w) as JsonObject).modifiers, {});
  const physical = setup(d => { instance(d, 'capacity').module = 'capacity.physical'; containers(d).bag!.limits = { maxWeight: 10 }; containers(d).bag!.items = { sword: 1, armor: 1 }; });
  ok(physical, 'equipment', 'equip', { item: 'armor', slot: 'body' }); ok(physical, 'inventory', 'add', { container: 'bag', item: 'stone', quantity: 9 }); fails(physical, 'unequip', { slot: 'body' }, 'CAPACITY_EXCEEDED');
});
test('special own keys and 128 astral code-point IDs work across equip queries restore and return', () => {
  for (const key of ['toString', 'valueOf', 'hasOwnProperty', '刀 剑 " key', '😀'.repeat(128)]) {
    const w = setup(d => { instance(d, 'rules').config.items = Object.fromEntries([[key, { name: key, slot: key, modifiers: Object.fromEntries([[key, -2]]), tags: [key] }]]); instance(d, 'equipment').config.slots = [key]; instance(d, 'inventory').config.items = Object.fromEntries([[key, { name: key, weight: 0, volume: 0, length: 0 }]]); instance(d, 'inventory').config.containers = { bag: { limits: {}, items: Object.fromEntries([[key, 1]]) } }; });
    ok(w, 'equipment', 'equip', { item: key, slot: key }); const restored = restoreWorld(registry(), w.snapshot()); assert.deepEqual((status(restored) as JsonObject).modifiers, Object.fromEntries([[key, -2]])); ok(restored, 'equipment', 'unequip', { slot: key }); assert.equal(count(restored, key), 1);
  }
});
test('invalid catalogs slot sets modifier values and mismatched saved slot sets reject', () => {
  for (const edit of [{ slot: '' }, { tags: ['same', 'same'] }, { tags: ['😀'.repeat(129)] }, { modifiers: { attack: 0.5 } }, { modifiers: { attack: Number.MAX_SAFE_INTEGER + 1 } }]) assert.throws(() => setup(d => { Object.assign(items(d).sword!, edit); }));
  for (const slots of [[], ['hand', 'hand'], ['😀'.repeat(129)]]) assert.throws(() => setup(d => { instance(d, 'equipment').config.slots = slots; }));
  const w = setup(); const saved = w.snapshot(); (saved.modules.equipment!.state as JsonObject).slots = { hand: null }; assert.throws(() => restoreWorld(registry(), saved));
});
test('signed aggregate overflow rejects the second equip and restores consumed inventory', () => {
  const w = setup(d => { items(d).sword!.modifiers = { attack: Number.MAX_SAFE_INTEGER }; items(d).armor!.modifiers = { attack: 1 }; });
  ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); fails(w, 'equip', { item: 'armor', slot: 'body' }, 'INVALID_EQUIPMENT_MODIFIER');
});

// A provider may be replaced independently; malformed boundary results must never become worn facts.
function externalQueries(kind: 'rules' | 'inventory', action: string, bad: (valid: JsonValue) => JsonValue) {
  let broken = false;
  const base = kind === 'rules' ? equipmentRulesModule : inventoryModule;
  const original = base.queries![action]!;
  const provider: ModuleDefinition = { ...base, manifest: { ...base.manifest, id: `test.external-${kind}` }, queries: { ...base.queries, [action]: { ...original, execute(ctx, input) { const valid = original.execute(ctx, input); return broken ? bad(valid) : valid; } } } };
  const w = setup(d => { instance(d, kind).module = provider.manifest.id; }, [provider]);
  return { w, breakProvider() { broken = true; } };
}
test('external equipment list and get must agree on valid unique definitions before any payment', () => {
  for (const [action, bad] of [
    ['list', () => null], ['list', () => ({ items: {} })], ['list', () => ({ items: [{ id: 'sword', ...sword }, { id: 'sword', ...sword }] })],
    ['list', () => ({ items: [{ id: '😀'.repeat(129), ...sword }] })],
    ['get', () => null], ['get', () => ({ id: 'sword', ...sword, slot: '' })], ['get', () => ({ id: 'sword', ...sword, tags: ['blade', 'blade'] })],
    ['get', () => ({ id: 'sword', ...sword, modifiers: { attack: 0.5 } })],
    ['get', valid => ({ ...valid as JsonObject, name: 'different' })],
    ['get', valid => ({ ...valid as JsonObject, modifiers: { attack: 3 } })],
    ['get', valid => ({ ...valid as JsonObject, tags: ['other'] })],
  ] as [string, (valid: JsonValue) => JsonValue][]) {
    const { w, breakProvider } = externalQueries('rules', action, bad); breakProvider();
    assert.throws(() => status(w)); fails(w, 'equip', { item: 'sword', slot: 'hand' });
  }
});
test('external inventory counts lists uniqueness and agreement reject before equipment can change', () => {
  for (const [action, bad] of [
    ['list', () => null], ['list', () => ({ items: null })], ['list', () => ({ items: [{ id: 'sword', quantity: 1 }, { id: 'sword', quantity: 1 }] })],
    ['list', () => ({ items: [{ id: '', quantity: 1 }] })], ['list', () => ({ items: [{ id: 'sword', quantity: -1 }] })],
    ['list', () => ({ items: [{ id: 'sword', quantity: 0.5 }] })], ['list', () => ({ items: [] })],
    ['count', () => null], ['count', () => ({ quantity: '1' })], ['count', () => ({ quantity: -1 })], ['count', () => ({ quantity: 0.5 })],
    ['count', () => ({ quantity: Number.MAX_SAFE_INTEGER + 1 })], ['count', () => ({ quantity: 0 })],
  ] as [string, (valid: JsonValue) => JsonValue][]) {
    const { w, breakProvider } = externalQueries('inventory', action, bad); breakProvider();
    assert.throws(() => status(w)); fails(w, 'equip', { item: 'sword', slot: 'hand' });
  }
});
test('downstream inventory partial writes and malformed operation results roll back complete equipment transactions', () => {
  for (const action of ['add', 'remove'] as const) {
    let broken = false;
    const original = inventoryModule.commands![action]!;
    const provider: ModuleDefinition = { ...inventoryModule, manifest: { ...inventoryModule.manifest, id: 'test.inventory-change' }, commands: { ...inventoryModule.commands, [action]: { ...original, execute(ctx, input) { const result = original.execute(ctx, input); return broken ? { quantity: -1 } : result; } } } };
    const w = setup(d => { instance(d, 'inventory').module = provider.manifest.id; }, [provider]);
    ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); broken = true;
    fails(w, 'equip', { item: 'knife', slot: 'hand' }, 'INVALID_INVENTORY');
    if (action === 'add') fails(w, 'unequip', { slot: 'hand' }, 'INVALID_INVENTORY');
  }
});
test('restore rejects altered frozen slot terms and negative aggregate underflow rejects atomically', () => {
  const w = setup(); ok(w, 'equipment', 'equip', { item: 'sword', slot: 'hand' });
  for (const patch of [{ slot: 'body' }, { id: '' }, { modifiers: { attack: 0.5 } }, { tags: ['blade', 'blade'] }]) {
    const saved = w.snapshot(); const state = saved.modules.equipment!.state as unknown as { slots: Record<string, JsonObject> }; Object.assign(state.slots.hand!, patch); assert.throws(() => restoreWorld(registry(), saved));
  }
  const underflow = setup(d => { items(d).sword!.modifiers = { attack: -Number.MAX_SAFE_INTEGER }; items(d).armor!.modifiers = { attack: -1 }; });
  ok(underflow, 'equipment', 'equip', { item: 'sword', slot: 'hand' }); fails(underflow, 'equip', { item: 'armor', slot: 'body' }, 'INVALID_EQUIPMENT_MODIFIER');
});
