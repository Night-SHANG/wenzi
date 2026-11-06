import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorldPackage, cloneWorldPackage, inspectWorldPackage } from '../src/authoring/packages.ts';
import { ModuleRegistry } from '../src/engine/index.ts';
import type { Command, ModuleDefinition } from '../src/contracts.ts';
import { builtinRegistry } from '../src/catalog.ts';
import { loadWorldPackage } from '../src/worlds.ts';

const empty = () => ({ format: 1, world: { id: 'empty', title: 'Empty', version: '1.0.0', modules: [] }, demo: [] });

test('strict package parser rejects unknown, absent, malformed and non-JSON data', () => {
  for (const value of [null, [], {}, { ...empty(), extra: true }, { ...empty(), format: 2 }, { ...empty(), demo: [{ target: 'x', action: 'y', extra: 1 }] }, { ...empty(), world: { ...empty().world, extra: true } }, { ...empty(), demo: [{ target: '', action: 'x' }] }]) assert.throws(() => parseWorldPackage(value));
  const inherited = Object.create({ format: 1, world: empty().world, demo: [] });
  assert.throws(() => parseWorldPackage(inherited));
  let accessed = false;
  assert.throws(() => parseWorldPackage({ ...empty(), get demo() { accessed = true; return []; } }));
  assert.equal(accessed, false);
  assert.deepEqual(parseWorldPackage(empty()), empty());
});

test('clone changes only requested identity and detaches config, bindings and demo', async () => {
  const source = await loadWorldPackage('farm');
  const before = structuredClone(source);
  const clone = cloneWorldPackage(source, { id: 'my-farm' });
  assert.equal(clone.world.id, 'my-farm');
  assert.equal(clone.world.title, source.world.title);
  assert.equal(clone.world.version, source.world.version);
  assert.deepEqual(clone.world.modules, source.world.modules);
  assert.deepEqual(clone.demo, source.demo);
  clone.world.modules[0]!.config.changed = true;
  clone.demo.push({ target: 'any', action: 'any' });
  assert.deepEqual(source, before);
  assert.equal(cloneWorldPackage(source, { id: 'other', title: 'Other', version: '2.0.0' }).world.title, 'Other');
  assert.throws(() => cloneWorldPackage(source, { id: '' }));
});

test('structural parsing and clone do not assemble or resolve modules', () => {
  const source = { ...empty(), world: { ...empty().world, modules: [{ id: 'a', module: 'not-installed', config: {} }] } };
  assert.equal(parseWorldPackage(source).world.modules.length, 1);
  assert.equal(cloneWorldPackage(source, { id: 'new' }).world.id, 'new');
  const result = inspectWorldPackage(new ModuleRegistry(), source);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.stage, 'assembly'); assert.equal(result.error.code, 'UNKNOWN_MODULE'); }
});

test('inspection reports package failures and validates/restores built-in worlds with optional demo', async () => {
  const malformed = inspectWorldPackage(new ModuleRegistry(), {});
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.stage, 'package');
  for (const name of ['farm', 'tactics', 'story']) {
    const source = await loadWorldPackage(name);
    const before = structuredClone(source);
    const initial = inspectWorldPackage(builtinRegistry(), source);
    assert.equal(initial.ok, true);
    if (initial.ok) { assert.deepEqual(initial.demo, { executed: false, steps: 0, finalRevision: 0 }); assert.equal(initial.restored, true); assert.equal(initial.worldId, source.world.id); assert.equal(initial.moduleCount, source.world.modules.length); assert.ok(initial.actions.length); }
    const exercised = inspectWorldPackage(builtinRegistry(), source, { runDemo: true });
    assert.equal(exercised.ok, true);
    if (exercised.ok) { assert.equal(exercised.demo.executed, true); assert.equal(exercised.demo.steps, source.demo.length); assert.equal(exercised.demo.finalRevision, source.demo.length); assert.equal(exercised.restored, true); }
    assert.deepEqual(source, before);
  }
});

function fixture(mode: 'initial' | 'final' | 'restore' | 'normal') {
  let validations = 0;
  const module: ModuleDefinition = {
    manifest: { id: 'fixture', title: 'Fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {} },
    initialState: () => ({ changed: false }),
    commands: { change: { execute(ctx) { ctx.write({ changed: true }); return null; } }, fail: { execute(ctx) { return ctx.fail('DEMO_FAILED', 'fixture failure'); } } },
    queries: { view: { execute(ctx) { const state = ctx.state<{ changed: boolean }>(); return mode === 'initial' || mode === 'final' && state.changed ? { title: 'Bad', lines: [42] } : { title: 'Good', lines: [state.changed ? 'after' : 'before'] }; } } },
    validate() { if (mode === 'restore' && ++validations === 2) throw new Error('restore rejected'); },
  };
  const source = { ...empty(), world: { ...empty().world, modules: [{ id: 'one', module: 'fixture', config: {} }], entryView: { instance: 'one', query: 'view' } }, demo: [{ target: 'one', action: 'change' }] as Command[] };
  return { registry: new ModuleRegistry([module]), source };
}

test('inspection checks initial/final views and identifies the failed second demo step', () => {
  for (const mode of ['initial', 'final'] as const) {
    const { registry, source } = fixture(mode);
    const result = inspectWorldPackage(registry, source, { runDemo: true });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.stage, 'view');
  }
  const { registry, source } = fixture('normal');
  source.demo.push({ target: 'one', action: 'fail' });
  const result = inspectWorldPackage(registry, source, { runDemo: true });
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.stage, 'demo'); assert.equal(result.step, 2); assert.equal(result.error.code, 'DEMO_FAILED'); }
});

test('inspection separates restoration errors and returns the final text view', () => {
  const broken = fixture('restore');
  const result = inspectWorldPackage(broken.registry, broken.source);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, 'restore');
  const good = fixture('normal');
  const inspected = inspectWorldPackage(good.registry, good.source, { runDemo: true });
  assert.equal(inspected.ok, true);
  if (inspected.ok) assert.deepEqual(inspected.view, { title: 'Good', lines: ['after'] });
});


test('inspection preserves explicit demo ids and assigns stable ids to omitted ones', () => {
  const explicit = fixture('normal');
  explicit.source.demo = [
    { id: 'keep-this-id', target: 'one', action: 'change' },
    { id: 'keep-this-id', target: 'one', action: 'change' },
  ];
  const result = inspectWorldPackage(explicit.registry, explicit.source, { runDemo: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.demo, { executed: true, steps: 2, finalRevision: 1 });
  const inferred = fixture('normal');
  inferred.source.demo.push({ id: 'demo-1', target: 'one', action: 'fail' });
  const collision = inspectWorldPackage(inferred.registry, inferred.source, { runDemo: true });
  assert.equal(collision.ok, false);
  if (!collision.ok) { assert.equal(collision.stage, 'demo'); assert.equal(collision.step, 2); assert.equal(collision.error.code, 'DUPLICATE_COMMAND'); }
});
