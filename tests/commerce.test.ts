import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { commerceModule } from '../src/modules/commerce.ts';

const offer = () => ({ buy: 2, sell: 2, targetStock: 1 });
const shop = () => ({ id: 'store', name: '商店', location: null, container: 'shelf', account: 'merchant', offers: { seed: offer(), turnip: offer() } });
interface Faults { price?: any; availability?: any; list?: any; get?: any; wallet?: string; inventory?: string; count?: any; balance?: any; location?: any }
function harness(edit?: (d: WorldDefinition) => void, faults: Faults = {}) {
  const wallet: ModuleDefinition = {
    manifest: { id: 'test.wallet', title: '公开钱包fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { wallet: '1.0.0' } },
    initialState: cfg => ({ balances: cfg.balances! }),
    queries: { balance: { execute(ctx, input) { if (faults.balance !== undefined) return faults.balance; const balances = ctx.state<any>().balances; if (!Object.hasOwn(balances, input.account as string)) ctx.fail('UNKNOWN_ACCOUNT', '未知账户'); return { account: input.account!, coins: balances[input.account as string] }; } } },
    commands: { transfer: { execute(ctx, input) {
      const { from, to, amount } = input as any; const state = ctx.state<any>();
      if (state.balances[from] < amount) ctx.fail('INSUFFICIENT_FUNDS', '余额不足');
      const result = { from: { account: from, coins: state.balances[from] - amount }, to: { account: to, coins: state.balances[to] + amount }, transferred: amount };
      if (faults.wallet !== 'no-write') { state.balances[from] -= amount; state.balances[to] += amount; ctx.write(state); }
      ctx.emit('test.paid', { amount });
      if (faults.wallet === 'wrong-from') result.from.account = 'other';
      if (faults.wallet === 'wrong-to') result.to.coins++;
      if (faults.wallet === 'wrong-amount') result.transferred++;
      if (faults.wallet === 'one-sided') { state.balances[to] -= amount; ctx.write(state); }
      return result;
    } } }
  };
  const rules: ModuleDefinition = {
    manifest: { id: 'test.shops', title: '公开目录fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'shop-rule': '1.0.0' } }, initialState: () => ({}),
    queries: { list: { execute: ctx => faults.list ?? { shops: ctx.config.shops! } }, get: { execute(ctx, input) { if (faults.get !== undefined) return faults.get; const found = (ctx.config.shops as JsonObject[]).find(s => s.id === input.shop); if (!found) ctx.fail('UNKNOWN_SHOP', '未知商店'); return found; } } }
  };
  const prices: ModuleDefinition = { manifest: { id: 'test.price', title: '公开定价fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'trade-price': '1.0.0' } }, initialState: () => ({}), queries: { quote: { execute(_ctx, input) { return faults.price ?? { item: input.item!, side: input.side!, quantity: input.quantity!, total: (input.offer as any)[input.side as string] * (input.quantity as number) }; } } } };
  const availability: ModuleDefinition = { manifest: { id: 'test.availability', title: '公开营业fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { availability: '1.0.0' } }, initialState: () => ({}), queries: { status: { execute: () => faults.availability ?? { open: true, opensInSeconds: 0, closesInSeconds: null } } } };
  const location: ModuleDefinition = { manifest: { id: 'test.location', title: '地点', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { location: '1.0.0' } }, initialState: () => ({}), queries: { current: { execute: () => faults.location ?? { id: 'town' } }, describe: { execute: (_ctx, input) => ({ id: input.location! }) } } };
  const inventory: ModuleDefinition = { ...inventoryModule, commands: { ...inventoryModule.commands, transfer: { ...inventoryModule.commands!.transfer!, execute(ctx, input) { let result: any = { transferred: input.quantity }; if (faults.inventory !== 'no-write') result = inventoryModule.commands!.transfer!.execute(ctx, input); if (faults.inventory === 'source-only' || faults.inventory === 'target-only') { const state = ctx.state<any>(); const { from, to, item, quantity } = input as any; if (faults.inventory === 'source-only') state.containers[to][item] -= quantity; else state.containers[from][item] += quantity; ctx.write(state); } ctx.emit('test.delivered', {}); if (faults.inventory === 'wrong-amount') return { transferred: (input.quantity as number) + 1 }; if (faults.inventory === 'fail') ctx.fail('LATE_INVENTORY', '晚失败'); return result; } } }, queries: { ...inventoryModule.queries, count: { ...inventoryModule.queries!.count!, execute(ctx, input) { return faults.count ?? inventoryModule.queries!.count!.execute(ctx, input); } } } };
  const sequence: ModuleDefinition = { manifest: { id: 'test.sequence', title: '序列', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { commerce: { version: '^1.0.0' } } }, initialState: () => ({ runs: 0 }), commands: { run: { execute(ctx) { ctx.write({ runs: 1 }); ctx.emit('test.before', {}); ctx.call('commerce', 'buy', { item: 'seed', quantity: 1 }); ctx.fail('LATE_SEQUENCE', '已写入后的晚失败'); } } } };
  const registry = new ModuleRegistry([...capacityModules, inventory, commerceModule, wallet, rules, prices, availability, location, sequence]);
  const d: WorldDefinition = { id: 'commerce-test', title: '交易', version: '1', modules: [
    { id: 'capacity', module: 'capacity.slots', config: {} },
    { id: 'inventory', module: 'inventory.basic', config: { items: Object.fromEntries(['seed', 'turnip', 'stone'].map(id => [id, { name: id, weight: 1, volume: 1, length: 1 }])), containers: { bag: { limits: { slots: 3 }, items: {} }, shelf: { limits: { slots: 3 }, items: { seed: 1 } } } } },
    { id: 'wallet', module: 'test.wallet', config: { balances: { customer: 2, merchant: 4 } } },
    { id: 'rules', module: 'test.shops', config: { shops: [shop()] } },
    { id: 'price', module: 'test.price', config: {} }, { id: 'availability', module: 'test.availability', config: {} },
    { id: 'commerce', module: 'commerce.shop', config: { shop: 'store', customerContainer: 'bag', customerAccount: 'customer' } }
  ] }; edit?.(d); return { w: createWorld(registry, d), registry, faults };
}
function instance(d: WorldDefinition, id: string) { const result = d.modules.find(m => m.id === id); assert.ok(result); return result; }
function containers(d: WorldDefinition): any { return instance(d, 'inventory').config.containers; }
function terms(d: WorldDefinition): any { return (instance(d, 'rules').config.shops as any[])[0]; }
function coins(d: WorldDefinition): any { return instance(d, 'wallet').config.balances; }
type World = ReturnType<typeof harness>['w'];
function quote(w: World, side = 'buy', item = 'seed', quantity = 1): any { return w.query('commerce', 'quote', { side, item, quantity }); }
function ok(w: World, target: string, action: string, input: JsonObject = {}, id?: string) { const result = w.dispatch({ target, action, input, ...(id ? { id } : {}) }); assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok) throw Error('失败'); return result; }
function fail(w: World, action: string, input: JsonObject = { item: 'seed', quantity: 1 }, code?: string, target = 'commerce', id?: string) { const before = w.snapshot(); const result = w.dispatch({ target, action, input, ...(id ? { id } : {}) }); assert.equal(result.ok, false, JSON.stringify(result)); if (!result.ok && code) assert.equal(result.error.code, code); assert.deepEqual(w.snapshot(), before); }

test('buy and sell transfer finite funds and actual items; quotes and status remain pure', () => {
  const { w } = harness(d => { containers(d).bag.items.turnip = 1; }); const before = w.snapshot();
  assert.deepEqual(quote(w), { shop: 'store', item: 'seed', side: 'buy', quantity: 1, total: 2, stock: 1, owned: 0, customerCoins: 2, merchantCoins: 4, open: true, available: true, reasons: [] });
  assert.equal((w.query('commerce', 'status') as any).offers.length, 2); assert.deepEqual(w.snapshot(), before);
  const buy = ok(w, 'commerce', 'buy', { item: 'seed', quantity: 1 });
  assert.deepEqual(buy.value, { shop: 'store', item: 'seed', side: 'buy', quantity: 1, total: 2, stock: 0, owned: 1, customerCoins: 0, merchantCoins: 6, trades: 1 });
  assert.deepEqual(buy.events.map(e => e.type), ['test.paid', 'test.delivered', 'commerce.traded']);
  assert.deepEqual(buy.events.at(-1)!.payload, { shop: 'store', item: 'seed', side: 'buy', quantity: 1, total: 2 });
  const sell = ok(w, 'commerce', 'sell', { item: 'turnip', quantity: 1 });
  assert.deepEqual(sell.value, { shop: 'store', item: 'turnip', side: 'sell', quantity: 1, total: 2, stock: 1, owned: 0, customerCoins: 2, merchantCoins: 4, trades: 2 });
  assert.deepEqual(w.snapshot().modules.commerce!.state, { trades: 2 });
});
test('ordinary closed location stock and funds refusals are ordered and do not prevent assembly', () => {
  const { w } = harness(d => { terms(d).location = 'market'; containers(d).shelf.items = {}; coins(d).customer = 0; d.modules.push({ id: 'location', module: 'test.location', config: {} }); }, { availability: { open: false, opensInSeconds: 10, closesInSeconds: null } });
  assert.deepEqual(quote(w).reasons, ['CLOSED', 'WRONG_LOCATION', 'INSUFFICIENT_STOCK', 'INSUFFICIENT_FUNDS']); assert.equal(quote(w).available, false); fail(w, 'buy', undefined, 'TRADE_UNAVAILABLE');
});
test('sell uses customer stock and merchant money without generating credit', () => { const { w } = harness(d => { coins(d).merchant = 0; }); assert.deepEqual(quote(w, 'sell', 'turnip').reasons, ['INSUFFICIENT_STOCK', 'INSUFFICIENT_FUNDS']); fail(w, 'sell', { item: 'turnip', quantity: 1 }, 'TRADE_UNAVAILABLE'); });
test('disabled directions appear null in status and unknown or disabled offers reject', () => { const { w } = harness(d => { terms(d).offers.seed.sell = null; }); assert.equal((w.query('commerce', 'status') as any).offers[0].sell, null); assert.throws(() => quote(w, 'sell')); assert.throws(() => quote(w, 'buy', 'stone')); fail(w, 'sell'); });
test('destination capacity fails after payment and repair then retry charges exactly once', () => {
  const { w } = harness(d => { containers(d).bag.limits.slots = 1; containers(d).bag.items.stone = 1; });
  assert.equal(quote(w).available, true); fail(w, 'buy', undefined, 'CAPACITY_EXCEEDED', 'commerce', 'buy-once');
  ok(w, 'inventory', 'remove', { container: 'bag', item: 'stone', quantity: 1 }); const r = ok(w, 'commerce', 'buy', { item: 'seed', quantity: 1 }, 'buy-once'); assert.equal((r.value as any).customerCoins, 0); assert.equal((r.value as any).trades, 1);
});
test('full merchant container rolls back sell payment and inventory', () => { const { w } = harness(d => { containers(d).shelf.limits.slots = 1; containers(d).bag.items.turnip = 1; }); fail(w, 'sell', { item: 'turnip', quantity: 1 }, 'CAPACITY_EXCEEDED'); });
for (const fault of ['no-write', 'wrong-from', 'wrong-to', 'wrong-amount', 'one-sided']) test(`wallet ${fault} fails return/readback verification and rolls back`, () => { const { w } = harness(undefined, { wallet: fault }); assert.equal(quote(w).available, true); fail(w, 'buy', undefined, fault === 'wrong-from' ? 'INVALID_WALLET' : 'INVALID_WALLET_TRANSFER'); });
for (const fault of ['no-write', 'source-only', 'target-only', 'wrong-amount', 'fail']) test(`inventory ${fault} rolls back already paid funds and emitted events`, () => { const { w } = harness(undefined, { inventory: fault }); assert.equal(quote(w).available, true); fail(w, 'buy', undefined, fault === 'fail' ? 'LATE_INVENTORY' : 'INVALID_INVENTORY_TRANSFER'); });
test('outer late failure restores prior writes events successful trade and receipts', () => { const { w } = harness(d => { d.modules.push({ id: 'sequence', module: 'test.sequence', config: {} }); }); fail(w, 'run', {}, 'LATE_SEQUENCE', 'sequence', 'sequence-id'); });
test('command IDs replay once including after restore; changed input conflicts', () => { const { w, registry } = harness(); const input = { item: 'seed', quantity: 1 }; const first = ok(w, 'commerce', 'buy', input, 'purchase'); const before = w.snapshot(); const replay = ok(w, 'commerce', 'buy', input, 'purchase'); assert.equal(replay.replayed, true); assert.deepEqual(replay.value, first.value); assert.deepEqual(w.snapshot(), before); const restored = restoreWorld(registry, before); ok(restored, 'commerce', 'buy', input, 'purchase'); assert.deepEqual(restored.snapshot(), before); fail(restored, 'buy', { item: 'turnip', quantity: 1 }, undefined, 'commerce', 'purchase'); });
test('same account or container and missing current references reject assembly', () => { for (const field of ['account', 'container']) assert.throws(() => harness(d => { terms(d)[field] = field === 'account' ? 'customer' : 'bag'; })); for (const field of ['account', 'container']) assert.throws(() => harness(d => { terms(d)[field] = 'missing'; })); assert.throws(() => harness(d => { terms(d).location = 'town'; })); assert.throws(() => harness(d => { terms(d).offers.absent = offer(); })); });
test('current catalog deletes, hidden get-only entries, duplicates and divergent get data reject', () => {
  const { w, faults } = harness(); for (const list of [{ shops: [] }, { shops: [shop(), shop()] }, { shops: [{ ...shop(), name: 'changed' }] }, { shops: [{ ...shop(), offers: { seed: { buy: 0, sell: null, targetStock: 1 } } }] }]) { faults.list = list; assert.throws(() => quote(w)); fail(w, 'buy'); } delete faults.list;
  for (const get of [{ ...shop(), id: 'wrong' }, { ...shop(), account: 'absent' }, { ...shop(), offers: {} }]) { faults.get = get; assert.throws(() => quote(w)); fail(w, 'buy'); }
});
test('malformed quote echo total availability balances and counts fail without mutation', () => {
  const { w, faults } = harness();
  const good = { item: 'seed', side: 'buy', quantity: 1, total: 2 };
  for (const bad of [{ ...good, item: 'turnip' }, { ...good, side: 'sell' }, { ...good, quantity: 2 }, ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(total => ({ ...good, total }))]) { faults.price = bad; assert.throws(() => quote(w)); fail(w, 'buy'); } delete faults.price;
  for (const bad of [{ open: true, opensInSeconds: 1, closesInSeconds: null }, { open: false, opensInSeconds: 0, closesInSeconds: null }, { open: 'yes', opensInSeconds: 0, closesInSeconds: null }]) { faults.availability = bad; assert.throws(() => quote(w)); fail(w, 'buy'); } delete faults.availability;
  for (const bad of [{ quantity: -1 }, { quantity: 1.2 }, { quantity: '1' }, {}]) { faults.count = bad; assert.throws(() => quote(w)); fail(w, 'buy'); } delete faults.count;
  for (const bad of [{ account: 'wrong', coins: 2 }, { account: 'customer', coins: -1 }, { account: 'customer', coins: 0.5 }]) { faults.balance = bad; assert.throws(() => quote(w)); fail(w, 'buy'); }
});
test('strict input config and persisted state schemas reject extras invalid identity and quantities', () => {
  const { w, registry } = harness(); for (const quantity of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) { assert.throws(() => quote(w, 'buy', 'seed', quantity)); fail(w, 'buy', { item: 'seed', quantity }); }
  fail(w, 'buy', { item: 'seed', quantity: 1, extra: true }); assert.throws(() => w.query('commerce', 'status', { extra: true })); assert.throws(() => quote(w, 'other'));
  for (const id of ['', '😀'.repeat(129)]) assert.throws(() => harness(d => { instance(d, 'commerce').config.shop = id; }));
  assert.throws(() => harness(d => { instance(d, 'commerce').config.extra = true; })); const snap = w.snapshot(); (snap.modules.commerce!.state as any).extra = true; assert.throws(() => restoreWorld(registry, snap));
});
test('maximum quantity is exact and receiver count money and trade counter overflow roll back', () => {
  const max = Number.MAX_SAFE_INTEGER;
  { const { w } = harness(d => { containers(d).shelf.items.seed = max; coins(d).customer = max; coins(d).merchant = 0; terms(d).offers.seed.buy = 1; }); const result = ok(w, 'commerce', 'buy', { item: 'seed', quantity: max }); assert.equal((result.value as any).owned, max); assert.equal((result.value as any).merchantCoins, max); }
  { const { w } = harness(d => { coins(d).merchant = max; }); fail(w, 'buy'); }
  { const { w } = harness(d => { containers(d).bag.items.seed = max; }); fail(w, 'buy'); }
  { const { w, registry } = harness(); const snap = w.snapshot(); snap.modules.commerce!.state = { trades: max }; const restored = restoreWorld(registry, snap); fail(restored, 'buy'); }
});
test('configuration edits keep actual money and trades while checking new references', () => { const { w, registry } = harness(); ok(w, 'commerce', 'buy', { item: 'seed', quantity: 1 }); const d = w.definition; coins(d).customer = 99; const changed = reconfigureWorld(registry, w, d); assert.equal(quote(changed).customerCoins, 0); assert.equal((changed.query('commerce', 'status') as any).trades, 1); terms(d).container = 'missing'; assert.throws(() => reconfigureWorld(registry, changed, d)); });
test('two explicitly bound shops have independent suppliers customers and counts', () => {
  const { w } = harness(d => {
    const second = structuredClone(instance(d, 'inventory')); second.id = 'inventory2'; (second.config.containers as any).shelf.items.seed = 3; second.bindings = { capacity: 'capacity' }; d.modules.push(second);
    const money = structuredClone(instance(d, 'wallet')); money.id = 'wallet2'; (money.config.balances as any).customer = 8; d.modules.push(money);
    instance(d, 'commerce').bindings = { inventory: 'inventory', wallet: 'wallet' };
    d.modules.push({ id: 'commerce2', module: 'commerce.shop', config: { shop: 'second', customerContainer: 'bag', customerAccount: 'customer' }, bindings: { inventory: 'inventory2', wallet: 'wallet2' } });
    (instance(d, 'rules').config.shops as any[]).push({ ...shop(), id: 'second' });
  });
  ok(w, 'commerce', 'buy', { item: 'seed', quantity: 1 }); const status: any = w.query('commerce2', 'status'); assert.equal(status.customerCoins, 8); assert.equal(status.trades, 0); assert.equal(status.offers[0].stock, 3); ok(w, 'commerce2', 'buy', { item: 'seed', quantity: 2 }); assert.equal(quote(w).stock, 0); assert.equal(quote(w).customerCoins, 0);
});
test('Unicode and own prototype-like identities transfer normally without inherited lookups', () => {
  const item = '😀'.repeat(128), shopID = '店'.repeat(128);
  const { w } = harness(d => {
    instance(d, 'inventory').config.items = { [item]: { name: '种子', weight: 1, volume: 1, length: 1 } };
    instance(d, 'inventory').config.containers = { toString: { limits: { slots: 2 }, items: {} }, hasOwnProperty: { limits: { slots: 2 }, items: { [item]: 1 } } };
    instance(d, 'wallet').config.balances = { toString: 2, hasOwnProperty: 4 };
    instance(d, 'rules').config.shops = [{ id: shopID, name: '商店', location: null, container: 'hasOwnProperty', account: 'hasOwnProperty', offers: { [item]: offer() } }];
    instance(d, 'commerce').config = { shop: shopID, customerContainer: 'toString', customerAccount: 'toString' };
  });
  const result = ok(w, 'commerce', 'buy', { item, quantity: 1 }); assert.equal((result.value as any).shop, shopID); assert.equal((result.value as any).owned, 1); assert.equal((result.value as any).customerCoins, 0);
});
test('other catalog shops validate definitions without requiring their independent resource domain', () => {
  const { w } = harness(d => { (instance(d, 'rules').config.shops as any[]).push({ ...shop(), id: 'remote', container: 'remote-shelf', account: 'remote-account', location: 'remote-town', offers: { distantItem: offer() } }); });
  assert.equal(quote(w).available, true); ok(w, 'commerce', 'buy', { item: 'seed', quantity: 1 });
});
test('real wallet catalog fixed price and availability compose with finite inventory', async () => {
  const [{ walletModule }, { shopRulesModule }, { priceFixedModule }, { availabilityAlwaysModule }] = await Promise.all([
    import('../src/modules/wallet.ts'), import('../src/modules/shop-rules.ts'), import('../src/modules/trade-price.ts'), import('../src/modules/availability.ts')
  ]);
  const { w } = harness(); const d = w.definition;
  instance(d, 'wallet').module = 'wallet.accounts'; instance(d, 'wallet').config = { accounts: { customer: { name: '玩家', coins: 2 }, merchant: { name: '商人', coins: 4 } } };
  instance(d, 'rules').module = 'shops.catalog'; const { id, ...definition } = shop(); instance(d, 'rules').config = { shops: { [id]: definition } };
  instance(d, 'price').module = 'trade-price.fixed'; instance(d, 'availability').module = 'availability.always';
  const registry = new ModuleRegistry([...capacityModules, inventoryModule, commerceModule, walletModule, shopRulesModule, priceFixedModule, availabilityAlwaysModule]);
  const actual = createWorld(registry, d); const bought = ok(actual, 'commerce', 'buy', { item: 'seed', quantity: 1 });
  assert.equal((bought.value as any).customerCoins, 0); assert.equal((bought.value as any).merchantCoins, 6); assert.deepEqual(bought.events.map(e => e.type), ['commerce.traded']);
  const sold = ok(actual, 'commerce', 'sell', { item: 'seed', quantity: 1 }); assert.equal((sold.value as any).customerCoins, 2); assert.equal((sold.value as any).merchantCoins, 4); assert.equal((sold.value as any).stock, 1);
});
