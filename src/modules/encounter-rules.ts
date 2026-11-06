import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, MAX_NUMBER, numberSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';

export interface EncounterDefinition { id: string; name: string; location: string; enemy: { maxHp: number; attack: number; defense: number }; loot: Record<string, number>; experience: number; cooldownSeconds: number }
export const encounterSchema = objectSchema({ name: { type: 'string', minLength: 1 }, location: idSchema, enemy: objectSchema({ maxHp: positiveCountSchema, attack: positiveCountSchema, defense: countSchema }), loot: recordSchema(positiveCountSchema), experience: countSchema, cooldownSeconds: numberSchema });
export function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function isId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && [...value].length <= 128; }
export function isCount(value: unknown, positive = false): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= (positive ? 1 : 0); }
export function isSeconds(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER; }
export function readEncounter(ctx: ReadContext, value: JsonValue, expectedId?: string): EncounterDefinition {
  if (!isObject(value) || !isId(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || !isId(value.location)
    || !isObject(value.enemy) || !isCount(value.enemy.maxHp, true) || !isCount(value.enemy.attack, true) || !isCount(value.enemy.defense)
    || !isObject(value.loot) || Object.entries(value.loot).some(([id, quantity]) => !isId(id) || !isCount(quantity, true))
    || !isCount(value.experience) || !isSeconds(value.cooldownSeconds)) return ctx.fail('INVALID_ENCOUNTER_RULE', '遭遇规则返回了无效内容');
  return { id: value.id, name: value.name, location: value.location, enemy: { maxHp: value.enemy.maxHp, attack: value.enemy.attack, defense: value.enemy.defense }, loot: value.loot as Record<string, number>, experience: value.experience, cooldownSeconds: value.cooldownSeconds };
}
export const encounterRulesModule: ModuleDefinition = {
  manifest: { id: 'encounters.catalog', title: '遭遇目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'encounter-rule': '1.0.0' } },
  configSchema: objectSchema({ encounters: recordSchema(encounterSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ encounter: idSchema }), execute(ctx, input) { const id = input.encounter as string, entry = own(ctx.config.encounters as Record<string, JsonObject>, id); if (!entry) return ctx.fail('UNKNOWN_ENCOUNTER', `未知遭遇：${id}`); return { id, ...entry }; } },
    list: { schema: emptySchema, execute: ctx => ({ encounters: Object.entries(ctx.config.encounters as JsonObject).map(([id, entry]) => ({ id, ...(entry as JsonObject) })) }) }
  }
};
