import type { JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';
import { isCount, isId, isObject, isSeconds } from './encounter-rules.ts';

export interface SkillDefinition { id: string; name: string; minLevel: number; requiredTags: string[]; costs: Record<string, number>; cooldownSeconds: number; attackBonus: number; effect: string | null }
const tagsSchema = { type: 'array', items: idSchema, uniqueItems: true };
export const skillSchema = objectSchema({ name: { type: 'string', minLength: 1 }, minLevel: positiveCountSchema, requiredTags: tagsSchema, costs: recordSchema(positiveCountSchema), cooldownSeconds: numberSchema, attackBonus: countSchema, effect: { anyOf: [{ type: 'null' }, idSchema] } });
export function readSkill(ctx: ReadContext, value: JsonValue, expectedId?: string): SkillDefinition {
  if (!isObject(value) || !isId(value.id) || (expectedId !== undefined && value.id !== expectedId) || typeof value.name !== 'string' || !value.name.length
    || !isCount(value.minLevel, true) || !Array.isArray(value.requiredTags) || value.requiredTags.some(tag => !isId(tag)) || new Set(value.requiredTags).size !== value.requiredTags.length
    || !isObject(value.costs) || Object.entries(value.costs).some(([id, n]) => !isId(id) || !isCount(n, true)) || !isSeconds(value.cooldownSeconds) || !isCount(value.attackBonus)
    || !(value.effect === null || isId(value.effect))) return ctx.fail('INVALID_SKILL_RULE', '技能规则没有返回有效条款');
  return { id: value.id, name: value.name, minLevel: value.minLevel, requiredTags: value.requiredTags as string[], costs: value.costs as Record<string, number>, cooldownSeconds: value.cooldownSeconds, attackBonus: value.attackBonus, effect: value.effect };
}
export const skillRulesModule: ModuleDefinition = {
  manifest: { id: 'skills.catalog', title: '技能目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'skill-rule': '1.0.0' } },
  configSchema: objectSchema({ skills: recordSchema(skillSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ skill: idSchema }), execute(ctx, input) { const id = input.skill as string, value = own(ctx.config.skills as Record<string, JsonValue>, id); if (!value) return ctx.fail('UNKNOWN_SKILL', `未知技能：${id}`); return { id, ...(value as object) }; } },
    list: { schema: emptySchema, execute: ctx => ({ skills: Object.entries(ctx.config.skills as Record<string, object>).map(([id, value]) => ({ id, ...value })) }) }
  }
};
