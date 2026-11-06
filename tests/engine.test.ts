import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, restoreWorld, reconfigureWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';

function counter(id = 'counter', options: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    manifest: { id, title: id, version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { count: '1.0.0' } },
    configSchema: { type: 'object', additionalProperties: false },
    stateSchema: { type: 'object', properties: { n: { type: 'integer', minimum: 0 } }, required: ['n'], additionalProperties: false },
    initialState: () => ({ n: 0 }),
    commands: {
      add: { schema: { type: 'object', properties: { n: { type: 'integer', minimum: 0 } }, required: ['n'], additionalProperties: false }, execute(ctx, input) { const s = ctx.state<{ n: number }>(); s.n += input.n as number; ctx.write(s); return s.n; } },
      bad: { execute(ctx) { ctx.write({ n: -1 }); return null; } },
      emit: { execute(ctx) { ctx.emit('tick'); return null; } },
      recurse: { execute(ctx) { return ctx.call('count', 'recurse'); } },
    },
    queries: {
      value: { execute: ctx => ctx.state<JsonObject>().n! },
      mutate: { execute(ctx) { const s = ctx.state<{ n: number }>(); s.n = 999; return s.n; } },
      recurse: { execute: ctx => ctx.query('count', 'recurse') },
    },
    ...options,
  };
}
function definition(modules: WorldDefinition['modules'] = [{ id: 'a', module: 'counter', config: {} }]): WorldDefinition {
  return { id: 'test', title: 'Test', version: '1.0.0', modules };
}
function code(expected: string) { return (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === expected; }
function failure(result: ReturnType<ReturnType<typeof createWorld>['dispatch']>, expected: string) {
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, expected);
}

test('registry validates manifests, schemas, duplicates, and accepts arbitrary module identifiers', () => {
  assert.throws(() => new ModuleRegistry([counter(), counter()]), code('DUPLICATE_MODULE'));
  assert.throws(() => new ModuleRegistry([counter('x', { manifest: { ...counter().manifest, version: 'oops' } })]), code('INVALID_MANIFEST'));
  assert.throws(() => new ModuleRegistry([counter('x', { stateSchema: { type: 'nonsense' } })]), code('INVALID_SCHEMA'));
  const module = counter('external.unanticipated');
  const world = createWorld(new ModuleRegistry([module]), definition([{ id: 'custom', module: module.manifest.id, config: {} }]));
  assert.deepEqual(world.read('custom'), { n: 0 });
});

test('capability resolution rejects missing, incompatible, ambiguous and bad explicit bindings', () => {
  const consumer = counter('consumer', { manifest: { ...counter().manifest, id: 'consumer', provides: {}, requires: { count: { version: '^1.0.0' } } } });
  const registry = new ModuleRegistry([counter(), counter('other'), consumer]);
  const c = { id: 'c', module: 'consumer', config: {} };
  assert.throws(() => createWorld(registry, definition([c])), code('MISSING_CAPABILITY'));
  assert.throws(() => createWorld(registry, definition([c, { id: 'a', module: 'counter', config: {} }, { id: 'b', module: 'other', config: {} }])), code('AMBIGUOUS_CAPABILITY'));
  assert.throws(() => createWorld(registry, definition([{ ...c, bindings: { absent: 'a' } }, { id: 'a', module: 'counter', config: {} }])), code('UNKNOWN_BINDING'));
  const old = counter('old', { manifest: { ...counter().manifest, id: 'old', provides: { count: '0.1.0' } } });
  assert.throws(() => createWorld(new ModuleRegistry([consumer, old]), definition([c, { id: 'a', module: 'old', config: {} }])), code('INCOMPATIBLE_CAPABILITY'));
  const w = createWorld(registry, definition([{ ...c, bindings: { count: 'b' } }, { id: 'a', module: 'counter', config: {} }, { id: 'b', module: 'other', config: {} }]));
  assert.equal(w.dispatch({ target: 'c', action: 'add', input: { n: 2 } }).ok, true);
});

test('instance bindings, provider source, optional dependencies, conflicts and duplicates', () => {
  const consumer = counter('consumer', {
    manifest: { ...counter().manifest, id: 'consumer', provides: {}, requires: { count: { version: '*' }, absent: { version: '*', optional: true } } },
    queries: { provider: { execute: ctx => ({ provider: ctx.provider('count')!, optional: ctx.has('absent'), missing: ctx.provider('absent') ?? null }) } },
    commands: { add: { execute: ctx => ctx.call('count', 'add', { n: 1 }) } },
  });
  const registry = new ModuleRegistry([counter(), consumer]);
  const w = createWorld(registry, definition([{ id: 'a', module: 'counter', config: {} }, { id: 'b', module: 'counter', config: {} }, { id: 'c', module: 'consumer', config: {}, bindings: { count: 'b' } }]));
  assert.deepEqual(w.query('c', 'provider'), { provider: 'b', optional: false, missing: null });
  w.dispatch({ target: 'c', action: 'add' });
  assert.deepEqual(w.read('a'), { n: 0 }); assert.deepEqual(w.read('b'), { n: 1 });
  assert.throws(() => createWorld(registry, definition([{ id: 'a', module: 'counter', config: {} }, { id: 'a', module: 'counter', config: {} }])), code('DUPLICATE_INSTANCE'));
  const conflict = counter('conflict', { manifest: { ...counter().manifest, id: 'conflict', conflicts: ['counter'] } });
  assert.throws(() => createWorld(new ModuleRegistry([counter(), conflict]), definition([{ id: 'a', module: 'counter', config: {} }, { id: 'b', module: 'conflict', config: {} }])), code('MODULE_CONFLICT'));
});

test('nested calls share a transaction and failures roll back every state and revision', () => {
  const caller = counter('caller', {
    manifest: { ...counter().manifest, id: 'caller', provides: {}, requires: { count: { version: '*' } } },
    commands: { fail: { execute(ctx) { ctx.write({ n: 3 }); ctx.call('count', 'add', { n: 4 }); ctx.fail('STOP', 'stop'); } } },
  });
  const w = createWorld(new ModuleRegistry([counter(), caller]), definition([{ id: 'a', module: 'counter', config: {} }, { id: 'c', module: 'caller', config: {} }]));
  const before = w.snapshot();
  failure(w.dispatch({ id: 'failed', target: 'c', action: 'fail' }), 'STOP');
  assert.deepEqual(w.snapshot(), before);
  failure(w.dispatch({ target: 'a', action: 'bad' }), 'INVALID_STATE');
  assert.deepEqual(w.snapshot(), before);
});

test('queries, reads, definitions, results and snapshots are detached from authoritative state', () => {
  const w = createWorld(new ModuleRegistry([counter()]), definition());
  assert.equal(w.query('a', 'mutate'), 999); assert.deepEqual(w.read('a'), { n: 0 });
  const s = w.read('a') as JsonObject; s.n = 90;
  const d = w.definition; d.modules[0]!.config.extra = true;
  const snapshot = w.snapshot(); snapshot.modules.a!.state = { n: 200 };
  assert.deepEqual(w.read('a'), { n: 0 }); assert.deepEqual(w.definition.modules[0]!.config, {});
  const noWrites = counter('read-only', { queries: { check: { execute(ctx) { assert.equal('write' in ctx, false); assert.equal('emit' in ctx, false); assert.equal('call' in ctx, false); return null; } } } });
  createWorld(new ModuleRegistry([noWrites]), definition([{ id: 'a', module: 'read-only', config: {} }])).query('a', 'check');
});

test('canonical receipts replay, reject mismatches, preserve return isolation and evict at 128', () => {
  const w = createWorld(new ModuleRegistry([counter()]), definition());
  const cmd = { id: 'one', target: 'a', action: 'add', input: { n: 1 } };
  const result = w.dispatch(cmd); assert.equal(result.ok, true);
  assert.deepEqual(w.dispatch(cmd), { ...result, replayed: true });
  failure(w.dispatch({ ...cmd, input: { n: 2 } }), 'DUPLICATE_COMMAND');
  assert.equal(w.revision, 1);
  for (let i = 0; i < 130; i++) assert.equal(w.dispatch({ ...cmd, id: `id-${i}` }).ok, true);
  assert.equal(w.snapshot().receipts.length, 128);
  assert.equal(w.dispatch(cmd).ok, true); assert.equal(w.revision, 132);
  w.dispatch({ target: 'a', action: 'add', input: { n: 1 } }); w.dispatch({ target: 'a', action: 'add', input: { n: 1 } });
  assert.equal(w.revision, 134);
});

test('event handler errors and event storms roll back cursor, state, receipts and revision', () => {
  const failing = counter('counter', { events: { tick(ctx) { ctx.write({ n: 5 }); ctx.fail('EVENT_FAIL', 'event failed'); } } });
  const w = createWorld(new ModuleRegistry([failing]), definition()); const before = w.snapshot();
  failure(w.dispatch({ id: 'event', target: 'a', action: 'emit' }), 'EVENT_FAIL'); assert.deepEqual(w.snapshot(), before);
  const storm = counter('counter', { events: { tick(ctx) { ctx.emit('tick'); } } });
  const s = createWorld(new ModuleRegistry([storm]), definition());
  failure(s.dispatch({ id: 'storm', target: 'a', action: 'emit' }), 'EVENT_LIMIT'); assert.equal(s.revision, 0); assert.equal(s.snapshot().eventSequence, 0);
});

test('events have deterministic source, order and committed revision', () => {
  const m = counter('counter', { events: { tick(ctx, event) { const s = ctx.state<{ n: number }>(); s.n++; ctx.write(s); if (event.source === 'a') ctx.emit('done', { seen: ctx.self }); } } });
  const w = createWorld(new ModuleRegistry([m]), definition([{ id: 'a', module: 'counter', config: {} }, { id: 'b', module: 'counter', config: {} }]));
  const r = w.dispatch({ target: 'a', action: 'emit' }); assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.events.map(e => [e.type, e.source, e.sequence, e.revision]), [['tick', 'a', 1, 1], ['done', 'a', 2, 1], ['done', 'b', 3, 1]]);
});

test('cycles are allowed at assembly while actual nested commands and queries have bounded depth', () => {
  const cyclic = counter('counter', { manifest: { ...counter().manifest, requires: { count: { version: '*' } } } });
  const w = createWorld(new ModuleRegistry([cyclic]), definition());
  failure(w.dispatch({ target: 'a', action: 'recurse' }), 'CALL_DEPTH');
  assert.throws(() => w.query('a', 'recurse'), code('CALL_DEPTH')); assert.equal(w.revision, 0);
});

test('snapshot restore round-trips state, events, revision and receipt replay', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  w.dispatch({ id: 'x', target: 'a', action: 'add', input: { n: 2 } }); w.dispatch({ target: 'a', action: 'emit' });
  const restored = restoreWorld(registry, w.snapshot()); assert.deepEqual(restored.snapshot(), w.snapshot());
  assert.equal(restored.dispatch({ id: 'x', target: 'a', action: 'add', input: { n: 2 } }).ok, true); assert.equal(restored.revision, 2);
});

test('snapshot corruption, unknown/missing saved modules, missing code and changed code require explicit migration', () => {
  const registry = new ModuleRegistry([counter()]); const s = createWorld(registry, definition()).snapshot();
  assert.throws(() => restoreWorld(new ModuleRegistry(), s), code('UNKNOWN_MODULE'));
  const missing = structuredClone(s); delete missing.modules.a; assert.throws(() => restoreWorld(registry, missing), code('INVALID_SNAPSHOT'));
  const extra = structuredClone(s); extra.modules.extra = extra.modules.a!; assert.throws(() => restoreWorld(registry, extra), code('INVALID_SNAPSHOT'));
  const bad = structuredClone(s); bad.modules.a!.state = { n: -1 }; assert.throws(() => restoreWorld(registry, bad), code('INVALID_STATE'));
  const version = structuredClone(s); version.modules.a!.definitionVersion = '0.5.0'; assert.throws(() => restoreWorld(registry, version), code('MIGRATION_REQUIRED'));
});

test('reconfiguration preserves original on failed migration, explicit removals and config validation', () => {
  const old = counter('old'); const replacement = counter('new', { migrate() { throw new Error('cannot migrate'); } });
  const registry = new ModuleRegistry([old, replacement]);
  const w = createWorld(registry, definition([{ id: 'a', module: 'old', config: {} }])); w.dispatch({ id: 'x', target: 'a', action: 'add', input: { n: 3 } });
  const before = w.snapshot();
  assert.throws(() => reconfigureWorld(registry, w, definition([{ id: 'a', module: 'new', config: {} }])), code('MIGRATION_FAILED'));
  assert.deepEqual(w.snapshot(), before);
  assert.throws(() => reconfigureWorld(registry, w, definition([])), code('REMOVAL_NOT_ALLOWED'));
  const empty = reconfigureWorld(registry, w, definition([]), { allowRemoved: ['a'] }); assert.deepEqual(empty.snapshot().modules, {}); assert.equal(empty.snapshot().receipts.length, 0);
  assert.deepEqual(w.snapshot(), before);
  assert.throws(() => reconfigureWorld(registry, w, { ...definition([]), id: 'different' }, { allowRemoved: ['a'] }), code('WORLD_ID_MISMATCH'));
});

test('explicit migration runs for changed identity/version/format, then schema and validate hooks run', () => {
  const old = counter('old'); const newer = counter('new', {
    manifest: { ...counter().manifest, id: 'new', version: '2.0.0', stateVersion: 2 },
    migrate(previous) { return { n: (previous.state as JsonObject).n as number + 1 }; },
    validate(ctx) { if ((ctx.state<JsonObject>().n as number) > 10) ctx.fail('TOO_LARGE', 'too large'); },
  });
  const registry = new ModuleRegistry([old, newer]); const w = createWorld(registry, definition([{ id: 'a', module: 'old', config: {} }]));
  w.dispatch({ target: 'a', action: 'add', input: { n: 2 } });
  const next = reconfigureWorld(registry, w, definition([{ id: 'a', module: 'new', config: {} }])); assert.deepEqual(next.read('a'), { n: 3 });
  const bad = w.snapshot(); bad.modules.a!.definitionId = 'other';
  const migrationRegistry = new ModuleRegistry([counter('old', { migrate: () => ({ n: -1 }) })]);
  assert.throws(() => restoreWorld(migrationRegistry, bad), code('INVALID_STATE'));
});

test('unsafe JSON and input/config/initial/commit schema errors reject without partial writes', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  for (const input of [{ n: NaN }, { n: Infinity }, { n: undefined }, { n: 1n }, JSON.parse('{"__proto__":{"polluted":true}}'), { n: 1, date: new Date() }]) {
    failure(w.dispatch({ target: 'a', action: 'add', input: input as unknown as JsonObject }), 'INVALID_JSON');
  }
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  failure(w.dispatch({ target: 'a', action: 'add', input: cycle as JsonObject }), 'INVALID_JSON');
  const accessor = Object.defineProperty({}, 'n', { get() { throw new Error('getter must not execute'); }, enumerable: true });
  failure(w.dispatch({ target: 'a', action: 'add', input: accessor }), 'INVALID_JSON');
  failure(w.dispatch({ target: 'a', action: 'add', input: { n: -1 } }), 'INVALID_INPUT');
  assert.throws(() => createWorld(registry, definition([{ id: 'a', module: 'counter', config: { extra: 1 } }])), code('INVALID_CONFIG'));
  assert.throws(() => createWorld(new ModuleRegistry([counter('counter', { initialState: () => ({ n: -1 }) })]), definition()), code('INVALID_STATE'));
  assert.equal(w.revision, 0); assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('initial, restored and committed cross-module validation is pure and atomic', () => {
  const m = counter('counter', { validate(ctx) { const s = ctx.state<{ n: number }>(); if (s.n > 2) ctx.fail('LIMIT', 'limit'); s.n = 1000; } });
  const registry = new ModuleRegistry([m]); const w = createWorld(registry, definition());
  assert.deepEqual(w.read('a'), { n: 0 }); failure(w.dispatch({ target: 'a', action: 'add', input: { n: 3 } }), 'LIMIT'); assert.deepEqual(w.read('a'), { n: 0 });
  const s = w.snapshot(); s.modules.a!.state = { n: 3 }; assert.throws(() => restoreWorld(registry, s), code('LIMIT'));
});

test('registry rejects asynchronous schemas and explicit null schemas', () => {
  assert.throws(() => new ModuleRegistry([counter('counter', { stateSchema: { $async: true, type: 'object' } })]), code('INVALID_SCHEMA'));
  assert.throws(() => new ModuleRegistry([counter('counter', { configSchema: null as unknown as Record<string, unknown> })]), code('INVALID_SCHEMA'));
});

test('caught explicit abort and nested query failure still poison the whole transaction', () => {
  const m = counter('counter', {
    manifest: { ...counter().manifest, requires: { count: { version: '*' } } },
    commands: {
      caughtFail: { execute(ctx) { try { ctx.fail('ABORT', 'abort'); } catch {} ctx.write({ n: 1 }); return null; } },
      caughtQuery: { execute(ctx) { try { ctx.query('count', 'no-such-query'); } catch {} ctx.write({ n: 1 }); return null; } },
    },
  });
  const w = createWorld(new ModuleRegistry([m]), definition());
  failure(w.dispatch({ target: 'a', action: 'caughtFail' }), 'ABORT');
  failure(w.dispatch({ target: 'a', action: 'caughtQuery' }), 'UNKNOWN_QUERY');
  assert.equal(w.revision, 0); assert.deepEqual(w.read('a'), { n: 0 });
});

test('context inputs are frozen, retained execution contexts close, and events/results detach', () => {
  let retained: import('../src/contracts.ts').ExecutionContext | undefined;
  const m = counter('counter', {
    commands: {
      capture: { execute(ctx, input) { retained = ctx; assert.equal(Object.isFrozen(input), true); assert.equal(Object.isFrozen(ctx.config), true); ctx.emit('data', { nested: { n: 1 } }); return { nested: { n: 1 } }; } },
    },
  });
  const w = createWorld(new ModuleRegistry([m]), definition());
  const r = w.dispatch({ id: 'captured', target: 'a', action: 'capture' });
  assert.equal(r.ok, true);
  assert.throws(() => retained!.write({ n: 99 }), code('TRANSACTION_CLOSED'));
  if (r.ok) { (r.value as JsonObject).nested = 99; r.events[0]!.payload.nested = 99; }
  const replay = w.dispatch({ id: 'captured', target: 'a', action: 'capture' });
  if (replay.ok) { assert.deepEqual(replay.value, { nested: { n: 1 } }); assert.deepEqual(replay.events[0]!.payload, { nested: { n: 1 } }); }
  assert.deepEqual(w.read('a'), { n: 0 });
});

test('restore validates receipt structure, canonical fingerprint and cursor consistency', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  w.dispatch({ id: 'event', target: 'a', action: 'emit' }); const snapshot = w.snapshot();
  const duplicate = structuredClone(snapshot); duplicate.receipts.push(duplicate.receipts[0]!);
  assert.throws(() => restoreWorld(registry, duplicate), code('INVALID_SNAPSHOT'));
  const cursor = structuredClone(snapshot); cursor.receipts[0]!.result.events[0]!.sequence = 2;
  assert.throws(() => restoreWorld(registry, cursor), code('INVALID_SNAPSHOT'));
  const fingerprint = structuredClone(snapshot); fingerprint.receipts[0]!.fingerprint = '{ "action": "emit", "input": {}, "target": "a" }';
  assert.throws(() => restoreWorld(registry, fingerprint), code('INVALID_SNAPSHOT'));
  const impossible = structuredClone(snapshot); impossible.revision = 0; impossible.receipts = [];
  assert.throws(() => restoreWorld(registry, impossible), code('INVALID_SNAPSHOT'));
});

test('restore migration preserves successful receipts even when new code removes an old command', () => {
  const oldRegistry = new ModuleRegistry([counter()]); const w = createWorld(oldRegistry, definition());
  const command = { id: 'historic', target: 'a', action: 'add', input: { n: 2 } };
  const result = w.dispatch(command);
  const migratedCode = counter('counter', {
    manifest: { ...counter().manifest, version: '2.0.0' },
    commands: {}, migrate: previous => previous.state,
  });
  const restored = restoreWorld(new ModuleRegistry([migratedCode]), w.snapshot());
  assert.deepEqual(restored.dispatch(command), { ...result, replayed: true });
  assert.deepEqual(restored.read('a'), { n: 2 });
});

test('receipt history rejects a head cursor beyond its complete emitted event list', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  w.dispatch({ id: 'event', target: 'a', action: 'emit' });
  const snapshot = w.snapshot(); snapshot.eventSequence = 2;
  assert.throws(() => restoreWorld(registry, snapshot), code('INVALID_SNAPSHOT'));
});

test('receipt history rejects impossible initial, consecutive and no-event cursor gaps', () => {
  const registry = new ModuleRegistry([counter()]);
  const start = createWorld(registry, definition()); start.dispatch({ id: 'first', target: 'a', action: 'emit' });
  const shiftedStart = start.snapshot(); shiftedStart.receipts[0]!.result.events[0]!.sequence = 2; shiftedStart.eventSequence = 2;
  assert.throws(() => restoreWorld(registry, shiftedStart), code('INVALID_SNAPSHOT'));
  start.dispatch({ id: 'second', target: 'a', action: 'emit' });
  const consecutive = start.snapshot(); consecutive.receipts[1]!.result.events[0]!.sequence = 3; consecutive.eventSequence = 3;
  assert.throws(() => restoreWorld(registry, consecutive), code('INVALID_SNAPSHOT'));
  start.dispatch({ id: 'zero', target: 'a', action: 'add', input: { n: 0 } });
  const zeroHead = start.snapshot(); zeroHead.eventSequence++;
  assert.throws(() => restoreWorld(registry, zeroHead), code('INVALID_SNAPSHOT'));
  const noEvents = createWorld(registry, definition());
  noEvents.dispatch({ id: 'zero', target: 'a', action: 'add', input: { n: 0 } });
  const zeroStart = noEvents.snapshot(); zeroStart.eventSequence = 1;
  assert.throws(() => restoreWorld(registry, zeroStart), code('INVALID_SNAPSHOT'));
});

test('receipt history bounds genuinely unreceipted gaps before, between and after complete receipts', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  w.dispatch({ target: 'a', action: 'emit' });
  w.dispatch({ id: 'a', target: 'a', action: 'emit' });
  w.dispatch({ id: 'zero', target: 'a', action: 'add', input: { n: 0 } });
  w.dispatch({ target: 'a', action: 'emit' });
  w.dispatch({ id: 'b', target: 'a', action: 'emit' });
  w.dispatch({ target: 'a', action: 'emit' });
  const snapshot = w.snapshot();
  assert.deepEqual(restoreWorld(registry, snapshot).snapshot(), snapshot);
  const excessiveMiddle = structuredClone(snapshot);
  excessiveMiddle.receipts[2]!.result.events[0]!.sequence = 1028; excessiveMiddle.eventSequence = 1028;
  assert.throws(() => restoreWorld(registry, excessiveMiddle), code('INVALID_SNAPSHOT'));
  const excessiveTail = structuredClone(snapshot); excessiveTail.eventSequence = 1029;
  assert.throws(() => restoreWorld(registry, excessiveTail), code('INVALID_SNAPSHOT'));
  const excessivePrefix = structuredClone(snapshot);
  excessivePrefix.receipts = [excessivePrefix.receipts[0]!]; excessivePrefix.receipts[0]!.result.events[0]!.sequence = 1026; excessivePrefix.eventSequence = 1026;
  assert.throws(() => restoreWorld(registry, excessivePrefix), code('INVALID_SNAPSHOT'));
  const unreceipted = createWorld(registry, definition()); unreceipted.dispatch({ target: 'a', action: 'emit' });
  assert.deepEqual(restoreWorld(registry, unreceipted.snapshot()).snapshot(), unreceipted.snapshot());
});

test('receipt history permits zero-event anchors with unknown gaps and evicted receipt prefixes', () => {
  const registry = new ModuleRegistry([counter()]); const w = createWorld(registry, definition());
  w.dispatch({ target: 'a', action: 'emit' });
  w.dispatch({ id: 'zero', target: 'a', action: 'add', input: { n: 0 } });
  w.dispatch({ target: 'a', action: 'emit' });
  w.dispatch({ id: 'zero-2', target: 'a', action: 'add', input: { n: 0 } });
  assert.deepEqual(restoreWorld(registry, w.snapshot()).snapshot(), w.snapshot());
  for (let i = 0; i < 130; i++) w.dispatch({ id: `emit-${i}`, target: 'a', action: 'emit' });
  assert.equal(w.snapshot().receipts.length, 128);
  assert.deepEqual(restoreWorld(registry, w.snapshot()).snapshot(), w.snapshot());
});

test('explicit capability bindings distinguish inherited and own toString properties', () => {
  const consumer = counter('consumer', {
    manifest: { ...counter().manifest, id: 'consumer', provides: {}, requires: { toString: { version: '*' } } },
    queries: { provider: { execute: ctx => ctx.provider('toString') ?? null } },
  });
  const missing = counter('missing', { manifest: { ...counter().manifest, id: 'missing', provides: {} } });
  const own = counter('own', { manifest: { ...counter().manifest, id: 'own', provides: { toString: '1.0.0' } } });
  const registry = new ModuleRegistry([consumer, missing, own]);
  const consumerInstance = { id: 'c', module: 'consumer', config: {}, bindings: { toString: 'p' } };
  assert.throws(() => createWorld(registry, definition([consumerInstance, { id: 'p', module: 'missing', config: {} }])), code('INCOMPATIBLE_CAPABILITY'));
  const world = createWorld(registry, definition([consumerInstance, { id: 'p', module: 'own', config: {} }]));
  assert.equal(world.query('c', 'provider'), 'p');
  const automatic = createWorld(registry, definition([{ ...consumerInstance, bindings: {} }, { id: 'p', module: 'own', config: {} }]));
  assert.equal(automatic.query('c', 'provider'), 'p');
});
