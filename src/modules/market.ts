import type { JsonObject, ModuleDefinition } from '../contracts.ts';
import { emptySchema, idSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema, safeNumber } from './capacity.ts';
interface Config { container: string; prices: Record<string, number>; initialCoins: number }
export const marketModule: ModuleDefinition = {
  manifest: { id: 'market.fixed', title: '固定价格市场', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { market: '1.0.0' }, requires: { inventory: { version: '^1.0.0' } } },
  configSchema: objectSchema({ container: idSchema, prices: recordSchema(numberSchema), initialCoins: numberSchema }),
  stateSchema: objectSchema({ coins: numberSchema }), initialState: config => ({ coins: config.initialCoins! }),
  validate(ctx) { const config = ctx.config as unknown as Config; ctx.query('inventory', 'list', { container: config.container }); for (const item of Object.keys(config.prices)) ctx.query('inventory', 'count', { container: config.container, item }); },
  commands: { sell: { schema: objectSchema({ item: idSchema, quantity: positiveCountSchema }), execute(ctx, input) {
    const config = ctx.config as unknown as Config; const item = input.item as string, quantity = input.quantity as number, price = own(config.prices, item);
    if (price === undefined) return ctx.fail('UNKNOWN_PRICE', `没有出售价格：${item}`);
    const coins = safeNumber(ctx, ctx.state<{ coins: number }>().coins + safeNumber(ctx, price * quantity, '出售收入'), '金币');
    ctx.call('inventory', 'remove', { container: config.container, item, quantity }); ctx.write({ coins }); return { coins, earned: price * quantity };
  } } },
  queries: { balance: { schema: emptySchema, execute: ctx => ctx.state<{ coins: number }>() } }
};
