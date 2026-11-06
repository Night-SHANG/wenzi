import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, numberSchema, objectSchema, positiveCountSchema, recordSchema, safeCount, safeNumber } from './capacity.ts';
import { readSimulationTime } from './simulation-time.ts';

interface Config { container: string; locations?: string[] }
interface Recipe { id: string; name: string; inputs: Record<string, number>; outputs: Record<string, number>; durationSeconds: number }
interface Job { recipe: string; name: string; batches: number; inputs: Record<string, number>; outputs: Record<string, number>; startedAt: number; readyAt: number }
interface State { job: Job | null }
const countsSchema = { ...recordSchema(positiveCountSchema), minProperties: 1 };
const jobSchema = objectSchema({ recipe: idSchema, name: { type: 'string', minLength: 1 }, batches: positiveCountSchema, inputs: countsSchema, outputs: countsSchema, startedAt: numberSchema, readyAt: numberSchema });
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function counts(ctx: ReadContext, value: unknown): Record<string, number> {
  if (!object(value) || Object.keys(value).length === 0) return ctx.fail('INVALID_RECIPE', '配方投入与产出必须为非空物品计数映射');
  for (const [item, quantity] of Object.entries(value)) {
    if (!id(item) || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) ctx.fail('INVALID_RECIPE', '配方物品数量必须为正安全整数');
  }
  return value as Record<string, number>;
}
function readRecipe(ctx: ReadContext, value: unknown, expectedId?: string): Recipe {
  if (!object(value) || !id(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || typeof value.durationSeconds !== 'number' || !(value.durationSeconds > 0)) {
    return ctx.fail('INVALID_RECIPE', '配方提供者返回了无效配方');
  }
  const durationSeconds = safeNumber(ctx, value.durationSeconds, '制作时长');
  return { id: value.id, name: value.name, inputs: counts(ctx, value.inputs), outputs: counts(ctx, value.outputs), durationSeconds };
}
function checkItems(ctx: ReadContext, items: Record<string, number>): void {
  for (const item of Object.keys(items)) {
    const result = ctx.query('inventory', 'count', { container: config(ctx).container, item });
    if (!object(result) || typeof result.quantity !== 'number') ctx.fail('INVALID_INVENTORY', '库存提供者没有返回物品数量');
    safeCount(ctx, result.quantity, '库存数量');
  }
}
function checkLocation(ctx: ReadContext): void {
  const locations = config(ctx).locations;
  if (!locations?.length) return;
  const current = ctx.query('location', 'current');
  if (!object(current) || !id(current.id)) return ctx.fail('INVALID_LOCATION', '地点提供者没有返回当前位置');
  if (!locations.includes(current.id)) ctx.fail('WRONG_LOCATION', '必须在允许的工坊地点操作');
}
function status(ctx: ReadContext): JsonObject {
  const { job } = ctx.state<State>();
  if (!job) return { job: null, ready: false, remainingSeconds: 0 };
  const now = readSimulationTime(ctx, job.startedAt);
  return { job: job as unknown as JsonObject, ready: now >= job.readyAt, remainingSeconds: Math.max(0, job.readyAt - now) };
}
function scale(ctx: ReadContext, items: Record<string, number>, batches: number): Record<string, number> {
  return Object.fromEntries(Object.entries(items).map(([item, quantity]) => [item, safeCount(ctx, quantity * batches, '批量物品数量')]));
}
function validate(ctx: ReadContext): void {
  const cfg = config(ctx), { job } = ctx.state<State>();
  const inventory = ctx.query('inventory', 'list', { container: cfg.container });
  if (!object(inventory) || !Array.isArray(inventory.items)) ctx.fail('INVALID_INVENTORY', '库存提供者没有返回容器物品列表');
  if (cfg.locations?.length) {
    if (!ctx.has('location')) ctx.fail('MISSING_LOCATION', '有限制地点的工坊必须绑定地点能力');
    for (const location of cfg.locations) {
      const described = ctx.query('location', 'describe', { location });
      if (!object(described) || described.id !== location) ctx.fail('INVALID_LOCATION', '地点提供者返回的地点与配置不符');
    }
  }
  readSimulationTime(ctx, job?.startedAt ?? 0);
  if (job) {
    if (!(job.readyAt > job.startedAt)) ctx.fail('INVALID_JOB', '订单完成时间必须晚于开始时间');
    checkItems(ctx, job.inputs); checkItems(ctx, job.outputs);
  } else {
    const result = ctx.query('recipes', 'list');
    if (!object(result) || !Array.isArray(result.recipes)) return ctx.fail('INVALID_RECIPE', '配方提供者没有返回配方列表');
    const ids = new Set<string>();
    for (const value of result.recipes) {
      const recipe = readRecipe(ctx, value);
      if (ids.has(recipe.id)) ctx.fail('INVALID_RECIPE', `重复配方：${recipe.id}`);
      ids.add(recipe.id); checkItems(ctx, recipe.inputs); checkItems(ctx, recipe.outputs);
    }
  }
}
export const craftingModule: ModuleDefinition = {
  manifest: { id: 'crafting.single', title: '单订单制作', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { crafting: '1.0.0' }, requires: {
    inventory: { version: '^1.0.0' }, time: { version: '^1.0.0' }, recipes: { version: '^1.0.0' }, location: { version: '^1.0.0', optional: true }
  } },
  configSchema: objectSchema({ container: idSchema, locations: { type: 'array', uniqueItems: true, items: idSchema } }, ['container']),
  stateSchema: objectSchema({ job: { anyOf: [{ type: 'null' }, jobSchema] } }),
  initialState: () => ({ job: null }), validate,
  commands: {
    start: { schema: objectSchema({ recipe: idSchema, batches: positiveCountSchema }, ['recipe']), execute(ctx, input) {
      if (ctx.state<State>().job) return ctx.fail('CRAFTING_BUSY', '已有未领取或未取消的订单');
      checkLocation(ctx);
      const recipe = readRecipe(ctx, ctx.query('recipes', 'get', { recipe: input.recipe! }), input.recipe as string);
      const batches = input.batches as number | undefined ?? 1;
      const inputs = scale(ctx, recipe.inputs, batches), outputs = scale(ctx, recipe.outputs, batches);
      checkItems(ctx, inputs); checkItems(ctx, outputs);
      const duration = safeNumber(ctx, recipe.durationSeconds * batches, '批量制作时长');
      const startedAt = readSimulationTime(ctx), readyAt = safeNumber(ctx, startedAt + duration, '订单完成时间');
      if (!(readyAt > startedAt)) return ctx.fail('TIME_PRECISION', '制作时长过小，完成时间无法表示');
      const job: Job = { recipe: recipe.id, name: recipe.name, batches, inputs, outputs, startedAt, readyAt };
      for (const [item, quantity] of Object.entries(inputs)) ctx.call('inventory', 'remove', { container: config(ctx).container, item, quantity });
      ctx.write({ job } as unknown as JsonValue); ctx.emit('crafting.started', job as unknown as JsonObject);
      return status(ctx);
    } },
    collect: { schema: emptySchema, execute(ctx) {
      const { job } = ctx.state<State>();
      if (!job) return ctx.fail('NO_CRAFTING_JOB', '没有可领取的订单');
      checkLocation(ctx);
      if (readSimulationTime(ctx, job.startedAt) < job.readyAt) return ctx.fail('CRAFTING_NOT_READY', '订单尚未完成');
      for (const [item, quantity] of Object.entries(job.outputs)) ctx.call('inventory', 'add', { container: config(ctx).container, item, quantity });
      const result = { recipe: job.recipe, batches: job.batches, outputs: job.outputs };
      ctx.write({ job: null }); ctx.emit('crafting.collected', result); return result;
    } },
    cancel: { schema: emptySchema, execute(ctx) {
      const { job } = ctx.state<State>();
      if (!job) return ctx.fail('NO_CRAFTING_JOB', '没有可取消的订单');
      readSimulationTime(ctx, job.startedAt);
      for (const [item, quantity] of Object.entries(job.inputs)) ctx.call('inventory', 'add', { container: config(ctx).container, item, quantity });
      const result = { recipe: job.recipe, batches: job.batches, refunded: job.inputs };
      ctx.write({ job: null }); ctx.emit('crafting.cancelled', result); return result;
    } }
  },
  queries: { status: { schema: emptySchema, execute: status } }
};
