import type { ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';
import { isCount, isId, isObject } from './encounter-rules.ts';

export type CompanionDefinition = { id: string; name: string; maxHp: number; attack: number; defense: number; speed: number };
export const companionSchema = objectSchema({ name: { type: 'string', minLength: 1 }, maxHp: positiveCountSchema, attack: positiveCountSchema, defense: countSchema, speed: countSchema });
export function readCompanion(ctx: ReadContext, value: unknown, expectedId?: string): CompanionDefinition {
  if (!isObject(value) || !isId(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || !isCount(value.maxHp, true)
    || !isCount(value.attack, true) || !isCount(value.defense) || !isCount(value.speed)) return ctx.fail('INVALID_COMPANION_RULE', '伙伴规则返回了无效内容');
  return { id: value.id, name: value.name, maxHp: value.maxHp, attack: value.attack, defense: value.defense, speed: value.speed };
}
export const companionRulesModule: ModuleDefinition = {
  manifest: { id: 'companions.catalog', title: '伙伴目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'companion-rule': '1.0.0' } },
  configSchema: objectSchema({ companions: recordSchema(companionSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ member: idSchema }), execute(ctx, input) {
      const id = input.member as string, entry = own(ctx.config.companions as Record<string, import('../contracts.ts').JsonObject>, id);
      if (!entry) return ctx.fail('UNKNOWN_COMPANION', `未知伙伴：${id}`);
      return { id, ...entry };
    } },
    list: { schema: emptySchema, execute: ctx => ({ companions: Object.entries(ctx.config.companions as import('../contracts.ts').JsonObject).map(([id, entry]) => ({ id, ...entry as import('../contracts.ts').JsonObject })) }) }
  }
};
