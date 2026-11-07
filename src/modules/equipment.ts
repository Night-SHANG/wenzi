import type { ExecutionContext, JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own, recordSchema } from './capacity.ts';
import { frozenEquipmentSchema, isEquipmentId, isEquipmentObject, readEquipment } from './equipment-rules.ts';
import type { FrozenEquipment } from './equipment-rules.ts';

interface Config { container: string; slots: string[] }
interface State { slots: Record<string, FrozenEquipment | null> }
interface Inspection { state: State; items: FrozenEquipment[]; counts: Map<string, number> }
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function quantity(ctx: ReadContext, value: unknown): number {
  if (!isEquipmentObject(value) || typeof value.quantity !== 'number' || !Number.isSafeInteger(value.quantity) || value.quantity < 0) return ctx.fail('INVALID_INVENTORY', '库存必须返回非负安全整数数量');
  return value.quantity;
}
function sameDefinition(a: FrozenEquipment, b: FrozenEquipment): boolean {
  return a.id === b.id && a.name === b.name && a.slot === b.slot && a.tags.length === b.tags.length && a.tags.every((tag, i) => tag === b.tags[i])
    && Object.keys(a.modifiers).length === Object.keys(b.modifiers).length && Object.entries(a.modifiers).every(([key, value]) => own(b.modifiers, key) === value);
}
function inspect(ctx: ReadContext): Inspection {
  const cfg = config(ctx), state = ctx.state<State>();
  if (Object.keys(state.slots).length !== cfg.slots.length || cfg.slots.some(slot => !Object.hasOwn(state.slots, slot))) ctx.fail('INVALID_EQUIPMENT_STATE', '装备槽位集合与配置不一致');
  for (const [slot, frozen] of Object.entries(state.slots)) if (frozen !== null && readEquipment(ctx, frozen).slot !== slot) ctx.fail('INVALID_EQUIPMENT_STATE', '冻结装备的槽位与保存位置不一致');
  const result = ctx.query('equipment-rule', 'list');
  if (!isEquipmentObject(result) || !Array.isArray(result.items)) ctx.fail('INVALID_EQUIPMENT_RULE', '装备规则必须返回装备列表');
  const items: FrozenEquipment[] = [], ids = new Set<string>();
  for (const value of result.items) {
    const item = readEquipment(ctx, value);
    if (ids.has(item.id)) ctx.fail('INVALID_EQUIPMENT_RULE', '装备目录ID重复');
    ids.add(item.id);
    const fetched = readEquipment(ctx, ctx.query('equipment-rule', 'get', { item: item.id }));
    if (!sameDefinition(item, fetched)) ctx.fail('INVALID_EQUIPMENT_RULE', '装备目录get与list条款不一致');
    items.push(item);
  }
  const inventory = ctx.query('inventory', 'list', { container: cfg.container });
  if (!isEquipmentObject(inventory) || !Array.isArray(inventory.items)) ctx.fail('INVALID_INVENTORY', '库存必须返回容器物品列表');
  const listed = new Map<string, number>();
  for (const row of inventory.items) {
    if (!isEquipmentObject(row) || !isEquipmentId(row.id) || listed.has(row.id)) ctx.fail('INVALID_INVENTORY', '库存物品ID无效或重复');
    listed.set(row.id, quantity(ctx, row));
  }
  const required = new Set([...ids, ...listed.keys(), ...Object.values(state.slots).filter((item): item is FrozenEquipment => item !== null).map(item => item.id)]), counts = new Map<string, number>();
  for (const item of required) {
    const count = quantity(ctx, ctx.query('inventory', 'count', { container: cfg.container, item }));
    if (count !== (listed.get(item) ?? 0)) ctx.fail('INVALID_INVENTORY', '库存count与list数量不一致');
    counts.set(item, count);
  }
  return { state, items, counts };
}
function status(ctx: ReadContext, inspection = inspect(ctx)): JsonObject {
  const modifiers: Record<string, number> = {}, tags = new Set<string>();
  const slots = config(ctx).slots.map(slot => {
    const item = inspection.state.slots[slot]!;
    if (item !== null) {
      for (const [key, amount] of Object.entries(item.modifiers)) {
        const sum = (own(modifiers, key) ?? 0) + amount;
        if (!Number.isSafeInteger(sum)) ctx.fail('INVALID_EQUIPMENT_MODIFIER', '装备属性总和超出安全整数范围');
        Object.defineProperty(modifiers, key, { value: sum, enumerable: true, writable: true, configurable: true });
      }
      for (const tag of item.tags) tags.add(tag);
    }
    return { slot, item: item as unknown as JsonObject | null };
  });
  return { slots, modifiers, tags: [...tags] };
}
function checkedSlot(ctx: ReadContext, slot: string): void { if (!config(ctx).slots.includes(slot)) ctx.fail('UNKNOWN_EQUIPMENT_SLOT', `未知装备槽位：${slot}`); }
function changeInventory(ctx: ExecutionContext, action: 'add' | 'remove', item: string, before: number): void {
  const expected = before + (action === 'add' ? 1 : -1);
  if (!Number.isSafeInteger(expected) || expected < 0) ctx.fail('INVALID_INVENTORY', '装备操作后的库存数量超出安全范围');
  const input = { container: config(ctx).container, item, quantity: 1 };
  if (quantity(ctx, ctx.call('inventory', action, input)) !== expected || quantity(ctx, ctx.query('inventory', 'count', { container: input.container, item })) !== expected) ctx.fail('INVALID_INVENTORY', '库存操作没有转移准确的装备数量');
}
export const equipmentModule: ModuleDefinition = {
  manifest: { id: 'equipment.slots', title: '装备槽位', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { equipment: '1.0.0' }, requires: { inventory: { version: '^1.0.0' }, 'equipment-rule': { version: '^1.0.0' } } },
  configSchema: objectSchema({ container: idSchema, slots: { type: 'array', minItems: 1, uniqueItems: true, items: idSchema } }),
  stateSchema: objectSchema({ slots: recordSchema({ anyOf: [{ type: 'null' }, frozenEquipmentSchema] }) }),
  initialState: config => ({ slots: Object.fromEntries((config.slots as string[]).map(slot => [slot, null])) }),
  validate(ctx) { status(ctx); },
  commands: {
    equip: { schema: objectSchema({ item: idSchema, slot: idSchema }), execute(ctx, input) {
      const slot = input.slot as string, id = input.item as string; checkedSlot(ctx, slot);
      const inspection = inspect(ctx), incoming = inspection.items.find(item => item.id === id), outgoing = inspection.state.slots[slot]!;
      if (!incoming) return ctx.fail('UNKNOWN_EQUIPMENT', `未知装备：${id}`);
      if (incoming.slot !== slot) ctx.fail('WRONG_EQUIPMENT_SLOT', '装备与目标槽位不匹配');
      if (outgoing?.id === id) ctx.fail('ALREADY_EQUIPPED', '该槽位已装备同一物品');
      const count = inspection.counts.get(id)!;
      if (count < 1) ctx.fail('INSUFFICIENT_ITEMS', `物品不足：${id}`);
      changeInventory(ctx, 'remove', id, count);
      if (outgoing) changeInventory(ctx, 'add', outgoing.id, inspection.counts.get(outgoing.id)!);
      inspection.state.slots[slot] = incoming;
      ctx.write(inspection.state as unknown as JsonValue);
      return status(ctx);
    } },
    unequip: { schema: objectSchema({ slot: idSchema }), execute(ctx, input) {
      const slot = input.slot as string; checkedSlot(ctx, slot);
      const inspection = inspect(ctx), outgoing = inspection.state.slots[slot]!;
      if (outgoing === null) return ctx.fail('EMPTY_EQUIPMENT_SLOT', '该装备槽位为空');
      changeInventory(ctx, 'add', outgoing.id, inspection.counts.get(outgoing.id)!);
      inspection.state.slots[slot] = null; ctx.write(inspection.state as unknown as JsonValue);
      return status(ctx);
    } }
  },
  queries: {
    status: { schema: emptySchema, execute: ctx => status(ctx) },
    list: { schema: emptySchema, execute(ctx) { const inspection = inspect(ctx); status(ctx, inspection); return { items: inspection.items.map(item => ({ ...item, quantity: inspection.counts.get(item.id)!, equippable: config(ctx).slots.includes(item.slot) && inspection.counts.get(item.id)! > 0 && inspection.state.slots[item.slot]?.id !== item.id })) }; } }
  }
};
