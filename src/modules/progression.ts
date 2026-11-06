import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, objectSchema, positiveCountSchema, safeCount } from './capacity.ts';

interface State { experience: number }
function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function resolve(ctx: ReadContext, experience = ctx.state<State>().experience): JsonObject {
  const result = ctx.query('progression-rule', 'resolve', { experience });
  if (!object(result) || result.experience !== experience || !count(result.level) || result.level < 1 || result.level > 1000
    || !count(result.floorExperience) || result.floorExperience > experience || result.floorExperience < result.level - 1
    || (result.level === 1 ? result.floorExperience !== 0 : result.floorExperience === 0)
    || (result.nextExperience !== null && (!count(result.nextExperience) || result.nextExperience <= experience || result.level === 1000))
    || !object(result.values)) return ctx.fail('INVALID_PROGRESSION_RULE', '成长规则返回了无效经验或等级边界');
  for (const [key, value] of Object.entries(result.values)) {
    if (key.length < 1 || [...key].length > 128 || !count(value)) ctx.fail('INVALID_PROGRESSION_RULE', '成长属性必须为有效ID与非负安全整数映射');
  }
  return { experience, level: result.level, floorExperience: result.floorExperience, nextExperience: result.nextExperience, values: result.values };
}
export const progressionModule: ModuleDefinition = {
  manifest: { id: 'progression.track', title: '总经验成长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' }, requires: { 'progression-rule': { version: '^1.0.0' } } },
  configSchema: objectSchema({ initialExperience: countSchema }), stateSchema: objectSchema({ experience: countSchema }),
  initialState: config => ({ experience: config.initialExperience! }), validate(ctx) { resolve(ctx); },
  commands: { gain: { schema: objectSchema({ amount: positiveCountSchema }), execute(ctx, input) {
    const experience = safeCount(ctx, ctx.state<State>().experience + (input.amount as number), '总经验');
    const result = resolve(ctx, experience); ctx.write({ experience }); return result;
  } } },
  queries: { status: { schema: emptySchema, execute: ctx => resolve(ctx) } }
};
