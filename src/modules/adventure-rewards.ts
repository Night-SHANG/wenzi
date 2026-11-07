import type { ExecutionContext, JsonValue, ReadContext } from '../contracts.ts';
import { safeCount } from './capacity.ts';
import { isCount, isId, isObject } from './encounter-rules.ts';

export function readAdventureQuantity(ctx: ReadContext, value: JsonValue): number {
  if (!isObject(value) || !isCount(value.quantity)) return ctx.fail('INVALID_INVENTORY', '库存能力没有返回有效数量');
  return value.quantity;
}
export function readAdventureInventory(ctx: ReadContext, container: string, item: string): number {
  return readAdventureQuantity(ctx, ctx.query('inventory', 'count', { container, item }));
}
export function checkAdventureContainer(ctx: ReadContext, container: string): void {
  const value = ctx.query('inventory', 'list', { container });
  if (!isObject(value) || !Array.isArray(value.items) || !isObject(value.limits)) ctx.fail('INVALID_INVENTORY', '库存能力没有返回有效容器');
}
export function readAdventureProgression(ctx: ReadContext, value = ctx.query('progression', 'status')): { experience: number; values: Record<string, number> } {
  if (!isObject(value) || !isCount(value.experience) || !isCount(value.level, true) || !isCount(value.floorExperience) || value.floorExperience > value.experience
    || !(value.nextExperience === null || (isCount(value.nextExperience) && value.nextExperience > value.experience)) || !isObject(value.values)
    || Object.entries(value.values).some(([id, n]) => !isId(id) || !isCount(n))) return ctx.fail('INVALID_PROGRESSION', '成长能力没有返回有效成长状态');
  return { experience: value.experience, values: value.values as Record<string, number> };
}

/** Transfer frozen rewards through the existing inventory and progression transaction. */
export function grantAdventureRewards(ctx: ExecutionContext, terms: { container: string; loot: Record<string, number>; experience: number }): void {
  if (!isId(terms.container) || !isObject(terms.loot) || Object.entries(terms.loot).some(([id, n]) => !isId(id) || !isCount(n, true)) || !isCount(terms.experience)) {
    ctx.fail('INVALID_REWARDS', '冒险奖励必须使用有效物品和安全数量');
  }
  checkAdventureContainer(ctx, terms.container);
  for (const [item, quantity] of Object.entries(terms.loot)) {
    const expected = safeCount(ctx, readAdventureInventory(ctx, terms.container, item) + quantity, '奖励库存');
    const returned = readAdventureQuantity(ctx, ctx.call('inventory', 'add', { container: terms.container, item, quantity }));
    if (returned !== expected || readAdventureInventory(ctx, terms.container, item) !== expected) ctx.fail('INVALID_INVENTORY', '奖励库存返回与实际数量不一致');
  }
  if (terms.experience) {
    const expected = safeCount(ctx, readAdventureProgression(ctx).experience + terms.experience, '奖励经验');
    const returned = readAdventureProgression(ctx, ctx.call('progression', 'gain', { amount: terms.experience }));
    if (returned.experience !== expected || readAdventureProgression(ctx).experience !== expected) ctx.fail('INVALID_PROGRESSION', '奖励经验返回与实际数量不一致');
  }
}
