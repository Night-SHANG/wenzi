import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition } from '../src/contracts.ts';
import { emptySchema } from '../src/modules/capacity.ts';
import { settlementViewModule } from '../src/modules/settlement-view.ts';
import { workshopViewModule } from '../src/modules/workshop-view.ts';
import { parseActionCommand } from '../src/presentation/actions.ts';

type Answers = Record<string, Record<string, JsonValue>>;
function setup(view: ModuleDefinition, config: JsonObject, answers: Answers) {
  const providers = Object.entries(answers).map(([capability, queries]): ModuleDefinition => ({
    manifest: { id: `test.${capability}`, title: capability, version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { [capability]: '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: Object.fromEntries(Object.entries(queries).map(([name, value]) => [name, { schema: { type: 'object' }, execute: () => structuredClone(value) }])),
  }));
  const bindings = Object.fromEntries(Object.keys(answers).map(capability => [capability, `实 例「${capability}」`]));
  return createWorld(new ModuleRegistry([...providers, view]), {
    id: 'test.views', title: 'View contracts', version: '1.0.0',
    modules: [
      ...providers.map(provider => ({ id: bindings[Object.keys(provider.manifest.provides)[0]!]!, module: provider.manifest.id, config: {} })),
      { id: 'view', module: view.manifest.id, config, bindings },
    ],
  });
}
const viewConfig = { title: '河岸经营', container: 'player', account: 'player', plot: 'box', crop: 'turnip' };
function settlementAnswers(): Answers {
  const quote = { shop: 'riverside', item: 'seed', side: 'buy', quantity: 1, total: 2, stock: 1, owned: 0, customerCoins: 2, merchantCoins: 4, open: true, available: true, reasons: [] };
  return {
    inventory: { list: { items: [], limits: { slots: 6 } } },
    wallet: { balance: { account: 'player', coins: 2 } },
    time: { now: { elapsedSeconds: 10 } },
    calendar: { now: { elapsedSeconds: 10, dayIndex: 0, dayOfWeek: 0, secondOfDay: 10, secondsPerDay: 60, daysPerWeek: 3 } },
    planting: { plots: { plots: [] } },
    commerce: { status: { shop: 'riverside', name: '河岸商店', location: 'market', container: 'supplier', account: 'supplier', customerContainer: 'player', customerAccount: 'player', trades: 0, customerCoins: 2, merchantCoins: 4, availability: { open: true, opensInSeconds: 0, closesInSeconds: 40 }, offers: [{ item: 'seed', stock: 1, owned: 0, buy: quote, sell: null }] } },
    quests: { list: { quests: [{ id: 'delivery', name: '午餐订单', description: '交付餐食', status: 'available', ready: false, completed: 0, remainingDelivery: { meal: 1 }, remainingVictories: {}, rewards: { voucher: 1 }, experience: 0, locations: ['market'] }] } },
    location: { current: { id: 'market', name: '集市', description: '', exits: [{ id: 'river', name: '河岸' }], visited: ['market'] } },
  };
}
function workshopAnswers(): Answers {
  return {
    'text-view': { render: { title: 'Base', lines: ['保留基础视图'] } },
    crafting: { status: { job: null, ready: false, remainingSeconds: 0 } },
    recipes: { list: { recipes: [{ id: 'press', name: '留种', inputs: { turnip: 1 }, outputs: { seed: 1 }, durationSeconds: 10 }] } },
  };
}
function lines(world: ReturnType<typeof createWorld>): string[] { return (world.query('view', 'render') as JsonObject).lines as string[]; }
function commands(text: string[]) { return text.filter(line => line.includes('do {')).map(line => parseActionCommand(line.slice(line.indexOf('do {') + 3))); }
function rejectsPure(world: ReturnType<typeof createWorld>) {
  const before = world.snapshot();
  assert.throws(() => world.query('view', 'render'));
  assert.deepEqual(world.snapshot(), before);
}
test('settlement text uses public data and real quoted bindings without changing a snapshot', () => {
  const world = setup(settlementViewModule, viewConfig, settlementAnswers()), before = world.snapshot();
  const output = lines(world), actions = commands(output);
  assert.ok(output.some(line => line.includes('河岸商店') && line.includes('4')));
  assert.ok(output.some(line => line.includes('2') && line.includes('币')));
  assert.ok(actions.some(command => command.target === '实 例「commerce」' && command.action === 'buy' && command.input?.item === 'seed'));
  assert.ok(actions.some(command => command.target === '实 例「planting」' && command.action === 'plant' && command.input?.plot === 'box'));
  assert.ok(actions.some(command => command.target === '实 例「quests」' && command.action === 'accept'));
  assert.ok(actions.some(command => command.target === '实 例「location」' && command.action === 'move'));
  assert.deepEqual(world.snapshot(), before);
});
test('settlement text rejects malformed or contradictory consumed data rather than displaying a trade as available', () => {
  const changes: ((answers: Answers) => void)[] = [
    a => { (a.inventory!.list as JsonObject).items = [{ id: 'seed', name: '种子', quantity: -1 }]; },
    a => { (a.calendar!.now as JsonObject).dayIndex = 2; },
    a => { (a.time!.now as JsonObject).elapsedSeconds = 11; },
    a => { (a.wallet!.balance as JsonObject).account = 'elsewhere'; },
    a => { (a.commerce!.status as JsonObject).customerCoins = 20; },
    a => { (a.commerce!.status as JsonObject).customerContainer = 'other'; },
    a => { const offer = ((a.commerce!.status as JsonObject).offers as JsonObject[])[0]!; (offer.buy as JsonObject).item = 'elsewhere'; },
    a => { const offer = ((a.commerce!.status as JsonObject).offers as JsonObject[])[0]!; (offer.buy as JsonObject).reasons = ['CLOSED']; },
    a => { const offer = ((a.commerce!.status as JsonObject).offers as JsonObject[])[0]!; (offer.buy as JsonObject).stock = 2; },
    a => { (a.planting!.plots as JsonObject).plots = [{ id: 'box', crop: 'turnip', name: '芜菁', progress: 2 }]; },
    a => { const quest = ((a.quests!.list as JsonObject).quests as JsonObject[])[0]!; quest.status = 'invented'; },
    a => { const quest = ((a.quests!.list as JsonObject).quests as JsonObject[])[0]!; quest.ready = true; },
    a => { (a.location!.current as JsonObject).exits = [{ id: 'river', name: '河岸' }, { id: 'river', name: '河岸' }]; },
  ];
  for (const change of changes) { const answers = settlementAnswers(); change(answers); rejectsPure(setup(settlementViewModule, viewConfig, answers)); }
});
test('settlement text displays ordinary refusals and only offers mature harvest or ready delivery actions', () => {
  const answers = settlementAnswers(), shop = answers.commerce!.status as JsonObject;
  shop.availability = { open: false, opensInSeconds: 10, closesInSeconds: null };
  const offer = (shop.offers as JsonObject[])[0]!, quote = offer.buy as JsonObject;
  quote.open = false; quote.available = false; quote.reasons = ['CLOSED'];
  (answers.planting!.plots as JsonObject).plots = [{ id: 'box', crop: 'turnip', name: '芜菁', progress: 1 }];
  const quest = ((answers.quests!.list as JsonObject).quests as JsonObject[])[0]!;
  quest.status = 'ready'; quest.ready = true; quest.remainingDelivery = { meal: 0 };
  const world = setup(settlementViewModule, viewConfig, answers), output = lines(world), actions = commands(output);
  assert.ok(output.some(line => line.includes('闭店')));
  assert.ok(!actions.some(command => command.action === 'buy' || command.action === 'plant'));
  assert.ok(actions.some(command => command.action === 'harvest'));
  assert.ok(actions.some(command => command.action === 'turnIn'));
});
test('workshop view composes base text and uses its own crafting binding for start, collect and cancel', () => {
  const answers = workshopAnswers(), world = setup(workshopViewModule, { title: '种子工坊' }, answers), before = world.snapshot();
  assert.equal(lines(world)[0], '保留基础视图');
  assert.ok(commands(lines(world)).some(command => command.target === '实 例「crafting」' && command.action === 'start' && command.input?.recipe === 'press'));
  assert.deepEqual(world.snapshot(), before);
  (answers.crafting!.status as JsonObject).job = { recipe: 'deleted', name: '旧订单', batches: 1, inputs: { turnip: 1 }, outputs: { seed: 1 }, startedAt: 30, readyAt: 40 };
  (answers.crafting!.status as JsonObject).ready = true;
  const active = setup(workshopViewModule, { title: '种子工坊' }, answers), actions = commands(lines(active));
  assert.ok(actions.some(command => command.action === 'collect'));
  assert.ok(actions.some(command => command.action === 'cancel'));
  assert.ok(!actions.some(command => command.action === 'start'));
  assert.ok(lines(active).some(line => line.includes('旧订单')));
});
test('workshop view validates base text, catalog and frozen jobs without requiring a deleted current recipe', () => {
  const job = { recipe: 'press', name: '留种', batches: 1, inputs: { turnip: 1 }, outputs: { seed: 1 }, startedAt: 30, readyAt: 40 };
  const changes: ((a: Answers) => void)[] = [
    a => { (a['text-view']!.render as JsonObject).lines = [42]; },
    a => { (a.recipes!.list as JsonObject).recipes = [{ id: 'press', name: '留种', inputs: {}, outputs: { seed: 1 }, durationSeconds: 10 }]; },
    a => { const recipes = (a.recipes!.list as JsonObject).recipes as JsonObject[]; recipes.push(structuredClone(recipes[0]!)); },
    a => { (a.crafting!.status as JsonObject).ready = true; },
    a => { (a.crafting!.status as JsonObject).remainingSeconds = 1; },
    a => { a.crafting!.status = { job, ready: false, remainingSeconds: 0 }; },
    a => { a.crafting!.status = { job: { ...job, readyAt: 30 }, ready: true, remainingSeconds: 0 }; },
    a => { a.crafting!.status = { job: { ...job, outputs: { seed: 0 } }, ready: true, remainingSeconds: 0 }; },
  ];
  for (const change of changes) { const answers = workshopAnswers(); change(answers); rejectsPure(setup(workshopViewModule, { title: '工坊' }, answers)); }
});
