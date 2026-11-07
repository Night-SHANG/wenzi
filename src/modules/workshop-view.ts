import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, objectSchema } from './capacity.ts';
import { boundActionCommand } from '../presentation/actions.ts';
import { countsText, viewCount, viewCounts, viewFlag, viewId, viewNumber, viewObject, viewRows, viewText } from './text-view-data.ts';

const requirement = { version: '^1.0.0' };
/** One wrapper per workshop; chaining instances composes any number of independent workshops. */
export const workshopViewModule: ModuleDefinition = {
  manifest: { id: 'view.workshop.text', title: '工坊文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' }, requires: { 'text-view': requirement, crafting: requirement, recipes: requirement } },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 } }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: { render: { schema: emptySchema, execute(ctx) {
    const base = viewObject(ctx, ctx.query('text-view', 'render'), '基础视图');
    const title = viewText(ctx, base.title, '基础标题');
    if (!Array.isArray(base.lines)) return ctx.fail('INVALID_VIEW_DATA', '基础视图缺少文字行');
    const lines = base.lines.map(line => viewText(ctx, line, '基础文字行', true));
    lines.push('', `工坊：${ctx.config.title}`);
    const result = viewObject(ctx, ctx.query('crafting', 'status'), '制作状态');
    const ready = viewFlag(ctx, result.ready), remaining = viewNumber(ctx, result.remainingSeconds, '剩余制作秒数');
    if (result.job === null) {
      if (ready || remaining !== 0) ctx.fail('INVALID_VIEW_DATA', '空闲工坊不能有完成标记或剩余时间');
      lines.push('当前没有制作订单。');
    } else {
      const job = viewObject(ctx, result.job, '制作订单');
      viewId(ctx, job.recipe);
      const name = viewText(ctx, job.name, '订单名称'), batches = viewCount(ctx, job.batches, '批次数', true);
      const inputs = viewCounts(ctx, job.inputs, true, true), outputs = viewCounts(ctx, job.outputs, true, true);
      const startedAt = viewNumber(ctx, job.startedAt, '开始时间'), readyAt = viewNumber(ctx, job.readyAt, '完成时间');
      if (readyAt <= startedAt || ready !== (remaining === 0) || remaining > readyAt - startedAt) ctx.fail('INVALID_VIEW_DATA', '制作订单时间与完成状态不一致');
      lines.push(`${name} × ${batches} 批：${ready ? '已完成，等待领取' : `还需 ${remaining} 秒`}；已投入 ${countsText(inputs)}；产出 ${countsText(outputs)}`);
      if (ready) lines.push(`领取产物：${boundActionCommand(ctx, 'crafting', 'collect')}`);
      lines.push(`取消并退回投入：${boundActionCommand(ctx, 'crafting', 'cancel')}`);
    }
    const catalog = viewObject(ctx, ctx.query('recipes', 'list'), '配方目录');
    for (const recipe of viewRows(ctx, catalog.recipes, '配方目录')) {
      const id = viewId(ctx, recipe.id), name = viewText(ctx, recipe.name, '配方名称');
      const inputs = viewCounts(ctx, recipe.inputs, true, true), outputs = viewCounts(ctx, recipe.outputs, true, true);
      const seconds = viewNumber(ctx, recipe.durationSeconds, '制作秒数', true);
      lines.push(`配方 ${name}（${id}）：${countsText(inputs)} → ${countsText(outputs)}；每批 ${seconds} 秒`);
      if (result.job === null) lines.push(`制作一批：${boundActionCommand(ctx, 'crafting', 'start', { recipe: id, batches: 1 })}`);
    }
    lines.push('开始和领取需满足工坊地点、材料及容量条件；取消退料也需要足够容量。');
    return { title, lines };
  } } },
};
