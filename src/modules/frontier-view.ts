import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, safeCount, safeNumber } from './capacity.ts';
import { readSimulationTime } from './simulation-time.ts';

function object(ctx: ReadContext, value: JsonValue, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) ctx.fail('INVALID_VIEW_DATA', `${label}没有返回有效对象`);
  return value as JsonObject;
}
function rows(ctx: ReadContext, value: JsonValue, key: string): JsonObject[] {
  const items = object(ctx, value, key)[key];
  if (!Array.isArray(items)) ctx.fail('INVALID_VIEW_DATA', `${key}没有返回有效列表`);
  return (items as JsonValue[]).map(item => object(ctx, item, key));
}
function label(ctx: ReadContext, row: JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') ctx.fail('INVALID_VIEW_DATA', `${key}必须为文字`);
  return value as string;
}
function counts(ctx: ReadContext, value: JsonValue): string {
  return Object.entries(object(ctx, value, '物品数量')).map(([item, quantity]) => {
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity <= 0) ctx.fail('INVALID_VIEW_DATA', '物品数量必须为正安全整数');
    return `${item} × ${quantity}`;
  }).join('，');
}
function quantity(ctx: ReadContext, value: JsonValue | undefined, name: string): number {
  const count = safeCount(ctx, value as number, name);
  if (!count) ctx.fail('INVALID_VIEW_DATA', `${name}必须大于零`);
  return count;
}
const requirement = { version: '^1.0.0' };

/** A read-only presentation module. Gameplay is independent of this view. */
export const frontierViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.frontier.text', title: '边境工坊文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' },
    requires: { location: requirement, gathering: requirement, crafting: requirement, recipes: requirement, inventory: requirement, market: requirement, time: requirement },
  },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 }, container: idSchema }),
  stateSchema: emptySchema,
  initialState: () => ({}),
  validate(ctx) { ctx.query('inventory', 'list', { container: ctx.config.container! }); },
  queries: {
    render: { schema: emptySchema, execute(ctx) {
      const location = object(ctx, ctx.query('location', 'current'), '地点');
      const locationId = label(ctx, location, 'id');
      const exits = rows(ctx, location, 'exits');
      const inventory = rows(ctx, ctx.query('inventory', 'list', { container: ctx.config.container! }), 'items');
      const sites = rows(ctx, ctx.query('gathering', 'sites'), 'sites').filter(site => site.location === locationId);
      const recipes = rows(ctx, ctx.query('recipes', 'list'), 'recipes');
      const status = object(ctx, ctx.query('crafting', 'status'), '工坊');
      const market = object(ctx, ctx.query('market', 'balance'), '市场');
      const elapsedSeconds = readSimulationTime(ctx);
      const coins = safeNumber(ctx, market.coins as number, '金币');
      if (typeof status.ready !== 'boolean') ctx.fail('INVALID_VIEW_DATA', '订单就绪状态必须为布尔值');
      const remainingSeconds = safeNumber(ctx, status.remainingSeconds as number, '订单剩余秒数');
      const lines = [
        `地点：${label(ctx, location, 'name')}（${locationId}）`, label(ctx, location, 'description'),
        `模拟时间：${elapsedSeconds} 秒；金币：${coins}`,
        `背包：${inventory.length ? inventory.map(item => `${label(ctx, item, 'name')} × ${safeCount(ctx, item.quantity as number, '库存数量')}`).join('，') : '空'}`,
        ...exits.map(exit => `前往 ${label(ctx, exit, 'name')}：do ${ctx.provider('location')} move ${JSON.stringify({ to: label(ctx, exit, 'id') })}`),
        ...(exits.length ? [] : ['道路：此处没有出口']),
        ...sites.map(site => {
          if (typeof site.available !== 'boolean') ctx.fail('INVALID_VIEW_DATA', '采集就绪状态必须为布尔值');
          const remaining = safeNumber(ctx, site.remainingSeconds as number, '采集剩余秒数');
          return `采集 ${label(ctx, site, 'name')}：${label(ctx, site, 'item')} × ${quantity(ctx, site.quantity, '采集数量')}；${site.available ? '可以采集' : `恢复还需 ${remaining} 秒`}；do ${ctx.provider('gathering')} gather ${JSON.stringify({ site: label(ctx, site, 'id') })}`;
        }),
        ...(sites.length ? [] : ['采集：此处没有采集点']),
      ];
      if (status.job === null) lines.push('工坊：空闲。请在允许的制作地点开工。');
      else {
        const job = object(ctx, status.job!, '制作订单');
        lines.push(`工坊：${label(ctx, job, 'name')} × ${quantity(ctx, job.batches, '制作批次')}；${status.ready ? '已完成，可在制作地点领取' : `还需 ${remainingSeconds} 秒`}`);
        lines.push(`领取：do ${ctx.provider('crafting')} collect {}`);
        lines.push(`取消并退还材料：do ${ctx.provider('crafting')} cancel {}`);
      }
      for (const recipe of recipes) {
        const duration = safeNumber(ctx, recipe.durationSeconds as number, '制作秒数');
        if (!duration) ctx.fail('INVALID_VIEW_DATA', '制作秒数必须大于零');
        lines.push(`配方：${label(ctx, recipe, 'name')}；材料 ${counts(ctx, recipe.inputs!)}；产物 ${counts(ctx, recipe.outputs!)}；${duration} 秒`);
        lines.push(`开工：do ${ctx.provider('crafting')} start ${JSON.stringify({ recipe: label(ctx, recipe, 'id') })}`);
      }
      lines.push('输入 actions 查看所有动作及参数；通过时钟 advance 推进模拟时间。');
      lines.push('输入 save 文件名 保存；输入 load 文件名 恢复；输入 exit 退出。');
      return { title: ctx.config.title!, lines };
    } },
  },
};
