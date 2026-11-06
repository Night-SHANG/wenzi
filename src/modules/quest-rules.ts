import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';

export interface FrozenQuest {
  id: string; name: string; description: string; prerequisites: string[];
  delivery: Record<string, number>; victories: Record<string, number>; rewards: Record<string, number>;
  experience: number; locations: string[]; repeatable: boolean;
}
const idsSchema = { type: 'array', items: idSchema, uniqueItems: true };
const fields = {
  name: { type: 'string', minLength: 1 }, description: { type: 'string' }, prerequisites: idsSchema,
  delivery: recordSchema(positiveCountSchema), victories: recordSchema(positiveCountSchema), rewards: recordSchema(positiveCountSchema),
  experience: countSchema, locations: idsSchema, repeatable: { type: 'boolean' }
};
const objectivesSchema = { anyOf: [{ properties: { delivery: { type: 'object', minProperties: 1 } } }, { properties: { victories: { type: 'object', minProperties: 1 } } }] };
const definitionSchema = { ...objectSchema(fields), ...objectivesSchema };
export const frozenQuestSchema = { ...objectSchema({ id: idSchema, ...fields }), ...objectivesSchema };
export function questObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function questId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function readIds(ctx: ReadContext, value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => !questId(id)) || new Set(value).size !== value.length) return ctx.fail('INVALID_QUEST', '任务引用必须为唯一 ID 数组');
  return value as string[];
}
export function readQuestCounts(ctx: ReadContext, value: unknown, positive = true): Record<string, number> {
  if (!questObject(value)) return ctx.fail('INVALID_QUEST', '任务计数必须为映射');
  for (const [id, quantity] of Object.entries(value)) if (!questId(id) || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < (positive ? 1 : 0)) ctx.fail('INVALID_QUEST', '任务计数必须为安全整数');
  return value as Record<string, number>;
}
export function readQuest(ctx: ReadContext, value: unknown, expectedId?: string): FrozenQuest {
  if (!questObject(value) || !questId(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || typeof value.description !== 'string'
    || typeof value.repeatable !== 'boolean' || typeof value.experience !== 'number' || !Number.isSafeInteger(value.experience) || value.experience < 0) return ctx.fail('INVALID_QUEST', '任务提供者返回了无效定义');
  const delivery = readQuestCounts(ctx, value.delivery), victories = readQuestCounts(ctx, value.victories);
  if (!Object.keys(delivery).length && !Object.keys(victories).length) return ctx.fail('INVALID_QUEST', '任务至少需要一个目标');
  return { id: value.id, name: value.name, description: value.description, prerequisites: readIds(ctx, value.prerequisites), delivery, victories,
    rewards: readQuestCounts(ctx, value.rewards), experience: value.experience, locations: readIds(ctx, value.locations), repeatable: value.repeatable };
}
export function checkQuestGraph(ctx: ReadContext, quests: Map<string, FrozenQuest>): void {
  for (const quest of quests.values()) for (const prerequisite of quest.prerequisites) if (!quests.has(prerequisite)) ctx.fail('UNKNOWN_QUEST', `前置任务不存在：${prerequisite}`);
  const done = new Set<string>();
  for (const id of quests.keys()) {
    const path = new Set<string>(), stack: { id: string; exit: boolean }[] = [{ id, exit: false }];
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) { path.delete(frame.id); done.add(frame.id); continue; }
      if (done.has(frame.id)) continue;
      if (path.has(frame.id)) ctx.fail('QUEST_CYCLE', '前置任务不能循环');
      path.add(frame.id); stack.push({ id: frame.id, exit: true });
      for (const prerequisite of quests.get(frame.id)!.prerequisites) stack.push({ id: prerequisite, exit: false });
    }
  }
}
function catalog(ctx: ReadContext): Map<string, FrozenQuest> {
  const result = new Map<string, FrozenQuest>();
  for (const [id, definition] of Object.entries(ctx.config.quests as JsonObject)) result.set(id, readQuest(ctx, { id, ...(definition as JsonObject) }, id));
  checkQuestGraph(ctx, result); return result;
}
export const questRulesModule: ModuleDefinition = {
  manifest: { id: 'quests.catalog', title: '任务目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'quest-rule': '1.0.0' } },
  configSchema: objectSchema({ quests: recordSchema(definitionSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  validate(ctx) { catalog(ctx); },
  queries: {
    get: { schema: objectSchema({ quest: idSchema }), execute(ctx, input) {
      const id = input.quest as string, definition = own(ctx.config.quests as Record<string, JsonObject>, id);
      if (!definition) return ctx.fail('UNKNOWN_QUEST', `未知任务：${id}`);
      return { id, ...definition };
    } },
    list: { schema: emptySchema, execute: ctx => ({ quests: Object.entries(ctx.config.quests as JsonObject).map(([id, definition]) => ({ id, ...(definition as JsonObject) })) }) }
  }
};
