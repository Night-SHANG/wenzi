import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { capacityModules, emptySchema, idSchema, MAX_NUMBER, numberSchema, objectSchema, own, positiveCountSchema, recordSchema, safeNumber } from './capacity.ts';
import { inventoryModule } from './inventory.ts';
import { timeModules } from './time.ts';
import { growthModules } from './growth.ts';
import { marketModule } from './market.ts';
import { farmViewModule } from './farm-view.ts';

interface Crop { name: string; seedItem: string; harvestItem: string; durationSeconds: number; yield: number }
interface Config { container: string; crops: Record<string, Crop> }
interface Plot { crop: string; progress: number; elapsedSeconds: number }
interface State { plots: Record<string, Plot>; elapsedSeconds: number; lastEventElapsedSeconds: number }
function initialState(): State { return { plots: {}, elapsedSeconds: 0, lastEventElapsedSeconds: 0 }; }
function crop(ctx: ReadContext, id: string): Crop {
  const c = own((ctx.config as unknown as Config).crops, id);
  if (!c) return ctx.fail('UNKNOWN_CROP', `未知作物：${id}`);
  return c;
}
function clockNow(ctx: ReadContext, state: State): number {
  const result = ctx.query('time', 'now');
  if (typeof result !== 'object' || result === null || Array.isArray(result) || typeof result.elapsedSeconds !== 'number') {
    return ctx.fail('INVALID_CLOCK', '绑定时钟没有返回有效的累计秒数');
  }
  const now = safeNumber(ctx, result.elapsedSeconds, '绑定时钟累计秒数');
  if (now < state.elapsedSeconds) return ctx.fail('CLOCK_BACKWARD', '绑定时钟不能回退到已同步时间之前');
  return now;
}
/** Advance detached owned state to authoritative time, never from queued event deltas. */
function synchronize(ctx: ReadContext, state: State, now = clockNow(ctx, state)): void {
  for (const plot of Object.values(state.plots)) {
    if (plot.elapsedSeconds > now) ctx.fail('CLOCK_BACKWARD', '绑定时钟早于地块的时钟基线');
    const deltaSeconds = now - plot.elapsedSeconds;
    if (deltaSeconds > 0) {
      const result = ctx.query('growth-rule', 'progress', { deltaSeconds, durationSeconds: crop(ctx, plot.crop).durationSeconds });
      if (typeof result !== 'object' || result === null || Array.isArray(result) || typeof result.amount !== 'number') {
        return ctx.fail('INVALID_GROWTH', '生长规则没有返回数值');
      }
      const amount = safeNumber(ctx, result.amount, '生长增量');
      plot.progress = Math.min(1, plot.progress + amount);
      plot.elapsedSeconds = now;
    }
  }
  state.elapsedSeconds = now;
}
export const plantingModule: ModuleDefinition = {
  manifest: { id: 'planting.basic', title: '基本种植', version: '1.0.0', apiVersion: 1, stateVersion: 2, provides: { planting: '1.0.0' }, requires: { inventory: { version: '^1.0.0' }, time: { version: '^1.0.0' }, 'growth-rule': { version: '^1.0.0' } } },
  configSchema: objectSchema({ container: idSchema, crops: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, seedItem: idSchema, harvestItem: idSchema, durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER }, yield: positiveCountSchema })) }),
  stateSchema: objectSchema({
    plots: recordSchema(objectSchema({ crop: idSchema, progress: { ...numberSchema, maximum: 1 }, elapsedSeconds: numberSchema })),
    elapsedSeconds: numberSchema,
    lastEventElapsedSeconds: numberSchema
  }),
  initialState: () => initialState() as unknown as JsonValue,
  validate(ctx) {
    const config = ctx.config as unknown as Config, state = ctx.state<State>();
    const now = clockNow(ctx, state);
    if (state.lastEventElapsedSeconds > state.elapsedSeconds) ctx.fail('INVALID_TIME_STATE', '事件游标超过已同步时间');
    ctx.query('inventory', 'list', { container: config.container });
    for (const c of Object.values(config.crops)) for (const item of [c.seedItem, c.harvestItem]) ctx.query('inventory', 'count', { container: config.container, item });
    for (const plot of Object.values(state.plots)) {
      crop(ctx, plot.crop);
      if (plot.elapsedSeconds > state.elapsedSeconds || plot.elapsedSeconds > now) ctx.fail('INVALID_TIME_STATE', '地块时钟基线超过已同步时间');
    }
  },
  commands: {
    plant: { schema: objectSchema({ plot: idSchema, crop: idSchema }), execute(ctx, input) {
      const plot = input.plot as string, cropId = input.crop as string, c = crop(ctx, cropId), state = ctx.state<State>();
      if (own(state.plots, plot)) ctx.fail('PLOT_OCCUPIED', `地块已种植：${plot}`);
      synchronize(ctx, state);
      ctx.call('inventory', 'remove', { container: ctx.config.container!, item: c.seedItem, quantity: 1 });
      Object.defineProperty(state.plots, plot, { value: { crop: cropId, progress: 0, elapsedSeconds: state.elapsedSeconds }, enumerable: true, writable: true, configurable: true });
      ctx.write(state as unknown as JsonValue);
      return { plot, crop: cropId, progress: 0 };
    } },
    harvest: { schema: objectSchema({ plot: idSchema }), execute(ctx, input) {
      const plotId = input.plot as string, state = ctx.state<State>(), plot = own(state.plots, plotId);
      if (!plot) return ctx.fail('UNKNOWN_PLOT', `未知地块：${plotId}`);
      synchronize(ctx, state);
      if (plot.progress < 1) ctx.fail('CROP_NOT_READY', '作物尚未成熟');
      const c = crop(ctx, plot.crop);
      ctx.call('inventory', 'add', { container: ctx.config.container!, item: c.harvestItem, quantity: c.yield });
      delete state.plots[plotId]; ctx.write(state as unknown as JsonValue);
      return { plot: plotId, item: c.harvestItem, quantity: c.yield };
    } }
  },
  queries: { plots: { schema: emptySchema, execute(ctx) {
    return { plots: Object.entries(ctx.state<State>().plots).map(([id, plot]) => ({ id, crop: plot.crop, name: crop(ctx, plot.crop).name, progress: plot.progress })) };
  } } },
  events: { 'time.advanced'(ctx, event) {
    if (event.source !== ctx.provider('time')) return;
    const state = ctx.state<State>(), now = clockNow(ctx, state);
    const elapsed = event.payload.elapsedSeconds, delta = event.payload.deltaSeconds;
    if (typeof elapsed !== 'number' || typeof delta !== 'number') return ctx.fail('INVALID_TIME_EVENT', '时间事件缺少有效秒数');
    safeNumber(ctx, elapsed, '事件时间'); safeNumber(ctx, delta, '事件间隔');
    if (delta <= 0 || elapsed < delta || elapsed > now || elapsed <= state.lastEventElapsedSeconds) {
      return ctx.fail('INVALID_TIME_EVENT', '时间事件与绑定时钟或事件顺序不一致');
    }
    // Earlier queued events may precede the most recent plant/harvest synchronization.
    // Their cursor still advances, but plot baselines prevent applying elapsed time twice.
    synchronize(ctx, state, now);
    state.lastEventElapsedSeconds = elapsed;
    ctx.write(state as unknown as JsonValue);
  } },
  migrate(previous) {
    if (previous.moduleId !== 'planting.basic' || previous.version !== '1.0.0' || previous.stateVersion !== 1) throw new Error('不兼容的种植状态');
    const state = previous.state;
    if (typeof state !== 'object' || state === null || Array.isArray(state) || Object.keys(state).length !== 1 || !Object.hasOwn(state, 'plots') || typeof state.plots !== 'object' || state.plots === null || Array.isArray(state.plots)) throw new Error('旧版种植状态无效');
    if (Object.keys(state.plots).length) throw new Error('旧版已种植地块缺少时钟基线，无法推断历史；请使用旧版完成收获后保存，或建立新世界');
    return initialState() as unknown as JsonValue;
  }
};
export const farmModules: ModuleDefinition[] = [...capacityModules, inventoryModule, ...timeModules, ...growthModules, plantingModule, marketModule, farmViewModule];
