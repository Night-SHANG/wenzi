import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, objectSchema, own, positiveCountSchema } from './capacity.ts';

interface State { hp: number }
function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function status(ctx: ReadContext): { hp: number; maxHp: number } {
  const result = ctx.query('progression', 'status');
  if (!object(result) || !object(result.values)) return ctx.fail('INVALID_PROGRESSION', '成长提供者没有返回属性映射');
  const maxHp = own(result.values, 'maxHp');
  if (typeof maxHp !== 'number' || !Number.isSafeInteger(maxHp) || maxHp <= 0) return ctx.fail('INVALID_MAX_HP', '最大生命必须为正安全整数');
  const { hp } = ctx.state<State>();
  if (!Number.isSafeInteger(hp) || hp < 0 || hp > maxHp) return ctx.fail('INVALID_HP', '当前生命必须在0和最大生命之间');
  return { hp, maxHp };
}
export const vitalsModule: ModuleDefinition = {
  manifest: { id: 'vitals.pool', title: '生命池', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { vitals: '1.0.0' }, requires: { progression: { version: '^1.0.0' } } },
  configSchema: objectSchema({ initialHp: countSchema }), stateSchema: objectSchema({ hp: countSchema }),
  initialState: config => ({ hp: config.initialHp! }), validate(ctx) { status(ctx); },
  commands: {
    damage: { schema: objectSchema({ amount: positiveCountSchema }), execute(ctx, input) { const before = status(ctx); const hp = Math.max(0, before.hp - (input.amount as number)); ctx.write({ hp }); return { hp, maxHp: before.maxHp }; } },
    heal: { schema: objectSchema({ amount: positiveCountSchema }), execute(ctx, input) {
      const before = status(ctx); if (before.hp === before.maxHp) return ctx.fail('HP_FULL', '生命已满');
      const hp = before.hp + Math.min(input.amount as number, before.maxHp - before.hp); ctx.write({ hp }); return { hp, maxHp: before.maxHp };
    } }
  }, queries: { status: { schema: emptySchema, execute: status } }
};
