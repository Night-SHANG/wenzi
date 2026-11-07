import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject, JsonValue, ModuleDefinition, PreviousState, ReadContext, WorldDefinition } from '../src/contracts.ts';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import { timeModules } from '../src/modules/time.ts';
import { calendarModule, readCalendar } from '../src/modules/calendar.ts';
import { availabilityAlwaysModule, availabilityScheduleModule, readAvailability } from '../src/modules/availability.ts';

const provider = (capability: string, action: string): ModuleDefinition => ({
  manifest: { id: `test.${capability}`, title: '公共提供者', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { [capability]: '1.0.0' } },
  initialState: () => ({}), queries: { [action]: { execute: ctx => ctx.config.result! } }
});
const timeProvider = provider('time', 'now'), calendarProvider = provider('calendar', 'now'), availabilityProvider = provider('availability', 'status');
const consumer: ModuleDefinition = {
  manifest: { id: 'test.availability-consumer', title: '营业消费者', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {}, requires: { availability: { version: '^1.0.0' } } },
  initialState: () => ({}), queries: { status: { execute: ctx => ({ ...readAvailability(ctx, ctx.query('availability', 'status')) }) } }
};
function registry() { return new ModuleRegistry([...timeModules, calendarModule, availabilityAlwaysModule, availabilityScheduleModule, timeProvider, calendarProvider, availabilityProvider, consumer]); }
function definition(clock = 'time.continuous', schedule: JsonObject = { days: [0, 1], windows: [{ start: 10, end: 50 }] }): WorldDefinition {
  return { id: 'calendar-test', title: '日历营业测试', version: '1', modules: [
    { id: 'clock', module: clock, config: clock === 'time.step' ? { secondsPerStep: 10 } : {} },
    { id: 'calendar', module: 'calendar.cyclic', config: { secondsPerDay: 60, daysPerWeek: 3 } },
    { id: 'shop', module: 'availability.schedule', config: schedule }
  ] };
}
function setup(clock = 'time.continuous', schedule?: JsonObject) { return createWorld(registry(), definition(clock, schedule)); }
type World = ReturnType<typeof setup>;
function advance(w: World, seconds: number, step = false) { const r = w.dispatch({ target: 'clock', action: 'advance', input: step ? { steps: seconds / 10 } : { seconds } }); assert.equal(r.ok, true, JSON.stringify(r)); }
const ctx = { fail(code: string, message: string): never { throw Error(`${code}: ${message}`); } } as ReadContext;
const day70 = { elapsedSeconds: 70, dayIndex: 1, dayOfWeek: 1, secondOfDay: 10, secondsPerDay: 60, daysPerWeek: 3 };

// A second clock, off-by-one day arithmetic or saved calendar counters break these real projections.
test('both real clocks project the same day and week without calendar state or events', () => {
  for (const clock of ['time.continuous', 'time.step']) {
    const w = setup(clock), step = clock === 'time.step';
    assert.deepEqual(w.query('calendar', 'now'), { elapsedSeconds: 0, dayIndex: 0, dayOfWeek: 0, secondOfDay: 0, secondsPerDay: 60, daysPerWeek: 3 });
    advance(w, 70, step); assert.deepEqual(w.query('calendar', 'now'), day70);
    advance(w, 120, step); const before = w.snapshot();
    assert.deepEqual(w.query('calendar', 'now'), { elapsedSeconds: 190, dayIndex: 3, dayOfWeek: 0, secondOfDay: 10, secondsPerDay: 60, daysPerWeek: 3 });
    assert.deepEqual(w.read('calendar'), {}); assert.deepEqual(w.snapshot(), before);
  }
});
test('calendar rejects unsafe dimensions and malformed time from an ordinary public provider', () => {
  for (const config of [{ secondsPerDay: 0, daysPerWeek: 3 }, { secondsPerDay: 1.5, daysPerWeek: 3 }, { secondsPerDay: 60, daysPerWeek: Number.MAX_SAFE_INTEGER }, { secondsPerDay: 60, daysPerWeek: 3, extra: true }]) {
    const d = definition(); d.modules[1]!.config = config; assert.throws(() => createWorld(registry(), d));
  }
  for (const result of [null, [], {}, { elapsedSeconds: -1 }, { elapsedSeconds: '70' }, { elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }, { elapsedSeconds: 70, extra: true }]) {
    const d = definition(); d.modules[0] = { id: 'clock', module: 'test.time', config: { result } }; assert.throws(() => createWorld(registry(), d));
  }
});
test('public calendar reader rejects nonfinite, fractional, mismatched and unknown fields', () => {
  assert.deepEqual(readCalendar(ctx, day70), day70);
  for (const bad of [null, [], {}, { ...day70, elapsedSeconds: NaN }, { ...day70, elapsedSeconds: Infinity }, { ...day70, elapsedSeconds: Number.MAX_SAFE_INTEGER + 1 }, { ...day70, dayIndex: 1.5 }, { ...day70, dayOfWeek: 1.5 }, { ...day70, dayIndex: 2 }, { ...day70, dayOfWeek: 3 }, { ...day70, secondOfDay: 11 }, { ...day70, secondsPerDay: 1.5 }, { ...day70, daysPerWeek: Number.MAX_SAFE_INTEGER }, { ...day70, extra: true }]) assert.throws(() => readCalendar(ctx, bad));
});
// Inclusive opening / exclusive closing and next-cycle math are independently hand-calculated.
test('schedule follows half-open daily windows and returns exact next change across the rest day', () => {
  const w = setup(); let previous = 0;
  for (const [at, expected] of [
    [0, { open: false, opensInSeconds: 10, closesInSeconds: null }],
    [10, { open: true, opensInSeconds: 0, closesInSeconds: 40 }],
    [50, { open: false, opensInSeconds: 20, closesInSeconds: null }],
    [80, { open: true, opensInSeconds: 0, closesInSeconds: 30 }],
    [150, { open: false, opensInSeconds: 40, closesInSeconds: null }],
    [190, { open: true, opensInSeconds: 0, closesInSeconds: 40 }]
  ] as const) {
    if (at > previous) advance(w, at - previous); previous = at;
    const before = w.snapshot(); assert.deepEqual(w.query('shop', 'status'), expected); assert.deepEqual(w.snapshot(), before);
  }
});
test('fractional simulation seconds retain precise window boundaries and calendar remainders', () => {
  const w = setup('time.continuous', { days: [0], windows: [{ start: 0.25, end: 1.5 }] });
  assert.deepEqual(w.query('shop', 'status'), { open: false, opensInSeconds: 0.25, closesInSeconds: null });
  advance(w, 0.25); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 1.25 });
  assert.deepEqual(w.query('calendar', 'now'), { elapsedSeconds: 0.25, dayIndex: 0, dayOfWeek: 0, secondOfDay: 0.25, secondsPerDay: 60, daysPerWeek: 3 });
  advance(w, 1.25); assert.deepEqual(w.query('shop', 'status'), { open: false, opensInSeconds: 178.75, closesInSeconds: null });
});
test('unsorted adjacent windows and week-tail plus week-head form continuous openings', () => {
  const w = setup('time.continuous', { days: [2, 0], windows: [{ start: 40, end: 60 }, { start: 10, end: 20 }, { start: 0, end: 10 }] });
  advance(w, 165); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 35 });
  advance(w, 25); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 10 });
  advance(w, 10); assert.deepEqual(w.query('shop', 'status'), { open: false, opensInSeconds: 20, closesInSeconds: null });
});
test('whole-day openings cross selected days and a whole open period has no closing', () => {
  const w = setup('time.continuous', { days: [0, 2], windows: [{ start: 0, end: 60 }] });
  advance(w, 150); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 90 });
  const all = setup('time.continuous', { days: [2, 0, 1], windows: [{ start: 30, end: 60 }, { start: 0, end: 30 }] });
  assert.deepEqual(all.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: null });
  advance(all, Number.MAX_SAFE_INTEGER); assert.deepEqual(all.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: null });
});
test('large elapsed time and enormous week dimensions require only configured days', () => {
  const d = definition(); d.modules[1]!.config = { secondsPerDay: 1, daysPerWeek: Number.MAX_SAFE_INTEGER };
  d.modules[2]!.config = { days: [0], windows: [{ start: 0.25, end: 0.75 }] };
  const w = createWorld(registry(), d); advance(w, Number.MAX_SAFE_INTEGER - 1);
  assert.deepEqual(w.query('shop', 'status'), { open: false, opensInSeconds: 1.25, closesInSeconds: null });
});
test('invalid schedules reject ranges, duplicate days, overlapping windows and unknown fields', () => {
  const validWindow = [{ start: 10, end: 50 }];
  for (const schedule of [
    { days: [], windows: validWindow }, { days: [0, 0], windows: validWindow }, { days: [-1], windows: validWindow }, { days: [0.5], windows: validWindow }, { days: [3], windows: validWindow },
    { days: Array.from({ length: 129 }, (_, i) => i), windows: validWindow }, { days: [0], windows: [] }, { days: [0], windows: Array.from({ length: 129 }, (_, i) => ({ start: i / 10, end: i / 10 + 0.01 })) },
    { days: [0], windows: [{ start: 10, end: 10 }] }, { days: [0], windows: [{ start: 20, end: 10 }] }, { days: [0], windows: [{ start: -1, end: 10 }] }, { days: [0], windows: [{ start: 0, end: 61 }] },
    { days: [0], windows: [{ start: 0, end: 20 }, { start: 10, end: 30 }] }, { days: [0], windows: [{ start: 10, end: 50, extra: true }] }, { days: [0], windows: validWindow, extra: true }
  ]) assert.throws(() => setup('time.continuous', schedule));
});
test('schedule consumes and validates ordinary external calendar results', () => {
  const d = definition(); d.modules = [
    { id: 'calendar', module: 'test.calendar', config: { result: day70 } }, d.modules[2]!
  ];
  const w = createWorld(registry(), d); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: 40 });
  for (const result of [null, {}, { ...day70, dayIndex: 1.5 }, { ...day70, secondOfDay: 60 }, { ...day70, elapsedSeconds: 71 }]) {
    const bad = structuredClone(d); bad.modules[0]!.config.result = result; assert.throws(() => createWorld(registry(), bad));
  }
});
test('always operates without calendar and public availability reader rejects contradictory results', () => {
  const d: WorldDefinition = { id: 'always', title: '常开', version: '1', modules: [{ id: 'shop', module: 'availability.always', config: {} }] };
  const w = createWorld(registry(), d); assert.deepEqual(w.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: null });
  for (const good of [{ open: true, opensInSeconds: 0, closesInSeconds: 0.25 }, { open: true, opensInSeconds: 0, closesInSeconds: null }, { open: false, opensInSeconds: 0.5, closesInSeconds: null }]) assert.deepEqual(readAvailability(ctx, good), good);
  for (const bad of [null, [], {}, { open: 1, opensInSeconds: 0, closesInSeconds: null }, { open: true, opensInSeconds: 1, closesInSeconds: null }, { open: true, opensInSeconds: 0, closesInSeconds: 0 }, { open: false, opensInSeconds: 0, closesInSeconds: null }, { open: false, opensInSeconds: 1, closesInSeconds: 2 }, { open: true, opensInSeconds: 0, closesInSeconds: Infinity }, { open: false, opensInSeconds: NaN, closesInSeconds: null }, { open: false, opensInSeconds: Number.MAX_SAFE_INTEGER + 1, closesInSeconds: null }, { open: true, opensInSeconds: 0, closesInSeconds: null, extra: true }]) assert.throws(() => readAvailability(ctx, bad));
});
test('ordinary availability providers cannot pass contradictory status through the public reader', () => {
  for (const result of [{ open: false, opensInSeconds: 2, closesInSeconds: 1 }, { open: true, opensInSeconds: 1, closesInSeconds: null }]) {
    const w = createWorld(registry(), { id: 'consumer', title: '消费者', version: '1', modules: [
      { id: 'provider', module: 'test.availability', config: { result } }, { id: 'consumer', module: 'test.availability-consumer', config: {} }
    ] }); const before = w.snapshot(); assert.throws(() => w.query('consumer', 'status')); assert.deepEqual(w.snapshot(), before);
  }
});
test('availability swaps and restores only exact known empty states; calendar remains empty', () => {
  const d = definition(); d.modules[2] = { id: 'shop', module: 'availability.always', config: {} };
  const w = createWorld(registry(), d); const next = definition();
  const scheduled = reconfigureWorld(registry(), w, next); assert.deepEqual(scheduled.query('shop', 'status'), { open: false, opensInSeconds: 10, closesInSeconds: null });
  const back = reconfigureWorld(registry(), scheduled, d); assert.deepEqual(back.query('shop', 'status'), { open: true, opensInSeconds: 0, closesInSeconds: null });
  assert.deepEqual(restoreWorld(registry(), back.snapshot()).snapshot(), back.snapshot());
  for (const module of [availabilityAlwaysModule, availabilityScheduleModule, calendarModule]) {
    const valid: PreviousState = { moduleId: module.manifest.id, version: '1.0.0', stateVersion: 1, state: {} };
    assert.deepEqual(module.migrate!(valid, {}), {});
    for (const patch of [{ moduleId: 'unknown' }, { version: '1.0.1' }, { stateVersion: 2 }, { state: { history: [] } }, { state: null }, { state: [] }]) assert.throws(() => module.migrate!({ ...valid, ...patch }, {}));
    const source = module === calendarModule ? setup() : module === availabilityScheduleModule ? setup() : back;
    const saved = source.snapshot(); saved.modules[module === calendarModule ? 'calendar' : 'shop']!.state = { extra: 1 }; assert.throws(() => restoreWorld(registry(), saved));
  }
  assert.throws(() => back.query('shop', 'status', { extra: true })); assert.throws(() => back.query('calendar', 'now', { extra: true }));
});
