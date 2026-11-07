import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own, recordSchema } from './capacity.ts';

export interface EquipmentDefinition { name: string; slot: string; modifiers: Record<string, number>; tags: string[] }
export interface FrozenEquipment extends EquipmentDefinition { id: string }
export const signedModifierSchema = { type: 'integer', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
export const equipmentDefinitionSchema = objectSchema({ name: { type: 'string', minLength: 1 }, slot: idSchema, modifiers: recordSchema(signedModifierSchema), tags: { type: 'array', uniqueItems: true, items: idSchema } });
export const frozenEquipmentSchema = objectSchema({ id: idSchema, ...equipmentDefinitionSchema.properties as Record<string, unknown> });
export function isEquipmentObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function isEquipmentId(value: unknown): value is string { return typeof value === 'string' && [...value].length >= 1 && [...value].length <= 128; }
export function readEquipment(ctx: ReadContext, value: unknown): FrozenEquipment {
  if (!isEquipmentObject(value) || !isEquipmentId(value.id) || typeof value.name !== 'string' || !value.name.length || !isEquipmentId(value.slot)
    || !isEquipmentObject(value.modifiers) || !Array.isArray(value.tags) || !value.tags.every(isEquipmentId) || new Set(value.tags).size !== value.tags.length) return ctx.fail('INVALID_EQUIPMENT_RULE', '装备条款必须包含有效ID、名称、槽位、属性与唯一标签');
  for (const [key, modifier] of Object.entries(value.modifiers)) if (!isEquipmentId(key) || typeof modifier !== 'number' || !Number.isSafeInteger(modifier)) ctx.fail('INVALID_EQUIPMENT_MODIFIER', '装备属性必须为有效ID与带符号安全整数映射');
  return { id: value.id, name: value.name, slot: value.slot, modifiers: value.modifiers as Record<string, number>, tags: value.tags as string[] };
}
function definitions(ctx: ReadContext): Record<string, EquipmentDefinition> { return ctx.config.items as unknown as Record<string, EquipmentDefinition>; }
export const equipmentRulesModule: ModuleDefinition = {
  manifest: { id: 'equipment.catalog', title: '装备目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'equipment-rule': '1.0.0' } },
  configSchema: objectSchema({ items: recordSchema(equipmentDefinitionSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    list: { schema: emptySchema, execute: ctx => ({ items: Object.entries(definitions(ctx)).map(([id, definition]) => ({ id, ...definition })) }) },
    get: { schema: objectSchema({ item: idSchema }), execute(ctx, input) { const definition = own(definitions(ctx), input.item as string); if (!definition) return ctx.fail('UNKNOWN_EQUIPMENT', `未知装备：${input.item}`); return { id: input.item!, ...definition } as JsonObject; } }
  }
};
