import type { JsonObject, JsonSchema, ModuleDefinition, ReadContext } from '../contracts.ts';

export const MAX_NUMBER = Number.MAX_SAFE_INTEGER;
export const numberSchema: JsonSchema = { type: 'number', minimum: 0, maximum: MAX_NUMBER };
export const countSchema: JsonSchema = { type: 'integer', minimum: 0, maximum: MAX_NUMBER };
export const positiveCountSchema: JsonSchema = { ...countSchema, minimum: 1 };
export const idSchema: JsonSchema = { type: 'string', minLength: 1, maxLength: 128 };
export const emptySchema: JsonSchema = { type: 'object', properties: {}, additionalProperties: false };
export function objectSchema(properties: Record<string, unknown>, required = Object.keys(properties)): JsonSchema { return { type: 'object', properties, required, additionalProperties: false }; }
export function recordSchema(values: JsonSchema): JsonSchema { return { type: 'object', propertyNames: idSchema, additionalProperties: values }; }
export function safeNumber(ctx: ReadContext, value: number, label: string): number { if (!Number.isFinite(value) || value < 0 || value > MAX_NUMBER) ctx.fail('INVALID_NUMBER', `${label}超出安全数值范围`); return value; }
export function safeCount(ctx: ReadContext, value: number, label: string): number { safeNumber(ctx, value, label); if (!Number.isSafeInteger(value)) ctx.fail('INVALID_QUANTITY', `${label}必须为安全整数`); return value; }
export function own<T>(record: Record<string, T>, id: string): T | undefined { return Object.hasOwn(record, id) ? record[id] : undefined; }
export const limitsSchema = objectSchema({ slots: countSchema, maxWeight: numberSchema, maxVolume: numberSchema, maxLength: numberSchema }, []);
export interface Limits { slots?: number; maxWeight?: number; maxVolume?: number; maxLength?: number }
export interface CapacityItem { id: string; quantity: number; weight: number; volume: number; length: number }
export const capacityItemsSchema: JsonSchema = { type: 'array', items: objectSchema({ id: idSchema, quantity: countSchema, weight: numberSchema, volume: numberSchema, length: numberSchema }) };
const ids = ['capacity.slots', 'capacity.physical', 'capacity.combined'];
function capacityModule(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'capacity.slots' ? '格子容量' : id === 'capacity.physical' ? '物理容量（g/ml/mm）' : '组合容量（格子/g/ml/mm）', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { capacity: '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: { check: { schema: objectSchema({ items: capacityItemsSchema, limits: limitsSchema }), execute(ctx, input) {
      const { items, limits } = input as unknown as { items: CapacityItem[]; limits: Limits };
      const distinct = new Set<string>(); let weight = 0; let volume = 0; let length = 0;
      for (const item of items) {
        safeCount(ctx, item.quantity, '数量'); if (!item.quantity) continue; distinct.add(item.id);
        if (id !== 'capacity.slots') { weight = safeNumber(ctx, weight + item.weight * item.quantity, '总重量（g）'); volume = safeNumber(ctx, volume + item.volume * item.quantity, '总体积（ml）'); length = Math.max(length, item.length); }
      }
      let reason = '';
      if (id !== 'capacity.physical' && limits.slots !== undefined && distinct.size > limits.slots) reason = '格子不足';
      if (id !== 'capacity.slots') {
        if (limits.maxWeight !== undefined && weight > limits.maxWeight) reason = '重量超过限制（g）';
        else if (limits.maxVolume !== undefined && volume > limits.maxVolume) reason = '体积超过限制（ml）';
        else if (limits.maxLength !== undefined && length > limits.maxLength) reason = '长度超过限制（mm）';
      }
      return { allowed: !reason, reason: reason || '容量允许' };
    } } },
    migrate(previous) { if (!ids.includes(previous.moduleId) || previous.stateVersion !== 1 || previous.version !== '1.0.0' || typeof previous.state !== 'object' || previous.state === null || Array.isArray(previous.state) || Object.keys(previous.state).length) throw new Error('不兼容的容量状态'); return {}; }
  };
}
export const capacityModules = ids.map(capacityModule);
