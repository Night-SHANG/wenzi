import type { JsonObject, ModuleDefinition } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema } from './capacity.ts';
export const farmViewModule: ModuleDefinition = {
  manifest: { id: 'view.farm.text', title: '农场文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'text-view': '1.0.0' }, requires: { inventory: { version: '^1.0.0' }, time: { version: '^1.0.0' }, planting: { version: '^1.0.0' }, market: { version: '^1.0.0' } } },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 }, container: idSchema }), stateSchema: emptySchema, initialState: () => ({}),
  validate(ctx) { ctx.query('inventory', 'list', { container: ctx.config.container! }); },
  queries: { render: { schema: emptySchema, execute(ctx) {
    const time = ctx.query('time', 'now') as JsonObject, inventory = ctx.query('inventory', 'list', { container: ctx.config.container! }) as JsonObject, market = ctx.query('market', 'balance') as JsonObject, planting = ctx.query('planting', 'plots') as JsonObject;
    const items = inventory.items as JsonObject[], plots = planting.plots as JsonObject[];
    return { title: ctx.config.title!, lines: [
      `模拟时间：${time.elapsedSeconds} 秒`, `金币：${market.coins}`,
      `库存：${items.length ? items.map(item => `${item.name} × ${item.quantity}`).join('，') : '空'}`,
      ...plots.map(plot => `地块 ${plot.id}：${plot.name}，${Math.floor((plot.progress as number) * 100)}%${(plot.progress as number) >= 1 ? '（可收获）' : ''}`),
      ...(plots.length ? [] : ['地块：尚未种植'])
    ] };
  } } }
};
