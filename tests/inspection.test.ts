import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../src/engine/index.ts';
import type { Command, ModuleDefinition, ModuleDescriptor, WorldDefinition } from '../src/contracts.ts';

function module(id = 'example'): ModuleDefinition {
  return {
    manifest: { id, title: id, version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {} },
    initialState: () => ({}),
  };
}
function catalog(registry: engine.ModuleRegistry): ModuleDescriptor[] {
  const api = registry as engine.ModuleRegistry & { catalog?: () => ModuleDescriptor[] };
  assert.equal(typeof api.catalog, 'function', 'ModuleRegistry.catalog must expose registration metadata');
  return api.catalog!();
}
function parser<T>(name: 'parseWorldDefinition' | 'parseCommand'): (value: unknown) => T {
  const api = engine as unknown as Record<string, unknown>;
  assert.equal(typeof api[name], 'function', `${name} must expose structural validation`);
  return api[name] as (value: unknown) => T;
}
function world(): WorldDefinition {
  return { id: 'draft', title: 'Draft', version: '1.0.0', modules: [{ id: 'one', module: 'unregistered', config: { nested: { n: 1 } }, bindings: { optional: 'later' } }], entryView: { instance: 'one', query: 'view' } };
}
function code(expected: string) {
  return (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === expected;
}

test('catalog discovers metadata, schema defaults, sorted module and event names without executing hooks', () => {
  const forbidden = () => { throw new Error('Module hooks must not execute during inspection'); };
  const rich: ModuleDefinition = {
    ...module('zeta'),
    configSchema: { type: 'object', required: ['seed'], properties: { seed: { type: 'integer' } } },
    stateSchema: { type: 'object', properties: { ready: { type: 'boolean' } } },
    initialState: forbidden,
    commands: { set: { schema: { type: 'object', required: ['value'], properties: { value: { type: 'number' } } }, execute: forbidden }, reset: { execute: forbidden } },
    queries: { view: { schema: { type: 'object', properties: { detail: { type: 'boolean' } } }, execute: forbidden }, status: { execute: forbidden } },
    events: { zed: forbidden, alpha: forbidden }, validate: forbidden, migrate: forbidden,
  };
  const result = catalog(new engine.ModuleRegistry([rich, module('alpha')]));
  assert.deepEqual(result, [
    { manifest: { id: 'alpha', title: 'alpha', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {} }, commands: {}, queries: {}, events: [], supportsMigration: false },
    {
      manifest: { id: 'zeta', title: 'zeta', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: {} },
      configSchema: { type: 'object', required: ['seed'], properties: { seed: { type: 'integer' } } },
      stateSchema: { type: 'object', properties: { ready: { type: 'boolean' } } },
      commands: { set: { schema: { type: 'object', required: ['value'], properties: { value: { type: 'number' } } } }, reset: { schema: { type: 'object' } } },
      queries: { view: { schema: { type: 'object', properties: { detail: { type: 'boolean' } } } }, status: { schema: { type: 'object' } } },
      events: ['alpha', 'zed'], supportsMigration: true,
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(catalog(new engine.ModuleRegistry()), []);
});

test('catalog captures schemas and manifest at registration and isolates every returned nested value', () => {
  const definition: ModuleDefinition = {
    ...module(), configSchema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } },
    stateSchema: { type: 'object' },
    commands: { act: { schema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } }, execute: () => null } },
    queries: { view: { schema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } }, execute: () => null } },
    events: { tick() {} }, migrate: previous => previous.state,
  };
  const registry = new engine.ModuleRegistry([definition]);
  const expected = catalog(registry);
  definition.manifest.title = 'changed';
  (definition.configSchema!.required as string[]).push('later');
  definition.stateSchema!.type = 'array';
  (definition.commands!.act!.schema!.required as string[]).push('later');
  (definition.queries!.view!.schema!.required as string[]).push('later');
  definition.events!.later = () => {};
  delete definition.migrate;
  assert.deepEqual(catalog(registry), expected);
  const returned = catalog(registry)[0]!;
  returned.manifest.provides.extra = '1.0.0';
  (returned.configSchema!.required as string[]).push('caller');
  returned.stateSchema!.type = 'null';
  (returned.commands.act!.schema.required as string[]).push('caller');
  (returned.queries.view!.schema.required as string[]).push('caller');
  returned.events.push('caller');
  assert.deepEqual(catalog(registry), expected);
  const runtime = engine.createWorld(registry, { id: 'test', title: 'Test', version: '1.0.0', modules: [{ id: 'one', module: 'example', config: { n: 1 } }] });
  assert.equal(runtime.dispatch({ target: 'one', action: 'act', input: { n: 1 } }).ok, true);
  assert.equal(runtime.query('one', 'view', { n: 1 }), null);
  assert.throws(() => runtime.query('one', 'view', { n: 'wrong' }), code('INVALID_INPUT'));
});

test('metadata capture preserves INVALID_SCHEMA for non-JSON config, state and query schemas', () => {
  const invalid = { type: 'object', description: undefined };
  for (const options of [
    { configSchema: invalid },
    { stateSchema: invalid },
    { queries: { view: { schema: invalid, execute: () => null } } },
  ]) {
    assert.throws(() => new engine.ModuleRegistry([{ ...module(), ...options }]), code('INVALID_SCHEMA'));
  }
});

test('parseWorldDefinition accepts structural drafts without assembly and returns detached JSON', () => {
  const parse = parser<WorldDefinition>('parseWorldDefinition');
  const input = world();
  const parsed = parse(input);
  assert.deepEqual(parsed, world());
  input.modules[0]!.config.nested = { n: 2 };
  parsed.modules[0]!.bindings!.optional = 'changed';
  parsed.entryView!.query = 'changed';
  assert.deepEqual(parsed.modules[0]!.config.nested, { n: 1 });
  assert.equal(input.modules[0]!.bindings!.optional, 'later');
  assert.equal(input.entryView!.query, 'view');
});

test('parseWorldDefinition rejects malformed structure with existing definition errors', () => {
  const parse = parser<WorldDefinition>('parseWorldDefinition');
  for (const input of [null, [], {}, { ...world(), id: '' }, { ...world(), extra: true }, { ...world(), modules: [{ id: 'one', module: 'example', config: [] }] }, { ...world(), entryView: { instance: 'one' } }]) {
    assert.throws(() => parse(input), code('INVALID_DEFINITION'));
  }
});

test('parseCommand preserves optional fields and detaches nested input without dispatch', () => {
  const parse = parser<Command>('parseCommand');
  const input: Command = { id: 'receipt', target: 'unregistered', action: 'act', input: { nested: { n: 1 } } };
  const parsed = parse(input);
  assert.deepEqual(parsed, { id: 'receipt', target: 'unregistered', action: 'act', input: { nested: { n: 1 } } });
  input.input!.nested = { n: 2 };
  assert.deepEqual(parsed.input, { nested: { n: 1 } });
  parsed.input!.nested = { n: 3 };
  assert.deepEqual(input.input, { nested: { n: 2 } });
  assert.deepEqual(parse({ target: 'one', action: 'act' }), { target: 'one', action: 'act' });
});

test('parseCommand rejects malformed structure with existing command errors', () => {
  const parse = parser<Command>('parseCommand');
  for (const input of [null, [], {}, { target: '', action: 'act' }, { target: 'one', action: 'act', extra: true }, { target: 'one', action: 'act', input: [] }, { id: 1, target: 'one', action: 'act' }]) {
    assert.throws(() => parse(input), code('INVALID_COMMAND'));
  }
});

test('structural parsers retain lossless JSON rejection without invoking accessors', () => {
  const parseWorld = parser<WorldDefinition>('parseWorldDefinition');
  const parseCommand = parser<Command>('parseCommand');
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, 'n', { enumerable: true, get() { throw new Error('Accessor ran'); } });
  for (const invalid of [undefined, Number.NaN, cyclic, accessor, new Date()]) {
    assert.throws(() => parseWorld({ ...world(), modules: [{ id: 'one', module: 'example', config: { invalid } }] }), code('INVALID_JSON'));
    assert.throws(() => parseCommand({ target: 'one', action: 'act', input: { invalid } }), code('INVALID_JSON'));
  }
});
