import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, limitsSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema, safeCount } from './capacity.ts';
import type { Limits } from './capacity.ts';
interface Item { name: string; weight: number; volume: number; length: number }
interface Container { limits: Limits; items: Record<string, number> }
interface Config { items: Record<string, Item>; containers: Record<string, Container> }
interface State { containers: Record<string, Record<string, number>> }
const itemSchema = objectSchema({ name: { type: 'string', minLength: 1 }, weight: numberSchema, volume: numberSchema, length: numberSchema });
const countsSchema = recordSchema(countSchema);
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function container(ctx: ReadContext, state: State, id: string): Record<string, number> { const c = own(state.containers, id); if (!c || !own(config(ctx).containers, id)) ctx.fail('UNKNOWN_CONTAINER', `未知容器：${id}`); return c; }
function item(ctx: ReadContext, id: string): Item { const result = own(config(ctx).items, id); if (!result) ctx.fail('UNKNOWN_ITEM', `未知物品：${id}`); return result; }
function list(ctx: ReadContext, state: State, id: string): JsonObject {
  const counts = container(ctx, state, id);
  return { items: Object.entries(counts).filter(([,quantity]) => quantity > 0).map(([id, quantity]) => ({ id, ...item(ctx, id), quantity })), limits: config(ctx).containers[id]!.limits as JsonObject };
}
function put(counts: Record<string, number>, id: string, quantity: number): void { Object.defineProperty(counts, id, { value: quantity, enumerable: true, writable: true, configurable: true }); }
function validate(ctx: ReadContext): void {
  const cfg = config(ctx), state = ctx.state<State>();
  if (Object.keys(state.containers).length !== Object.keys(cfg.containers).length) ctx.fail('INVALID_INVENTORY', '容器集合与配置不一致');
  for (const [id, counts] of Object.entries(state.containers)) {
    container(ctx, state, id);
    for (const [itemId, quantity] of Object.entries(counts)) { item(ctx, itemId); safeCount(ctx, quantity, '物品数量'); }
    const listed = list(ctx, state, id);
    const check = ctx.query('capacity', 'check', { limits: listed.limits!, items: (listed.items as JsonObject[]).map(({ id, quantity, weight, volume, length }) => ({ id: id!, quantity: quantity!, weight: weight!, volume: volume!, length: length! })) }) as JsonObject;
    if (check.allowed !== true) ctx.fail('CAPACITY_EXCEEDED', `${id}：${check.reason}`);
  }
}
const changeSchema = objectSchema({ container: idSchema, item: idSchema, quantity: positiveCountSchema });
export const inventoryModule: ModuleDefinition = {
  manifest: { id: 'inventory.basic', title: '基本库存', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { inventory: '1.0.0' }, requires: { capacity: { version: '^1.0.0' } } },
  configSchema: objectSchema({ items: recordSchema(itemSchema), containers: recordSchema(objectSchema({ limits: limitsSchema, items: countsSchema })) }),
  stateSchema: objectSchema({ containers: recordSchema(countsSchema) }),
  initialState(cfg) { const c = cfg as unknown as Config; return { containers: Object.fromEntries(Object.entries(c.containers).map(([id, value]) => [id, { ...value.items }])) }; },
  validate,
  commands: {
    add: { schema: changeSchema, execute(ctx, input) { const { container: id, item: itemId, quantity } = input as { container: string; item: string; quantity: number }; item(ctx, itemId); const state = ctx.state<State>(), counts = container(ctx, state, id); put(counts, itemId, safeCount(ctx, (own(counts, itemId) ?? 0) + quantity, '库存')); ctx.write(state as unknown as JsonValue); validate(ctx); return { quantity: counts[itemId]! }; } },
    remove: { schema: changeSchema, execute(ctx, input) { const { container: id, item: itemId, quantity } = input as { container: string; item: string; quantity: number }; item(ctx, itemId); const state = ctx.state<State>(), counts = container(ctx, state, id), current = own(counts, itemId) ?? 0; if (current < quantity) ctx.fail('INSUFFICIENT_ITEMS', `物品不足：${itemId}`); put(counts, itemId, current - quantity); ctx.write(state as unknown as JsonValue); return { quantity: counts[itemId]! }; } },
    transfer: { schema: objectSchema({ from: idSchema, to: idSchema, item: idSchema, quantity: positiveCountSchema }), execute(ctx, input) {
      const { from, to, item: itemId, quantity } = input as { from: string; to: string; item: string; quantity: number }; item(ctx, itemId); const state = ctx.state<State>(), source = container(ctx, state, from), target = container(ctx, state, to), current = own(source, itemId) ?? 0;
      if (current < quantity) ctx.fail('INSUFFICIENT_ITEMS', `物品不足：${itemId}`);
      if (from !== to) { put(source, itemId, current - quantity); put(target, itemId, safeCount(ctx, (own(target, itemId) ?? 0) + quantity, '目标库存')); }
      ctx.write(state as unknown as JsonValue); validate(ctx); return { transferred: quantity };
    } }
  },
  queries: {
    list: { schema: objectSchema({ container: idSchema }), execute: (ctx, input) => list(ctx, ctx.state<State>(), input.container as string) },
    count: { schema: objectSchema({ container: idSchema, item: idSchema }), execute(ctx, input) { item(ctx, input.item as string); return { quantity: own(container(ctx, ctx.state<State>(), input.container as string), input.item as string) ?? 0 }; } }
  }
};
