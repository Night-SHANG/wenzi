import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema, safeCount } from './capacity.ts';

interface Remedy { name: string; item: string; healing: number; locations: string[] }
interface Config { container: string; remedies: Record<string, Remedy> }
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function health(ctx: ReadContext, value: unknown): { hp: number; maxHp: number } {
  if (!object(value) || typeof value.hp !== 'number' || !Number.isSafeInteger(value.hp) || value.hp < 0
    || typeof value.maxHp !== 'number' || !Number.isSafeInteger(value.maxHp) || value.maxHp <= 0 || value.hp > value.maxHp) return ctx.fail('INVALID_VITALS', '生命提供者返回了无效生命状态');
  return { hp: value.hp, maxHp: value.maxHp };
}
function validate(ctx: ReadContext): void {
  const cfg = config(ctx), inventory = ctx.query('inventory', 'list', { container: cfg.container });
  if (!object(inventory) || !Array.isArray(inventory.items)) ctx.fail('INVALID_INVENTORY', '库存提供者没有返回容器物品列表');
  health(ctx, ctx.query('vitals', 'status'));
  for (const remedy of Object.values(cfg.remedies)) {
    const item = ctx.query('inventory', 'count', { container: cfg.container, item: remedy.item });
    if (!object(item) || typeof item.quantity !== 'number') ctx.fail('INVALID_INVENTORY', '库存提供者没有返回恢复物品数量');
    safeCount(ctx, item.quantity, '恢复物品数量');
    if (remedy.locations.length && !ctx.has('location')) ctx.fail('MISSING_LOCATION', '带地点条件的恢复物品必须绑定地点能力');
    for (const location of remedy.locations) {
      const described = ctx.query('location', 'describe', { location });
      if (!object(described) || described.id !== location) ctx.fail('INVALID_LOCATION', '地点提供者返回的地点与配置不符');
    }
  }
}
export const recoveryModule: ModuleDefinition = {
  manifest: { id: 'recovery.items', title: '物品恢复', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { recovery: '1.0.0' }, requires: { inventory: { version: '^1.0.0' }, vitals: { version: '^1.0.0' }, location: { version: '^1.0.0', optional: true } } },
  configSchema: objectSchema({ container: idSchema, remedies: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, item: idSchema, healing: positiveCountSchema, locations: { type: 'array', uniqueItems: true, items: idSchema } })) }),
  stateSchema: emptySchema, initialState: () => ({}), validate,
  commands: { use: { schema: objectSchema({ remedy: idSchema }), execute(ctx, input) {
    const remedy = own(config(ctx).remedies, input.remedy as string);
    if (!remedy) return ctx.fail('UNKNOWN_REMEDY', `未知恢复物品：${input.remedy}`);
    if (remedy.locations.length) {
      const current = ctx.query('location', 'current');
      if (!object(current) || !id(current.id)) return ctx.fail('INVALID_LOCATION', '地点提供者没有返回有效当前位置');
      if (!remedy.locations.includes(current.id)) ctx.fail('WRONG_LOCATION', '必须在允许的地点使用恢复物品');
    }
    const before = health(ctx, ctx.query('vitals', 'status'));
    if (before.hp === before.maxHp) return ctx.fail('HP_FULL', '生命已满');
    ctx.call('inventory', 'remove', { container: config(ctx).container, item: remedy.item, quantity: 1 });
    const after = health(ctx, ctx.call('vitals', 'heal', { amount: remedy.healing }));
    if (after.maxHp !== before.maxHp || after.hp !== before.hp + Math.min(remedy.healing, before.maxHp - before.hp)) return ctx.fail('INVALID_VITALS', '生命提供者返回的恢复结果不一致');
    return after;
  } } },
  queries: { list: { schema: emptySchema, execute: ctx => ({ remedies: Object.entries(config(ctx).remedies).map(([id, remedy]) => ({ id, ...remedy })) }) } }
};
