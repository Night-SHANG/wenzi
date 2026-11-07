import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, ReadContext, WorldDefinition } from '../src/contracts.ts';

import { walletModule, readWalletBalance } from '../src/modules/wallet.ts';
import { shopRulesModule, readOffer, readShop } from '../src/modules/shop-rules.ts';
import { priceFixedModule, priceStockModule } from '../src/modules/trade-price.ts';

function modules() { return { walletModule, readWalletBalance, shopRulesModule, readOffer, readShop, priceFixedModule, priceStockModule }; }
const max = Number.MAX_SAFE_INTEGER;
function definition(): WorldDefinition { return { id: 'economy-rules', title: '经济规则', version: '1', modules: [
  { id: 'wallet', module: 'wallet.accounts', config: { accounts: { a: { name: '玩家', coins: 2 }, b: { name: '商人', coins: 4 } } } },
  { id: 'shops', module: 'shops.catalog', config: { shops: { town: { name: '小店', location: null, container: 'shelf', account: 'b', offers: { seed: { buy: 3, sell: 1, targetStock: 2 } } } } } },
  { id: 'price', module: 'trade-price.fixed', config: {} }
] }; }
async function setup(edit?: (d: WorldDefinition) => void) { const m = await modules(), d = definition(); edit?.(d); const registry = new ModuleRegistry([m.walletModule, m.shopRulesModule, m.priceFixedModule, m.priceStockModule]); return { m, d, registry, w: createWorld(registry, d) }; }
type World = Awaited<ReturnType<typeof setup>>['w'];
function instance(d: WorldDefinition, id: string) { const value = d.modules.find(m => m.id === id); assert.ok(value); return value; }
function ok(w: World, action: string, input: JsonObject) { const result = w.dispatch({ target: 'wallet', action, input }); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw Error('wallet command failed'); return result; }
function fails(w: World, action: string, input: JsonObject) { const before = w.snapshot(), result = w.dispatch({ target: 'wallet', action, input }); assert.equal(result.ok, false, JSON.stringify(result)); assert.deepEqual(w.snapshot(), before); }
function balance(w: World, account: string) { return w.query('wallet', 'balance', { account }); }
function quote(w: World, side = 'buy', quantity = 3, stock = 4, offer: JsonObject = { buy: 3, sell: 1, targetStock: 2 }) { const before = w.snapshot(), result = w.query('price', 'quote', { item: 'seed', side, quantity, stock, offer }); assert.deepEqual(w.snapshot(), before); return result; }
const readerContext = { fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); } } as ReadContext;

test('wallet transfers real finite balances both ways without events and lists detached names', async () => {
  const { w } = await setup(); assert.deepEqual(balance(w, 'a'), { account: 'a', coins: 2 });
  assert.deepEqual(w.query('wallet', 'list'), { accounts: [{ id: 'a', name: '玩家', coins: 2 }, { id: 'b', name: '商人', coins: 4 }] });
  const paid = ok(w, 'transfer', { from: 'a', to: 'b', amount: 2 }); assert.deepEqual(paid.value, { from: { account: 'a', coins: 0 }, to: { account: 'b', coins: 6 }, transferred: 2 }); assert.deepEqual(paid.events, []);
  ok(w, 'transfer', { from: 'b', to: 'a', amount: 2 }); assert.deepEqual(balance(w, 'a'), { account: 'a', coins: 2 }); assert.deepEqual(balance(w, 'b'), { account: 'b', coins: 4 });
  assert.deepEqual(ok(w, 'credit', { account: 'a', amount: 3 }).value, { account: 'a', coins: 5 }); assert.deepEqual(ok(w, 'debit', { account: 'a', amount: 3 }).value, { account: 'a', coins: 2 });
});
test('wallet rejects malformed amounts unknown accounts same source insufficiency and overflow atomically', async () => {
  const { w } = await setup();
  for (const amount of [0, -1, 0.5, max + 1]) for (const action of ['credit', 'debit']) fails(w, action, { account: 'a', amount });
  for (const input of [{ from: 'a', to: 'a', amount: 1 }, { from: 'a', to: 'b', amount: 3 }, { from: 'missing', to: 'b', amount: 1 }, { from: 'a', to: 'toString', amount: 1 }, { from: 'a', to: 'b', amount: 1, extra: true }]) fails(w, 'transfer', input);
  fails(w, 'debit', { account: 'a', amount: 3 }); fails(w, 'credit', { account: 'toString', amount: 1 }); fails(w, 'credit', { account: 'a', amount: max });
  const { w: full } = await setup(d => { (instance(d, 'wallet').config.accounts as any).b.coins = max; }); fails(full, 'transfer', { from: 'a', to: 'b', amount: 1 });
});
test('wallet restore and initial-amount edits preserve balances but account-set edits reject', async () => {
  const { w, registry } = await setup(); ok(w, 'transfer', { from: 'a', to: 'b', amount: 2 }); const restored = restoreWorld(registry, w.snapshot()); assert.deepEqual(restored.snapshot(), w.snapshot());
  const d = w.definition; (instance(d, 'wallet').config.accounts as any).a.coins = 99; const changed = reconfigureWorld(registry, w, d); assert.deepEqual(balance(changed, 'a'), { account: 'a', coins: 0 });
  (instance(d, 'wallet').config.accounts as any).c = { name: '新增', coins: 1 }; assert.throws(() => reconfigureWorld(registry, w, d));
  const snapshot = w.snapshot(); (snapshot.modules.wallet!.state as any).balances.c = 1; assert.throws(() => restoreWorld(registry, snapshot));
});
test('wallet schemas and readback require exact account coins and safe integers', async () => {
  const { m } = await setup(); assert.deepEqual(m.readWalletBalance(readerContext, { account: 'a', coins: 0 }, 'a'), { account: 'a', coins: 0 });
  for (const value of [null, [], {}, { account: 'b', coins: 1 }, { account: 'a', coins: -1 }, { account: 'a', coins: 0.5 }, { account: 'a', coins: max + 1 }, { account: 'a', coins: 2, extra: true }]) assert.throws(() => m.readWalletBalance(readerContext, value, 'a'));
  for (const coins of [-1, 0.5, max + 1]) await assert.rejects(() => setup(d => { (instance(d, 'wallet').config.accounts as any).a.coins = coins; }));
});
test('catalog exposes exact independent terms including disabled directions', async () => {
  const { w } = await setup(d => { (instance(d, 'shops').config.shops as any).town.offers.seed.sell = null; });
  const expected = { id: 'town', name: '小店', location: null, container: 'shelf', account: 'b', offers: { seed: { buy: 3, sell: null, targetStock: 2 } } };
  assert.deepEqual(w.query('shops', 'get', { shop: 'town' }), expected); assert.deepEqual(w.query('shops', 'list'), { shops: [expected] });
  const got = w.query('shops', 'get', { shop: 'town' }) as any; got.offers.seed.buy = 99; assert.deepEqual(w.query('shops', 'get', { shop: 'town' }), expected); assert.throws(() => w.query('shops', 'get', { shop: 'toString' }));
});
test('catalog schemas reject empty offers disabled both directions invalid counts and unknown fields', async () => {
  for (const offers of [{}, { seed: { buy: null, sell: null, targetStock: 2 } }, { seed: { buy: 0, sell: 1, targetStock: 2 } }, { seed: { buy: 1, sell: 1, targetStock: 0 } }, { seed: { buy: 1, sell: 1, targetStock: 1.5 } }, { seed: { buy: 1, sell: 1, targetStock: 2, hidden: true } }]) await assert.rejects(() => setup(d => { (instance(d, 'shops').config.shops as any).town.offers = offers; }));
  await assert.rejects(() => setup(d => { (instance(d, 'shops').config.shops as any).town.id = 'forged'; }));
});
test('readOffer and readShop reject malformed external values and mismatched identity', async () => {
  const { m, w } = await setup(); const shop = w.query('shops', 'get', { shop: 'town' }); assert.deepEqual(m.readShop(readerContext, shop, 'town'), shop);
  for (const value of [null, {}, [], { buy: null, sell: null, targetStock: 1 }, { buy: '1', sell: null, targetStock: 1 }, { buy: 1, sell: null, targetStock: max + 1 }, { buy: 1, sell: null, targetStock: 1, extra: 1 }]) assert.throws(() => m.readOffer(readerContext, value));
  for (const value of [{ ...(shop as JsonObject), id: 'other' }, { ...(shop as JsonObject), offers: {} }, { ...(shop as JsonObject), location: 1 }, { ...(shop as JsonObject), container: '' }, { ...(shop as JsonObject), extra: 1 }]) assert.throws(() => m.readShop(readerContext, value, 'town'));
});
test('Unicode ID limits use codepoints and own prototype-like keys remain safe across modules', async () => {
  const id = '🌱'.repeat(128); const { w } = await setup(d => {
    instance(d, 'wallet').config.accounts = { [id]: { name: '长 ID', coins: 2 }, toString: { name: 'own', coins: 4 }, hasOwnProperty: { name: 'own2', coins: 0 } };
    instance(d, 'shops').config.shops = { toString: { name: '特殊', location: id, container: 'hasOwnProperty', account: id, offers: { [id]: { buy: null, sell: 1, targetStock: 1 }, hasOwnProperty: { buy: 1, sell: null, targetStock: 1 } } } };
  }); ok(w, 'transfer', { from: id, to: 'hasOwnProperty', amount: 2 }); assert.deepEqual(balance(w, 'hasOwnProperty'), { account: 'hasOwnProperty', coins: 2 }); assert.equal((w.query('shops', 'get', { shop: 'toString' }) as any).id, 'toString');
  for (const invalid of ['', '🌱'.repeat(129)]) await assert.rejects(() => setup(d => { instance(d, 'wallet').config.accounts = { [invalid]: { name: 'bad', coins: 1 } }; }));
  await assert.rejects(() => setup(d => { instance(d, 'wallet').config.accounts = JSON.parse('{"__proto__":{"name":"bad","coins":1}}'); }));
});
test('fixed and stock prices implement exact threshold totals with reverse quotes', async () => {
  const { w, registry } = await setup(); assert.deepEqual(quote(w), { item: 'seed', side: 'buy', quantity: 3, total: 9 });
  const d = w.definition; instance(d, 'price').module = 'trade-price.stock'; const stock = reconfigureWorld(registry, w, d);
  assert.deepEqual(quote(stock), { item: 'seed', side: 'buy', quantity: 3, total: 12 }); assert.deepEqual(quote(stock, 'sell', 3, 1), { item: 'seed', side: 'sell', quantity: 3, total: 4 });
  const same = { buy: 3, sell: 3, targetStock: 2 }; assert.equal((quote(stock, 'buy', 3, 4, same) as any).total, (quote(stock, 'sell', 3, 1, same) as any).total);
  assert.equal((quote(stock, 'buy', 3, 0) as any).total, 18);
});
test('prices handle maximum safe quantities in constant work and reject final overflow', async () => {
  const { w, registry } = await setup(); const one = { buy: 1, sell: 1, targetStock: 1 }; assert.equal((quote(w, 'buy', max, max, one) as any).total, max);
  const d = w.definition; instance(d, 'price').module = 'trade-price.stock'; const stock = reconfigureWorld(registry, w, d); assert.equal((quote(stock, 'sell', max, 1, one) as any).total, max);
  assert.throws(() => quote(stock, 'buy', max, max, one)); assert.throws(() => quote(w, 'buy', max, max, { ...one, buy: 2 }));
});
test('price schemas reject disabled directions bad counts and unknown fields and echo Unicode items', async () => {
  const { w } = await setup(); assert.throws(() => quote(w, 'buy', 1, 0, { buy: null, sell: 1, targetStock: 1 }));
  for (const quantity of [0, -1, 1.5, max + 1]) assert.throws(() => quote(w, 'buy', quantity));
  for (const stock of [-1, 0.5, max + 1]) assert.throws(() => quote(w, 'buy', 1, stock));
  assert.throws(() => quote(w, 'other')); assert.throws(() => w.query('price', 'quote', { item: 'seed', side: 'buy', quantity: 1, stock: 1, offer: { buy: 1, sell: 1, targetStock: 1 }, extra: 1 }));
  const id = '🌱'.repeat(128); assert.deepEqual(w.query('price', 'quote', { item: id, side: 'sell', quantity: 1, stock: 0, offer: { buy: null, sell: 1, targetStock: 1 } }), { item: id, side: 'sell', quantity: 1, total: 1 });
});
test('price swaps accept only exact empty v1 history and preserve empty state on round trip', async () => {
  const { w, registry, m } = await setup(); const d = w.definition; instance(d, 'price').module = 'trade-price.stock'; const stock = reconfigureWorld(registry, w, d); instance(d, 'price').module = 'trade-price.fixed'; const fixed = reconfigureWorld(registry, stock, d); assert.deepEqual(fixed.snapshot().modules.price!.state, {});
  for (const module of [m.priceFixedModule, m.priceStockModule]) for (const previous of [
    { moduleId: 'trade-price.stock', version: '1.0.1', stateVersion: 1, state: {} },
    { moduleId: 'unknown', version: '1.0.0', stateVersion: 1, state: {} },
    { moduleId: 'trade-price.fixed', version: '1.0.0', stateVersion: 2, state: {} },
    { moduleId: 'trade-price.stock', version: '1.0.0', stateVersion: 1, state: { total: 1 } }
  ]) assert.throws(() => module.migrate!(previous, {}));
});

test('public readers reject inherited hidden accessor and symbol properties without executing accessors', async () => {
  const { m, w } = await setup(); let reads = 0;
  const accessor = Object.defineProperty({ coins: 1 }, 'account', { enumerable: true, get() { reads++; return 'a'; } });
  const hidden = Object.defineProperty({ account: 'a', coins: 1 }, 'hidden', { value: 1 });
  const symbol = { account: 'a', coins: 1, [Symbol('hidden')]: true };
  for (const value of [accessor, hidden, symbol, Object.assign(Object.create({ extra: 1 }), { account: 'a', coins: 1 })]) assert.throws(() => m.readWalletBalance(readerContext, value, 'a'));
  const offerAccessor = Object.defineProperty({ sell: null, targetStock: 1 }, 'buy', { enumerable: true, get() { reads++; return 1; } });
  assert.throws(() => m.readOffer(readerContext, offerAccessor));
  const shop = w.query('shops', 'get', { shop: 'town' }) as JsonObject;
  assert.throws(() => m.readShop(readerContext, { ...shop, offers: Object.create({ seed: { buy: 1, sell: null, targetStock: 1 } }) }));
  assert.equal(reads, 0);
});
test('price migration rejects non-JSON objects masquerading as empty history', async () => {
  const { m } = await setup();
  for (const module of [m.priceFixedModule, m.priceStockModule]) for (const state of [new Date(), Object.defineProperty({}, 'history', { value: 1 }), { [Symbol('history')]: 1 }]) {
    assert.throws(() => module.migrate!({ moduleId: 'trade-price.stock', version: '1.0.0', stateVersion: 1, state: state as JsonObject }, {}));
  }
});
