import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, objectSchema, recordSchema } from './capacity.ts';

interface Level { experience: number; values: Record<string, number> }
function levels(ctx: ReadContext): Level[] { return ctx.config.levels as unknown as Level[]; }
export const progressionRulesModule: ModuleDefinition = {
  manifest: { id: 'progression.curve', title: '经验成长曲线', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'progression-rule': '1.0.0' } },
  configSchema: objectSchema({ levels: { type: 'array', minItems: 1, maxItems: 1000, items: objectSchema({ experience: countSchema, values: recordSchema(countSchema) }) } }),
  stateSchema: emptySchema, initialState: () => ({}),
  validate(ctx) {
    const curve = levels(ctx);
    if (curve[0]!.experience !== 0) ctx.fail('INVALID_PROGRESSION_CURVE', '成长曲线首项经验必须为0');
    for (let i = 1; i < curve.length; i++) if (curve[i]!.experience <= curve[i - 1]!.experience) ctx.fail('INVALID_PROGRESSION_CURVE', '成长曲线经验阈值必须严格增加');
  },
  queries: { resolve: { schema: objectSchema({ experience: countSchema }), execute(ctx, input) {
    const experience = input.experience as number, curve = levels(ctx);
    let index = 0;
    while (index + 1 < curve.length && curve[index + 1]!.experience <= experience) index++;
    return { experience, level: index + 1, floorExperience: curve[index]!.experience, nextExperience: curve[index + 1]?.experience ?? null, values: curve[index]!.values as JsonObject };
  } } }
};
