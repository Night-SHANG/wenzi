import type { ExecutionContext, JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, recordSchema, safeCount } from './capacity.ts';
import { checkQuestGraph, frozenQuestSchema, questId, questObject, readQuest, readQuestCounts } from './quest-rules.ts';
import type { FrozenQuest } from './quest-rules.ts';

interface AcceptedQuest { definition: FrozenQuest; baselineWins: Record<string, number> }
interface State { active: Record<string, AcceptedQuest>; completed: Record<string, number> }
function container(ctx: ReadContext): string { return ctx.config.container as string; }
function put<T>(map: Record<string, T>, id: string, value: T): void { Object.defineProperty(map, id, { value, enumerable: true, writable: true, configurable: true }); }
function currentCatalog(ctx: ReadContext): Map<string, FrozenQuest> {
  const result = ctx.query('quest-rule', 'list', {});
  if (!questObject(result) || !Array.isArray(result.quests)) return ctx.fail('INVALID_QUEST', '任务提供者没有返回目录列表');
  const quests = new Map<string, FrozenQuest>();
  for (const value of result.quests) { const quest = readQuest(ctx, value); if (quests.has(quest.id)) ctx.fail('INVALID_QUEST', `重复任务：${quest.id}`); quests.set(quest.id, quest); }
  checkQuestGraph(ctx, quests); return quests;
}
function sameQuest(a: FrozenQuest, b: FrozenQuest): boolean {
  const normalized = (quest: FrozenQuest) => ({ ...quest, prerequisites: [...quest.prerequisites].sort(), locations: [...quest.locations].sort(),
    delivery: Object.entries(quest.delivery).sort(), victories: Object.entries(quest.victories).sort(), rewards: Object.entries(quest.rewards).sort() });
  return JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
}
function inventoryCount(ctx: ReadContext, item: string): number {
  const value = ctx.query('inventory', 'count', { container: container(ctx), item });
  if (!questObject(value) || typeof value.quantity !== 'number') return ctx.fail('INVALID_INVENTORY', '库存提供者没有返回物品数量');
  return safeCount(ctx, value.quantity, '库存数量');
}
function checkInventory(ctx: ReadContext): void {
  const value = ctx.query('inventory', 'list', { container: container(ctx) });
  if (!questObject(value) || !Array.isArray(value.items)) return ctx.fail('INVALID_INVENTORY', '库存提供者没有返回物品列表');
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!questObject(item) || !questId(item.id) || typeof item.quantity !== 'number' || seen.has(item.id)) return ctx.fail('INVALID_INVENTORY', '库存物品列表无效或重复');
    seen.add(item.id); safeCount(ctx, item.quantity, '库存数量');
    if (inventoryCount(ctx, item.id) !== item.quantity) ctx.fail('INVALID_INVENTORY', '库存列表与物品数量不符');
  }
}
function wins(ctx: ReadContext): Record<string, number> {
  if (!ctx.has('encounters')) return ctx.fail('MISSING_ENCOUNTERS', '胜利目标需要遭遇能力');
  const value = ctx.query('encounters', 'records', {});
  if (!questObject(value) || !questObject(value.wins)) return ctx.fail('INVALID_ENCOUNTERS', '遭遇提供者没有返回累计胜利');
  for (const [id, count] of Object.entries(value.wins)) if (!questId(id) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) ctx.fail('INVALID_ENCOUNTERS', '累计胜利必须为非负安全整数');
  return value.wins as Record<string, number>;
}
function checkReferences(ctx: ReadContext, quest: FrozenQuest, current: boolean): void {
  for (const item of new Set([...Object.keys(quest.delivery), ...Object.keys(quest.rewards)])) inventoryCount(ctx, item);
  if (quest.locations.length) {
    if (!ctx.has('location')) ctx.fail('MISSING_LOCATION', '限定地点的任务需要地点能力');
    for (const location of quest.locations) { const value = ctx.query('location', 'describe', { location }); if (!questObject(value) || value.id !== location) ctx.fail('INVALID_LOCATION', '地点提供者返回的地点与引用不符'); }
  }
  if (Object.keys(quest.victories).length) {
    wins(ctx);
    if (current) for (const encounter of Object.keys(quest.victories)) { const value = ctx.query('encounters', 'describe', { encounter }); if (!questObject(value) || value.id !== encounter) ctx.fail('INVALID_ENCOUNTERS', '遭遇提供者返回的遭遇与引用不符'); }
  }
}
function allowedLocation(ctx: ReadContext, quest: FrozenQuest): boolean {
  if (!quest.locations.length) return true;
  const current = ctx.query('location', 'current', {});
  if (!questObject(current) || !questId(current.id)) return ctx.fail('INVALID_LOCATION', '地点提供者没有返回当前位置');
  return quest.locations.includes(current.id);
}
function checkLocation(ctx: ReadContext, quest: FrozenQuest): void { if (!allowedLocation(ctx, quest)) ctx.fail('WRONG_LOCATION', '必须在任务允许的地点操作'); }
function remainingVictories(ctx: ReadContext, accepted: AcceptedQuest): Record<string, number> {
  const targets = Object.entries(accepted.definition.victories);
  if (!targets.length) return {};
  const records = wins(ctx);
  return Object.fromEntries(targets.map(([id, quantity]) => {
    const count = own(records, id) ?? 0, baseline = own(accepted.baselineWins, id);
    if (baseline === undefined || count < baseline) return ctx.fail('COUNTER_BACKWARD', `累计胜利不能低于接取基线：${id}`);
    return [id, Math.max(0, quantity - (count - baseline))];
  }));
}
function remainingDelivery(ctx: ReadContext, quest: FrozenQuest): Record<string, number> {
  return Object.fromEntries(Object.entries(quest.delivery).map(([item, quantity]) => [item, Math.max(0, quantity - inventoryCount(ctx, item))]));
}
function progress(ctx: ReadContext, accepted: AcceptedQuest): { remainingDelivery: Record<string, number>; remainingVictories: Record<string, number>; ready: boolean } {
  const delivery = remainingDelivery(ctx, accepted.definition);
  const remaining = remainingVictories(ctx, accepted);
  return { remainingDelivery: delivery, remainingVictories: remaining, ready: Object.values(delivery).every(n => n === 0) && Object.values(remaining).every(n => n === 0) && allowedLocation(ctx, accepted.definition) };
}
function experience(ctx: ReadContext, value: unknown): number {
  if (!questObject(value) || typeof value.experience !== 'number') return ctx.fail('INVALID_PROGRESSION', '成长提供者没有返回总经验');
  return safeCount(ctx, value.experience, '总经验');
}
function validate(ctx: ReadContext): void {
  checkInventory(ctx); experience(ctx, ctx.query('progression', 'status', {}));
  // The installed catalog remains independently valid even while old accepted terms are frozen.
  for (const quest of currentCatalog(ctx).values()) checkReferences(ctx, quest, true);
  const state = ctx.state<State>();
  for (const [id, accepted] of Object.entries(state.active)) {
    const quest = readQuest(ctx, accepted.definition, id); checkReferences(ctx, quest, false);
    const baseline = readQuestCounts(ctx, accepted.baselineWins, false);
    if (Object.keys(baseline).length !== Object.keys(quest.victories).length || Object.keys(baseline).some(id => !Object.hasOwn(quest.victories, id))) ctx.fail('INVALID_QUEST', '任务基线与胜利目标不一致');
    remainingVictories(ctx, accepted);
  }
}
const questInput = objectSchema({ quest: idSchema });
export const questsModule: ModuleDefinition = {
  manifest: { id: 'quests.journal', title: '任务日志', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { quests: '1.0.0' }, requires: {
    'quest-rule': { version: '^1.0.0' }, inventory: { version: '^1.0.0' }, progression: { version: '^1.0.0' }, location: { version: '^1.0.0', optional: true }, encounters: { version: '^1.0.0', optional: true }
  } },
  configSchema: objectSchema({ container: idSchema }),
  stateSchema: objectSchema({ active: recordSchema(objectSchema({ definition: frozenQuestSchema, baselineWins: recordSchema(countSchema) })), completed: recordSchema(countSchema) }),
  initialState: () => ({ active: {}, completed: {} }), validate,
  commands: {
    accept: { schema: questInput, execute(ctx, input) {
      const id = input.quest as string, state = ctx.state<State>();
      if (own(state.active, id)) return ctx.fail('QUEST_ACTIVE', '该任务已经接取');
      const catalog = currentCatalog(ctx), listed = catalog.get(id);
      if (!listed) return ctx.fail('UNKNOWN_QUEST', `未知任务：${id}`);
      const quest = readQuest(ctx, ctx.query('quest-rule', 'get', { quest: id }), id);
      if (!sameQuest(quest, listed)) return ctx.fail('INVALID_QUEST', '任务目录与查询定义不一致');
      checkQuestGraph(ctx, new Map([...catalog, [id, quest]])); checkReferences(ctx, quest, true); checkLocation(ctx, quest);
      if (!quest.repeatable && (own(state.completed, id) ?? 0) > 0) return ctx.fail('QUEST_COMPLETED', '该任务已经完成且不可重复');
      if (quest.prerequisites.some(id => !(own(state.completed, id) ?? 0))) return ctx.fail('QUEST_LOCKED', '尚未完成前置任务');
      const records = Object.keys(quest.victories).length ? wins(ctx) : {};
      put(state.active, id, { definition: quest, baselineWins: Object.fromEntries(Object.keys(quest.victories).map(id => [id, own(records, id) ?? 0])) });
      ctx.write(state as unknown as JsonValue); ctx.emit('quests.accepted', { quest: id }); return { quest: id };
    } },
    turnIn: { schema: questInput, execute(ctx, input) {
      const id = input.quest as string, state = ctx.state<State>(), accepted = own(state.active, id);
      if (!accepted) return ctx.fail('QUEST_NOT_ACTIVE', '任务尚未接取');
      checkLocation(ctx, accepted.definition);
      if (!progress(ctx, accepted).ready) return ctx.fail('QUEST_NOT_READY', '任务目标尚未完成');
      for (const [item, quantity] of Object.entries(accepted.definition.delivery)) changeItem(ctx, 'remove', item, quantity);
      for (const [item, quantity] of Object.entries(accepted.definition.rewards)) changeItem(ctx, 'add', item, quantity);
      if (accepted.definition.experience) {
        const before = experience(ctx, ctx.query('progression', 'status', {})), expected = safeCount(ctx, before + accepted.definition.experience, '奖励后总经验');
        const result = ctx.call('progression', 'gain', { amount: accepted.definition.experience });
        if (experience(ctx, result) !== expected || experience(ctx, ctx.query('progression', 'status', {})) !== expected) ctx.fail('INVALID_PROGRESSION', '成长奖励结果与总经验不一致');
      }
      const completed = safeCount(ctx, (own(state.completed, id) ?? 0) + 1, '任务完成次数');
      put(state.completed, id, completed); delete state.active[id]; ctx.write(state as unknown as JsonValue);
      ctx.emit('quests.completed', { quest: id, completed }); return { quest: id, completed };
    } },
    abandon: { schema: questInput, execute(ctx, input) {
      const id = input.quest as string, state = ctx.state<State>(), accepted = own(state.active, id);
      if (!accepted) return ctx.fail('QUEST_NOT_ACTIVE', '任务尚未接取');
      // Validate the baseline before deleting it, including inside a larger nested transaction.
      remainingVictories(ctx, accepted); delete state.active[id]; ctx.write(state as unknown as JsonValue); ctx.emit('quests.abandoned', { quest: id }); return { quest: id };
    } }
  },
  queries: { list: { schema: emptySchema, execute(ctx) {
    const catalog = currentCatalog(ctx), state = ctx.state<State>(), ids = new Set([...catalog.keys(), ...Object.keys(state.active), ...Object.keys(state.completed)]);
    return { quests: [...ids].map(id => {
      const accepted = own(state.active, id), quest = accepted?.definition ?? catalog.get(id), completed = own(state.completed, id) ?? 0;
      if (!quest) return { id, name: id, description: '', status: 'completed', ready: false, completed, remainingDelivery: {}, remainingVictories: {}, rewards: {}, experience: 0, locations: [] };
      const pending = accepted ? progress(ctx, accepted) : { remainingDelivery: remainingDelivery(ctx, quest), remainingVictories: quest.victories, ready: false };
      const status = accepted ? pending.ready ? 'ready' : 'active' : !quest.repeatable && completed > 0 ? 'completed' : quest.prerequisites.some(id => !(own(state.completed, id) ?? 0)) ? 'locked' : 'available';
      return { id, name: quest.name, description: quest.description, status, ready: pending.ready, completed, remainingDelivery: pending.remainingDelivery, remainingVictories: pending.remainingVictories, rewards: quest.rewards, experience: quest.experience, locations: quest.locations };
    }) } as unknown as JsonObject;
  } } }
};
function changeItem(ctx: ExecutionContext, action: 'add' | 'remove', item: string, quantity: number): void {
  const before = inventoryCount(ctx, item), expected = safeCount(ctx, before + (action === 'add' ? quantity : -quantity), '变更后库存');
  const result = ctx.call('inventory', action, { container: container(ctx), item, quantity });
  if (!questObject(result) || typeof result.quantity !== 'number' || safeCount(ctx, result.quantity, '变更后库存') !== expected || inventoryCount(ctx, item) !== expected) ctx.fail('INVALID_INVENTORY', '库存操作结果与数量不一致');
}
