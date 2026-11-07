import type { ExecutionContext, JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, positiveCountSchema, safeCount } from './capacity.ts';
import { readWalletBalance } from './wallet.ts';
import { readShop } from './shop-rules.ts';
import type { ShopDefinition } from './shop-rules.ts';
import { readAvailability } from './availability.ts';
import type { AvailabilityStatus } from './availability.ts';

type Side = 'buy' | 'sell';
interface Config { shop: string; customerContainer: string; customerAccount: string }
interface State { trades: number }
interface Quote extends JsonObject {
  shop: string; item: string; side: Side; quantity: number; total: number; stock: number; owned: number;
  customerCoins: number; merchantCoins: number; open: boolean; available: boolean; reasons: string[];
}
interface Current {
  shop: ShopDefinition; availability: AvailabilityStatus; correctLocation: boolean;
  customerCoins: number; merchantCoins: number; counts: Map<string, { stock: number; owned: number }>;
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && [...value].length <= 128; }
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function count(ctx: ReadContext, container: string, item: string): number {
  const value = ctx.query('inventory', 'count', { container, item });
  if (!object(value) || typeof value.quantity !== 'number') return ctx.fail('INVALID_INVENTORY', '库存提供者没有返回物品数量');
  return safeCount(ctx, value.quantity, '物品数量');
}
function coins(ctx: ReadContext, account: string): number { return readWalletBalance(ctx, ctx.query('wallet', 'balance', { account }), account).coins; }
function sameShop(a: ShopDefinition, b: ShopDefinition): boolean {
  return a.id === b.id && a.name === b.name && a.location === b.location && a.container === b.container && a.account === b.account
    && Object.keys(a.offers).length === Object.keys(b.offers).length
    && Object.entries(a.offers).every(([item, offer]) => {
      const other = own(b.offers, item);
      return other !== undefined && offer.buy === other.buy && offer.sell === other.sell && offer.targetStock === other.targetStock;
    });
}
function currentShop(ctx: ReadContext): ShopDefinition {
  const listed = ctx.query('shop-rule', 'list');
  if (!object(listed) || !Array.isArray(listed.shops)) return ctx.fail('INVALID_SHOP', '商店提供者没有返回商店目录');
  const ids = new Set<string>(); let current: ShopDefinition | undefined;
  for (const row of listed.shops) {
    const shop = readShop(ctx, row);
    if (ids.has(shop.id)) return ctx.fail('INVALID_SHOP', `重复商店：${shop.id}`);
    ids.add(shop.id);
    const fetched = readShop(ctx, ctx.query('shop-rule', 'get', { shop: shop.id }), shop.id);
    if (!sameShop(shop, fetched)) return ctx.fail('INVALID_SHOP', `商店目录与详情不一致：${shop.id}`);
    if (shop.id === config(ctx).shop) current = fetched;
  }
  if (!current) return ctx.fail('UNKNOWN_SHOP', `当前商店不在目录中：${config(ctx).shop}`);
  return current;
}
function readCurrent(ctx: ReadContext): Current {
  const cfg = config(ctx), shop = currentShop(ctx);
  if (shop.container === cfg.customerContainer || shop.account === cfg.customerAccount) return ctx.fail('INVALID_TRADE', '买卖双方必须使用不同容器和账户');
  for (const container of [shop.container, cfg.customerContainer]) {
    const listed = ctx.query('inventory', 'list', { container });
    if (!object(listed) || !Array.isArray(listed.items)) return ctx.fail('INVALID_INVENTORY', '库存提供者没有返回容器物品列表');
  }
  const counts = new Map<string, { stock: number; owned: number }>();
  for (const item of Object.keys(shop.offers)) counts.set(item, { stock: count(ctx, shop.container, item), owned: count(ctx, cfg.customerContainer, item) });
  const customerCoins = coins(ctx, cfg.customerAccount), merchantCoins = coins(ctx, shop.account);
  let correctLocation = true;
  if (shop.location !== null) {
    if (!ctx.has('location')) return ctx.fail('MISSING_LOCATION', '限定地点的商店必须绑定地点能力');
    const described = ctx.query('location', 'describe', { location: shop.location });
    if (!object(described) || described.id !== shop.location) return ctx.fail('INVALID_LOCATION', '商店地点与地点提供者不一致');
    const current = ctx.query('location', 'current');
    if (!object(current) || !id(current.id)) return ctx.fail('INVALID_LOCATION', '地点提供者没有返回当前位置');
    correctLocation = current.id === shop.location;
  }
  return { shop, counts, customerCoins, merchantCoins, correctLocation, availability: readAvailability(ctx, ctx.query('availability', 'status')) };
}
function quoteCurrent(ctx: ReadContext, current: Current, side: Side, item: string, quantity: number): Quote {
  const { shop, customerCoins, merchantCoins, availability, correctLocation } = current;
  const offer = own(shop.offers, item), counts = current.counts.get(item);
  if (!offer || !counts) return ctx.fail('UNKNOWN_OFFER', `商店没有此商品：${item}`);
  if (offer[side] === null) return ctx.fail('UNSUPPORTED_TRADE', `商品不支持此方向：${side}`);
  const { stock, owned } = counts;
  const priced = ctx.query('trade-price', 'quote', { item, side, quantity, stock, offer });
  if (!object(priced) || priced.item !== item || priced.side !== side || priced.quantity !== quantity
    || typeof priced.total !== 'number' || !Number.isSafeInteger(priced.total) || priced.total <= 0) return ctx.fail('INVALID_PRICE', '价格提供者返回了无效身份、数量或总价');
  const total = priced.total, reasons: string[] = [];
  if (!availability.open) reasons.push('CLOSED');
  if (!correctLocation) reasons.push('WRONG_LOCATION');
  if ((side === 'buy' ? stock : owned) < quantity) reasons.push('INSUFFICIENT_STOCK');
  if ((side === 'buy' ? customerCoins : merchantCoins) < total) reasons.push('INSUFFICIENT_FUNDS');
  return { shop: shop.id, item, side, quantity, total, stock, owned, customerCoins, merchantCoins, open: availability.open, available: reasons.length === 0, reasons };
}
function status(ctx: ReadContext): JsonObject {
  const current = readCurrent(ctx), { shop, customerCoins, merchantCoins, availability } = current, cfg = config(ctx);
  return { shop: shop.id, name: shop.name, location: shop.location, container: shop.container, account: shop.account,
    customerContainer: cfg.customerContainer, customerAccount: cfg.customerAccount, trades: ctx.state<State>().trades,
    customerCoins, merchantCoins, availability,
    offers: Object.entries(shop.offers).map(([item, offer]) => ({ item, ...current.counts.get(item)!,
      buy: offer.buy === null ? null : quoteCurrent(ctx, current, 'buy', item, 1),
      sell: offer.sell === null ? null : quoteCurrent(ctx, current, 'sell', item, 1) })) };
}
function exactCount(ctx: ReadContext, value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) return ctx.fail('TRADE_OVERFLOW', `${label}超出安全整数范围`);
  return Number(value);
}
function trade(ctx: ExecutionContext, side: Side, item: string, quantity: number): JsonObject {
  const current = readCurrent(ctx), quoted = quoteCurrent(ctx, current, side, item, quantity), cfg = config(ctx), shop = current.shop;
  if (!quoted.available) return ctx.fail('TRADE_UNAVAILABLE', quoted.reasons.join(', '));
  const trades = exactCount(ctx, BigInt(ctx.state<State>().trades) + 1n, '交易次数');
  const delta = side === 'buy' ? 1n : -1n;
  const customerCoins = exactCount(ctx, BigInt(quoted.customerCoins) - delta * BigInt(quoted.total), '顾客余额');
  const merchantCoins = exactCount(ctx, BigInt(quoted.merchantCoins) + delta * BigInt(quoted.total), '商人余额');
  const stock = exactCount(ctx, BigInt(quoted.stock) - delta * BigInt(quantity), '商店库存');
  const owned = exactCount(ctx, BigInt(quoted.owned) + delta * BigInt(quantity), '顾客物品');
  const from = side === 'buy' ? cfg.customerAccount : shop.account, to = side === 'buy' ? shop.account : cfg.customerAccount;
  const paid = ctx.call('wallet', 'transfer', { from, to, amount: quoted.total });
  if (!object(paid) || paid.transferred !== quoted.total) return ctx.fail('INVALID_WALLET_TRANSFER', '账户提供者转账返回不一致');
  const fromCoins = readWalletBalance(ctx, paid.from, from).coins, toCoins = readWalletBalance(ctx, paid.to, to).coins;
  if (fromCoins !== (side === 'buy' ? customerCoins : merchantCoins) || toCoins !== (side === 'buy' ? merchantCoins : customerCoins)
    || coins(ctx, cfg.customerAccount) !== customerCoins || coins(ctx, shop.account) !== merchantCoins) return ctx.fail('INVALID_WALLET_TRANSFER', '账户实际余额与转账结果不一致');
  const delivered = ctx.call('inventory', 'transfer', { from: side === 'buy' ? shop.container : cfg.customerContainer, to: side === 'buy' ? cfg.customerContainer : shop.container, item, quantity });
  if (!object(delivered) || delivered.transferred !== quantity
    || count(ctx, shop.container, item) !== stock || count(ctx, cfg.customerContainer, item) !== owned) return ctx.fail('INVALID_INVENTORY_TRANSFER', '库存实际数量与交货结果不一致');
  if (coins(ctx, cfg.customerAccount) !== customerCoins || coins(ctx, shop.account) !== merchantCoins) return ctx.fail('INVALID_WALLET_TRANSFER', '交货后双方余额不一致');
  ctx.write({ trades });
  const transaction = { shop: shop.id, item, side, quantity, total: quoted.total };
  ctx.emit('commerce.traded', transaction);
  return { ...transaction, stock, owned, customerCoins, merchantCoins, trades };
}
const tradeSchema = objectSchema({ item: idSchema, quantity: positiveCountSchema });
export const commerceModule: ModuleDefinition = {
  manifest: { id: 'commerce.shop', title: '有限商店交易', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { commerce: '1.0.0' }, requires: {
    inventory: { version: '^1.0.0' }, wallet: { version: '^1.0.0' }, 'shop-rule': { version: '^1.0.0' }, 'trade-price': { version: '^1.0.0' }, availability: { version: '^1.0.0' }, location: { version: '^1.0.0', optional: true }
  } },
  configSchema: objectSchema({ shop: idSchema, customerContainer: idSchema, customerAccount: idSchema }),
  stateSchema: objectSchema({ trades: countSchema }), initialState: () => ({ trades: 0 }),
  validate(ctx) { status(ctx); },
  commands: {
    buy: { schema: tradeSchema, execute: (ctx, input) => trade(ctx, 'buy', input.item as string, input.quantity as number) },
    sell: { schema: tradeSchema, execute: (ctx, input) => trade(ctx, 'sell', input.item as string, input.quantity as number) }
  },
  queries: {
    quote: { schema: objectSchema({ side: { enum: ['buy', 'sell'] }, item: idSchema, quantity: positiveCountSchema }), execute: (ctx, input) => quoteCurrent(ctx, readCurrent(ctx), input.side as Side, input.item as string, input.quantity as number) },
    status: { schema: emptySchema, execute: status }
  }
};
