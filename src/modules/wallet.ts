import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema, safeCount } from './capacity.ts';

export interface WalletBalance extends JsonObject { account: string; coins: number }
interface Account { name: string; coins: number }
interface Config { accounts: Record<string, Account> }
interface State { balances: Record<string, number> }

export function readWalletBalance(ctx: ReadContext, value: unknown, expectedAccount: string): WalletBalance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== 2
    || !['account', 'coins'].every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && 'value' in d && d.enumerable; })) {
    return ctx.fail('INVALID_WALLET', '账户提供者没有返回精确的余额结构');
  }
  const account: unknown = Object.getOwnPropertyDescriptor(value, 'account')!.value;
  const coins: unknown = Object.getOwnPropertyDescriptor(value, 'coins')!.value;
  if (typeof account !== 'string' || account.length === 0 || [...account].length > 128 || account !== expectedAccount
    || typeof coins !== 'number' || !Number.isSafeInteger(coins) || coins < 0) return ctx.fail('INVALID_WALLET', '账户提供者返回了无效账户或余额');
  return { account, coins };
}
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }
function balance(ctx: ReadContext, state: State, id: string): WalletBalance {
  const coins = own(state.balances, id);
  if (!own(config(ctx).accounts, id) || coins === undefined) return ctx.fail('UNKNOWN_ACCOUNT', `未知账户：${id}`);
  return { account: id, coins };
}
const accountSchema = objectSchema({ account: idSchema });
const changeSchema = objectSchema({ account: idSchema, amount: positiveCountSchema });
export const walletModule: ModuleDefinition = {
  manifest: { id: 'wallet.accounts', title: '有限资金账户', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { wallet: '1.0.0' } },
  configSchema: objectSchema({ accounts: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, coins: countSchema })) }),
  stateSchema: objectSchema({ balances: recordSchema(countSchema) }),
  initialState(cfg) { const accounts = (cfg as unknown as Config).accounts; return { balances: Object.fromEntries(Object.entries(accounts).map(([id, account]) => [id, account.coins])) }; },
  validate(ctx) {
    const state = ctx.state<State>();
    if (Object.keys(state.balances).length !== Object.keys(config(ctx).accounts).length) ctx.fail('INVALID_WALLET', '账户集合与配置不一致');
    for (const id of Object.keys(state.balances)) balance(ctx, state, id);
  },
  commands: {
    credit: { schema: changeSchema, execute(ctx, input) {
      const account = input.account as string, amount = input.amount as number, state = ctx.state<State>(), current = balance(ctx, state, account);
      const coins = safeCount(ctx, current.coins + amount, '账户余额'); state.balances[account] = coins; ctx.write(state as unknown as JsonObject); return { account, coins };
    } },
    debit: { schema: changeSchema, execute(ctx, input) {
      const account = input.account as string, amount = input.amount as number, state = ctx.state<State>(), current = balance(ctx, state, account);
      if (current.coins < amount) return ctx.fail('INSUFFICIENT_FUNDS', `账户余额不足：${account}`);
      const coins = current.coins - amount; state.balances[account] = coins; ctx.write(state as unknown as JsonObject); return { account, coins };
    } },
    transfer: { schema: objectSchema({ from: idSchema, to: idSchema, amount: positiveCountSchema }), execute(ctx, input) {
      const from = input.from as string, to = input.to as string, amount = input.amount as number;
      if (from === to) return ctx.fail('INVALID_TRANSFER', '付款和收款账户必须不同');
      const state = ctx.state<State>(), source = balance(ctx, state, from), target = balance(ctx, state, to);
      if (source.coins < amount) return ctx.fail('INSUFFICIENT_FUNDS', `账户余额不足：${from}`);
      const sourceCoins = source.coins - amount, targetCoins = safeCount(ctx, target.coins + amount, '收款账户余额');
      state.balances[from] = sourceCoins; state.balances[to] = targetCoins; ctx.write(state as unknown as JsonObject);
      return { from: { account: from, coins: sourceCoins }, to: { account: to, coins: targetCoins }, transferred: amount };
    } }
  },
  queries: {
    balance: { schema: accountSchema, execute: (ctx, input) => balance(ctx, ctx.state<State>(), input.account as string) },
    list: { schema: emptySchema, execute(ctx) { const state = ctx.state<State>(); return { accounts: Object.entries(config(ctx).accounts).map(([id, account]) => ({ id, name: account.name, coins: balance(ctx, state, id).coins })) }; } }
  }
};
