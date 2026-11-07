import type { ModuleDefinition } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, MAX_NUMBER, objectSchema, positiveCountSchema } from './capacity.ts';
import { offerSchema, readOffer } from './shop-rules.ts';

const ids = ['trade-price.fixed', 'trade-price.stock'];
const quoteSchema = objectSchema({ item: idSchema, side: { enum: ['buy', 'sell'] }, quantity: positiveCountSchema, stock: countSchema, offer: offerSchema });
function priceModule(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'trade-price.fixed' ? '固定交易定价' : '库存分档交易定价', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'trade-price': '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: { quote: { schema: quoteSchema, execute(ctx, input) {
      const item = input.item as string, side = input.side as 'buy' | 'sell', quantity = input.quantity as number;
      const offer = readOffer(ctx, input.offer), base = offer[side];
      if (base === null) return ctx.fail('UNSUPPORTED_DIRECTION', `物品不支持该交易方向：${item}/${side}`);
      const qty = BigInt(quantity), stock = BigInt(input.stock as number), target = BigInt(offer.targetStock);
      let scarce = 0n;
      if (id === 'trade-price.stock') {
        const difference = side === 'buy' ? stock - target : target - stock;
        const capacity = difference > 0n ? difference : 0n, units = qty < capacity ? qty : capacity;
        scarce = side === 'buy' ? qty - units : units;
      }
      const total = BigInt(base) * (qty + scarce);
      if (total > BigInt(MAX_NUMBER)) return ctx.fail('INVALID_NUMBER', '交易总价超出安全整数范围');
      return { item, side, quantity, total: Number(total) };
    } } },
    migrate(previous) {
      if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1
        || typeof previous.state !== 'object' || previous.state === null || Array.isArray(previous.state)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(previous.state)) || Reflect.ownKeys(previous.state).length) throw Error('不兼容的交易定价状态');
      return {};
    }
  };
}
export const priceFixedModule = priceModule('trade-price.fixed');
export const priceStockModule = priceModule('trade-price.stock');
