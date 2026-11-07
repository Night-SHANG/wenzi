import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own } from './capacity.ts';
import { boundActionCommand } from '../presentation/actions.ts';
import { readCalendar } from './calendar.ts';
import { readAvailability } from './availability.ts';
import { readWalletBalance } from './wallet.ts';
import { readSimulationTime } from './simulation-time.ts';
import { countsText, viewCount, viewCounts, viewFlag, viewId, viewIds, viewNumber, viewObject, viewRows, viewText } from './text-view-data.ts';

const requirement = { version: '^1.0.0' };
const reasons: Record<string, string> = { CLOSED: '闭店', WRONG_LOCATION: '地点不符', INSUFFICIENT_STOCK: '库存不足', INSUFFICIENT_FUNDS: '付款方资金不足' };
const phases: Record<string, string> = { available: '可接取', locked: '前置未完成', active: '进行中', ready: '可交付', completed: '已完成' };

function tradeLine(ctx: ReadContext, shop: JsonObject, offer: JsonObject, side: 'buy' | 'sell', open: boolean, location: string): string[] {
  if (offer[side] === null) return [];
  const quote = viewObject(ctx, offer[side], '交易报价');
  const total = viewCount(ctx, quote.total, '报价总额', true), available = viewFlag(ctx, quote.available);
  if (quote.shop !== shop.shop || quote.item !== offer.item || quote.side !== side || quote.quantity !== 1
    || quote.stock !== offer.stock || quote.owned !== offer.owned || quote.customerCoins !== shop.customerCoins
    || quote.merchantCoins !== shop.merchantCoins || quote.open !== open) ctx.fail('INVALID_VIEW_DATA', '报价回显与当前商店不一致');
  const expected: string[] = [];
  if (!open) expected.push('CLOSED');
  if (shop.location !== null && shop.location !== location) expected.push('WRONG_LOCATION');
  if ((side === 'buy' ? offer.stock : offer.owned) === 0) expected.push('INSUFFICIENT_STOCK');
  if ((side === 'buy' ? shop.customerCoins as number : shop.merchantCoins as number) < total) expected.push('INSUFFICIENT_FUNDS');
  const refusals = viewIds(ctx, quote.reasons);
  if (available !== (refusals.length === 0) || refusals.join('|') !== expected.join('|')) ctx.fail('INVALID_VIEW_DATA', '报价可用性和拒绝原因不一致');
  const verb = side === 'buy' ? '买入' : '卖出', lines = [`${verb} ${offer.item} × 1：${total} 币${available ? '' : `；${refusals.map(reason => own(reasons, reason)).join('、')}`}`];
  if (available) lines.push(`${verb}操作：${boundActionCommand(ctx, 'commerce', side, { item: offer.item!, quantity: 1 })}`);
  return lines;
}

/** Text composition only. Wallet, inventory, production, time and orders retain their own state. */
export const settlementViewModule: ModuleDefinition = {
  manifest: { id: 'view.settlement.text', title: '城镇经营文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' }, requires: {
      inventory: requirement, wallet: requirement, time: requirement, calendar: requirement,
      planting: requirement, commerce: requirement, quests: requirement, location: requirement,
    } },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 }, container: idSchema, account: idSchema, plot: idSchema, crop: idSchema }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: { render: { schema: emptySchema, execute(ctx) {
    const container = ctx.config.container as string, account = ctx.config.account as string;
    const current = viewObject(ctx, ctx.query('location', 'current'), '当前位置');
    const location = viewId(ctx, current.id), name = viewText(ctx, current.name, '地点名称');
    const lines = [`地点：${name}（${location}）`, viewText(ctx, current.description, '地点说明', true)];
    for (const exit of viewRows(ctx, current.exits, '地点出口')) {
      lines.push(`前往${viewText(ctx, exit.name, '出口名称')}：${boundActionCommand(ctx, 'location', 'move', { to: exit.id! })}`);
    }
    const calendar = readCalendar(ctx, ctx.query('calendar', 'now'));
    if (calendar.elapsedSeconds !== readSimulationTime(ctx)) ctx.fail('INVALID_VIEW_DATA', '视图日历与绑定时钟不一致');
    lines.push(`时间：累计 ${calendar.elapsedSeconds} 秒；第 ${BigInt(calendar.dayIndex) + 1n} 天，周内第 ${BigInt(calendar.dayOfWeek) + 1n}/${calendar.daysPerWeek} 天；日内 ${calendar.secondOfDay}/${calendar.secondsPerDay} 秒`);
    const balance = readWalletBalance(ctx, ctx.query('wallet', 'balance', { account }), account);
    lines.push(`你的账户：${balance.coins} 币`);
    const inventory = viewObject(ctx, ctx.query('inventory', 'list', { container }), '库存');
    const held = new Map<string, number>();
    for (const item of viewRows(ctx, inventory.items, '库存物品')) {
      const id = viewId(ctx, item.id), quantity = viewCount(ctx, item.quantity, '库存数量', true);
      held.set(id, quantity);
      lines.push(`背包：${viewText(ctx, item.name, '物品名称')}（${id}）× ${quantity}`);
    }
    if (!held.size) lines.push('背包：空');
    const shop = viewObject(ctx, ctx.query('commerce', 'status'), '商店');
    viewId(ctx, shop.shop); viewId(ctx, shop.container); viewId(ctx, shop.account);
    if (shop.location !== null) viewId(ctx, shop.location);
    const customerCoins = viewCount(ctx, shop.customerCoins, '玩家余额'), merchantCoins = viewCount(ctx, shop.merchantCoins, '商店余额');
    const trades = viewCount(ctx, shop.trades, '成交次数');
    if (shop.customerContainer !== container || shop.customerAccount !== account || customerCoins !== balance.coins) ctx.fail('INVALID_VIEW_DATA', '视图库存账户与商店顾客不一致');
    const hours = readAvailability(ctx, shop.availability!);
    const schedule = hours.open ? `营业中${hours.closesInSeconds === null ? '，持续开放' : `，${hours.closesInSeconds} 秒后闭店`}` : `闭店，${hours.opensInSeconds} 秒后开门`;
    lines.push(`${viewText(ctx, shop.name, '商店名称')}：${merchantCoins} 币；${schedule}；已成交 ${trades} 次`);
    for (const offer of viewRows(ctx, shop.offers, '商品目录', 'item')) {
      const item = viewId(ctx, offer.item), stock = viewCount(ctx, offer.stock, '商店库存'), owned = viewCount(ctx, offer.owned, '玩家库存');
      if (owned !== (held.get(item) ?? 0) || (offer.buy === null && offer.sell === null)) ctx.fail('INVALID_VIEW_DATA', '商品库存或交易方向与公开数据不一致');
      lines.push(`商品 ${item}：商店 ${stock}，背包 ${owned}`);
      lines.push(...tradeLine(ctx, shop, offer, 'buy', hours.open, location), ...tradeLine(ctx, shop, offer, 'sell', hours.open, location));
    }
    const planting = viewObject(ctx, ctx.query('planting', 'plots'), '种植箱');
    const plots = viewRows(ctx, planting.plots, '种植箱地块');
    for (const plot of plots) {
      viewId(ctx, plot.crop);
      const progress = viewNumber(ctx, plot.progress, '生长进度');
      if (progress > 1) ctx.fail('INVALID_VIEW_DATA', '生长进度不能超过1');
      lines.push(`地块 ${plot.id}：${viewText(ctx, plot.name, '作物名称')}，${Math.floor(progress * 100)}%`);
      if (progress === 1) lines.push(`收获：${boundActionCommand(ctx, 'planting', 'harvest', { plot: plot.id! })}`);
    }
    if (!plots.some(plot => plot.id === ctx.config.plot)) lines.push(`种植一份（需要种子）：${boundActionCommand(ctx, 'planting', 'plant', { plot: ctx.config.plot!, crop: ctx.config.crop! })}`);
    const journal = viewObject(ctx, ctx.query('quests', 'list'), '任务');
    for (const quest of viewRows(ctx, journal.quests, '任务列表')) {
      const phase = viewText(ctx, quest.status, '任务状态'), ready = viewFlag(ctx, quest.ready);
      if (!own(phases, phase) || ready !== (phase === 'ready')) ctx.fail('INVALID_VIEW_DATA', '任务状态与可交付标记不一致');
      const delivery = viewCounts(ctx, quest.remainingDelivery), victories = viewCounts(ctx, quest.remainingVictories);
      const rewards = viewCounts(ctx, quest.rewards, true), experience = viewCount(ctx, quest.experience, '任务经验');
      const completed = viewCount(ctx, quest.completed, '已完成次数'), locations = viewIds(ctx, quest.locations);
      const here = !locations.length || locations.includes(location);
      if (ready && (!here || Object.values(delivery).some(n => n > 0) || Object.values(victories).some(n => n > 0))) ctx.fail('INVALID_VIEW_DATA', '尚未满足的任务不能交付');
      lines.push(`订单 ${viewText(ctx, quest.name, '订单名称')}（${quest.id}）：${own(phases, phase)}；已完成 ${completed} 次`);
      const description = viewText(ctx, quest.description, '订单说明', true);
      if (description) lines.push(description);
      lines.push(`尚需交付 ${countsText(delivery)}；尚需胜利 ${countsText(victories)}；奖励 ${countsText(rewards)}${experience ? `，经验 ${experience}` : ''}；地点 ${locations.join('、') || '任意地点'}`);
      if (phase === 'available' && here) lines.push(`接单：${boundActionCommand(ctx, 'quests', 'accept', { quest: quest.id! })}`);
      if (ready) lines.push(`交付：${boundActionCommand(ctx, 'quests', 'turnIn', { quest: quest.id! })}`);
      if (phase === 'active' || ready) lines.push(`放弃订单：${boundActionCommand(ctx, 'quests', 'abandon', { quest: quest.id! })}`);
    }
    lines.push('交易按成交时的钱货和规则结算，背包容量在实际交货时检查。', '时间推进：使用 actions 查看当前时钟的 advance 参数。');
    return { title: ctx.config.title!, lines };
  } } },
};
