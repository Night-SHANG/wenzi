import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own } from './capacity.ts';

function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function values(ctx: ReadContext, value: unknown, signed: boolean): Record<string, number> {
  if (!object(value)) return ctx.fail('INVALID_ATTRIBUTE_VALUES', '属性提供者没有返回有效属性映射');
  for (const [key, amount] of Object.entries(value)) if (key.length === 0 || [...key].length > 128 || typeof amount !== 'number' || !Number.isSafeInteger(amount) || (!signed && amount < 0)) ctx.fail('INVALID_ATTRIBUTE_VALUES', '属性必须为有效ID与安全整数映射');
  return value as Record<string, number>;
}
function source(ctx: ReadContext, capability: string): Record<string, number> {
  if (!ctx.has(capability)) return {};
  const result = ctx.query(capability, 'status');
  if (!object(result)) return ctx.fail('INVALID_ATTRIBUTE_VALUES', '属性来源没有返回有效状态');
  const modifiers = values(ctx, result.modifiers, true), allowed = ctx.config.keys as string[];
  for (const key of Object.keys(modifiers)) if (!allowed.includes(key)) ctx.fail('INVALID_ATTRIBUTE_MODIFIER', `配置不允许修改属性：${key}`);
  return modifiers;
}
function status(ctx: ReadContext): JsonObject {
  const progression = ctx.query('progression', 'status');
  if (!object(progression)) return ctx.fail('INVALID_ATTRIBUTE_VALUES', '成长提供者没有返回有效状态');
  const base = values(ctx, progression.values, false), equipment = source(ctx, 'equipment'), effects = source(ctx, 'effects'), result = { ...base };
  for (const modifiers of [equipment, effects]) for (const [key, amount] of Object.entries(modifiers)) {
    const total = (own(result, key) ?? 0) + amount;
    if (!Number.isSafeInteger(total)) ctx.fail('INVALID_ATTRIBUTE_VALUES', '派生属性的中间结果超出安全整数范围');
    result[key] = total;
  }
  for (const value of Object.values(result)) if (value < 0) ctx.fail('INVALID_ATTRIBUTE_VALUES', '派生属性不能小于零');
  return { base, equipment, effects, values: result };
}
export const attributesModule: ModuleDefinition = {
  manifest: { id: 'attributes.additive', title: '加法派生属性', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { attributes: '1.0.0' }, requires: { progression: { version: '^1.0.0' }, equipment: { version: '^1.0.0', optional: true }, effects: { version: '^1.0.0', optional: true } } },
  configSchema: objectSchema({ keys: { type: 'array', uniqueItems: true, items: idSchema } }), stateSchema: emptySchema, initialState: () => ({}),
  validate(ctx) { status(ctx); }, queries: { status: { schema: emptySchema, execute: status } }
};
