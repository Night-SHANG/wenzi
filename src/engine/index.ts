import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { valid, validRange, satisfies } from 'semver';
import type {
  Command, CommandDefinition, CommandResult, CommandSuccess, DomainEvent, ExecutionContext,
  JsonObject, JsonSchema, JsonValue, ModuleDefinition, ModuleInstance, ModuleManifest,
  PreviousState, QueryDefinition, ReadContext, ReconfigureOptions, SavedModule, StoredReceipt,
  WorldDefinition, WorldEvent, WorldSnapshot,
} from '../contracts.ts';
import { canonical, copyJson, EngineError, errorOf, freezeJson } from './json.ts';

const textSchema = { type: 'string', minLength: 1 };
const objectSchema = { type: 'object' };
const nonnegativeInteger = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const manifestSchema: JsonSchema = {
  type: 'object', required: ['id', 'title', 'version', 'apiVersion', 'stateVersion', 'provides'], additionalProperties: false,
  properties: {
    id: textSchema, title: textSchema, version: textSchema, apiVersion: { const: 1 }, stateVersion: nonnegativeInteger,
    provides: { type: 'object', additionalProperties: textSchema },
    requires: { type: 'object', additionalProperties: { type: 'object', required: ['version'], additionalProperties: false, properties: { version: textSchema, optional: { type: 'boolean' } } } },
    conflicts: { type: 'array', uniqueItems: true, items: textSchema },
    provenance: { type: 'object', required: ['origin', 'license'], additionalProperties: false, properties: { origin: textSchema, license: textSchema, reference: textSchema } },
  },
};
const definitionSchema: JsonSchema = {
  type: 'object', required: ['id', 'title', 'version', 'modules'], additionalProperties: false,
  properties: {
    id: textSchema, title: textSchema, version: textSchema, description: { type: 'string' },
    modules: { type: 'array', items: { type: 'object', required: ['id', 'module', 'config'], additionalProperties: false, properties: { id: textSchema, module: textSchema, config: objectSchema, bindings: { type: 'object', additionalProperties: textSchema } } } },
    entryView: { type: 'object', required: ['instance', 'query'], additionalProperties: false, properties: { instance: textSchema, query: textSchema } },
  },
};
const commandSchema: JsonSchema = {
  type: 'object', required: ['target', 'action'], additionalProperties: false,
  properties: { id: { type: 'string' }, target: textSchema, action: textSchema, input: objectSchema },
};
const eventSchema = { type: 'object', required: ['type', 'source', 'payload', 'sequence', 'revision'], additionalProperties: false, properties: { type: textSchema, source: textSchema, payload: objectSchema, sequence: { ...nonnegativeInteger, minimum: 1 }, revision: { ...nonnegativeInteger, minimum: 1 } } };
const snapshotSchema: JsonSchema = {
  type: 'object', required: ['format', 'definition', 'revision', 'eventSequence', 'modules', 'receipts'], additionalProperties: false,
  properties: {
    format: { const: 1 }, definition: definitionSchema, revision: nonnegativeInteger, eventSequence: nonnegativeInteger,
    modules: { type: 'object', additionalProperties: { type: 'object', required: ['definitionId', 'definitionVersion', 'stateVersion', 'state'], additionalProperties: false, properties: { definitionId: textSchema, definitionVersion: textSchema, stateVersion: nonnegativeInteger, state: {} } } },
    receipts: { type: 'array', maxItems: 128, items: { type: 'object', required: ['id', 'fingerprint', 'result'], additionalProperties: false, properties: {
      id: textSchema, fingerprint: textSchema,
      result: { type: 'object', required: ['ok', 'revision', 'value', 'events'], additionalProperties: false, properties: { ok: { const: true }, revision: { ...nonnegativeInteger, minimum: 1 }, value: {}, events: { type: 'array', maxItems: 1024, items: eventSchema } } },
    } } },
  },
};

function compile(schema: JsonSchema, location: string): ValidateFunction {
  try {
    const detached = copyJson(schema);
    ensureObject(detached, 'INVALID_SCHEMA', location);
    const validator = new Ajv({ allErrors: true, strict: true, ownProperties: true }).compile(detached);
    if ('$async' in validator && validator.$async) throw new EngineError('INVALID_SCHEMA', 'Asynchronous schemas are not supported by the synchronous host');
    return validator;
  }
  catch (error) { throw new EngineError('INVALID_SCHEMA', `${location}: ${errorOf(error).message}`); }
}
const validateManifest = compile(manifestSchema, 'manifest');
const validateDefinition = compile(definitionSchema, 'world definition');
const validateCommand = compile(commandSchema, 'command');
const validateSnapshot = compile(snapshotSchema, 'snapshot');
function check(validator: ValidateFunction | undefined, value: unknown, code: string, location: string): void {
  if (validator && !validator(value)) throw new EngineError(code, `${location}: ${new Ajv().errorsText(validator.errors)}`);
}
function ensureObject(value: unknown, code: string, location: string): asserts value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new EngineError(code, `${location}: expected object`);
}
function assertName(value: unknown, location: string): asserts value is string {
  if (typeof value !== 'string' || !value.length || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new EngineError('INVALID_MANIFEST', `Invalid ${location}`);
}

interface PreparedAction<T> { handler: T; input?: ValidateFunction }
interface Prepared {
  manifest: ModuleManifest;
  initialState: ModuleDefinition['initialState'];
  config?: ValidateFunction;
  state?: ValidateFunction;
  commands: Map<string, PreparedAction<CommandDefinition['execute']>>;
  queries: Map<string, PreparedAction<QueryDefinition['execute']>>;
  commandSchemas: Map<string, JsonSchema>;
  events: Map<string, NonNullable<ModuleDefinition['events']>[string]>;
  validate?: ModuleDefinition['validate'];
  migrate?: ModuleDefinition['migrate'];
}
const registries = new WeakMap<ModuleRegistry, Map<string, Prepared>>();

/** Whitelist-free registry for trusted local code. It does not sandbox module JavaScript. */
export class ModuleRegistry {
  constructor(definitions: ModuleDefinition[] = []) {
    registries.set(this, new Map());
    for (const definition of definitions) this.register(definition);
  }
  register(definition: ModuleDefinition): void {
    const manifest = copyJson(definition.manifest);
    check(validateManifest, manifest, 'INVALID_MANIFEST', 'Module manifest');
    assertName(manifest.id, 'module id');
    if (!valid(manifest.version)) throw new EngineError('INVALID_MANIFEST', `Invalid module version: ${manifest.version}`);
    for (const [name, version] of Object.entries(manifest.provides)) {
      assertName(name, 'capability');
      if (!valid(version)) throw new EngineError('INVALID_MANIFEST', `Invalid capability version: ${name}`);
    }
    for (const [name, requirement] of Object.entries(manifest.requires ?? {})) {
      assertName(name, 'requirement');
      if (!validRange(requirement.version)) throw new EngineError('INVALID_MANIFEST', `Invalid requirement range: ${name}`);
    }
    const modules = registries.get(this)!;
    if (modules.has(manifest.id)) throw new EngineError('DUPLICATE_MODULE', `Module already registered: ${manifest.id}`);
    if (typeof definition.initialState !== 'function') throw new EngineError('INVALID_MODULE', `Missing initialState: ${manifest.id}`);
    const prepared: Prepared = {
      manifest: freezeJson(manifest), initialState: definition.initialState,
      commands: new Map(), queries: new Map(), commandSchemas: new Map(), events: new Map(),
      ...(definition.configSchema !== undefined ? { config: compile(definition.configSchema, `${manifest.id} config`) } : {}),
      ...(definition.stateSchema !== undefined ? { state: compile(definition.stateSchema, `${manifest.id} state`) } : {}),
      ...(definition.validate ? { validate: definition.validate } : {}),
      ...(definition.migrate ? { migrate: definition.migrate } : {}),
    };
    for (const [name, action] of Object.entries(definition.commands ?? {})) {
      assertName(name, 'command');
      if (typeof action.execute !== 'function') throw new EngineError('INVALID_MODULE', `Invalid command: ${name}`);
      const schema = action.schema !== undefined ? copyJson(action.schema) : { type: 'object' };
      prepared.commands.set(name, { handler: action.execute, input: compile(schema, `${manifest.id}.${name}`) });
      prepared.commandSchemas.set(name, freezeJson(schema));
    }
    for (const [name, action] of Object.entries(definition.queries ?? {})) {
      assertName(name, 'query');
      if (typeof action.execute !== 'function') throw new EngineError('INVALID_MODULE', `Invalid query: ${name}`);
      prepared.queries.set(name, { handler: action.execute, input: compile(action.schema !== undefined ? action.schema : { type: 'object' }, `${manifest.id}.${name}`) });
    }
    for (const [type, handler] of Object.entries(definition.events ?? {})) {
      assertName(type, 'event type');
      if (typeof handler !== 'function') throw new EngineError('INVALID_MODULE', `Invalid event handler: ${type}`);
      prepared.events.set(type, handler);
    }
    if (prepared.validate && typeof prepared.validate !== 'function' || prepared.migrate && typeof prepared.migrate !== 'function') throw new EngineError('INVALID_MODULE', 'Invalid lifecycle hook');
    modules.set(manifest.id, prepared);
  }
}

interface Instance { definition: ModuleInstance; module: Prepared; bindings: Map<string, string> }
type States = Map<string, JsonValue>;
interface Scope { states: States; depth: number }
interface Transaction extends Scope { events: DomainEvent[]; active: boolean; fault?: EngineError }
interface Loaded { states: States; revision: number; eventSequence: number; receipts: StoredReceipt[] }

function assemble(registry: ModuleRegistry, requested: WorldDefinition): { definition: WorldDefinition; instances: Map<string, Instance> } {
  const definition = copyJson(requested);
  check(validateDefinition, definition, 'INVALID_DEFINITION', 'World definition');
  const instances = new Map<string, Instance>();
  for (const item of definition.modules) {
    if (instances.has(item.id)) throw new EngineError('DUPLICATE_INSTANCE', `Duplicate instance: ${item.id}`);
    assertName(item.id, 'instance id');
    const module = registries.get(registry)?.get(item.module);
    if (!module) throw new EngineError('UNKNOWN_MODULE', `Module not registered: ${item.module}`);
    check(module.config, item.config, 'INVALID_CONFIG', `${item.id} config`);
    instances.set(item.id, { definition: item, module, bindings: new Map() });
  }
  for (const [id, instance] of instances) {
    for (const conflict of instance.module.manifest.conflicts ?? []) {
      if ([...instances.values()].some(other => other !== instance && (other.module.manifest.id === conflict || Object.hasOwn(other.module.manifest.provides, conflict)))) {
        throw new EngineError('MODULE_CONFLICT', `${id} conflicts with ${conflict}`);
      }
    }
    const requirements = instance.module.manifest.requires ?? {};
    for (const name of Object.keys(instance.definition.bindings ?? {})) {
      if (!Object.hasOwn(requirements, name)) throw new EngineError('UNKNOWN_BINDING', `${id}: binding for undeclared capability ${name}`);
    }
    for (const [name, requirement] of Object.entries(requirements)) {
      const providers = [...instances].filter(([, candidate]) => Object.hasOwn(candidate.module.manifest.provides, name));
      const explicit = instance.definition.bindings && Object.hasOwn(instance.definition.bindings, name) ? instance.definition.bindings[name] : undefined;
      if (explicit !== undefined) {
        const target = instances.get(explicit);
        if (!target) throw new EngineError('UNKNOWN_BINDING', `${id}: unknown provider ${explicit}`);
        const version = Object.hasOwn(target.module.manifest.provides, name) ? target.module.manifest.provides[name] : undefined;
        if (version === undefined || !satisfies(version, requirement.version)) throw new EngineError('INCOMPATIBLE_CAPABILITY', `${id}: ${explicit} does not provide ${name} ${requirement.version}`);
        instance.bindings.set(name, explicit);
        continue;
      }
      const compatible = providers.filter(([, candidate]) => satisfies(candidate.module.manifest.provides[name]!, requirement.version));
      if (compatible.length > 1) throw new EngineError('AMBIGUOUS_CAPABILITY', `${id}: multiple providers for ${name}; bind explicitly`);
      if (compatible.length === 1) { instance.bindings.set(name, compatible[0]![0]); continue; }
      if (requirement.optional && providers.length === 0) continue;
      throw new EngineError(providers.length ? 'INCOMPATIBLE_CAPABILITY' : 'MISSING_CAPABILITY', `${id}: no compatible provider for ${name} ${requirement.version}`);
    }
  }
  if (definition.entryView) {
    const view = definition.entryView;
    if (!instances.get(view.instance)?.module.queries.has(view.query)) throw new EngineError('INVALID_DEFINITION', 'entryView must name an existing query');
  }
  return { definition: freezeJson(definition), instances };
}

function initialize(instance: Instance): JsonValue {
  try { return copyJson(instance.module.initialState(freezeJson(copyJson(instance.definition.config)))); }
  catch (error) { throw errorOf(error, 'INITIAL_STATE_FAILED'); }
}
function migrate(instance: Instance, previous: SavedModule): JsonValue {
  const manifest = instance.module.manifest;
  if (previous.definitionId === manifest.id && previous.definitionVersion === manifest.version && previous.stateVersion === manifest.stateVersion) return copyJson(previous.state);
  if (!instance.module.migrate) throw new EngineError('MIGRATION_REQUIRED', `${instance.definition.id}: code identity/version/state format changed; explicit migration required`);
  const prior: PreviousState = { moduleId: previous.definitionId, version: previous.definitionVersion, stateVersion: previous.stateVersion, state: copyJson(previous.state) };
  try { return copyJson(instance.module.migrate(freezeJson(prior), freezeJson(copyJson(instance.definition.config)))); }
  catch (error) { throw errorOf(error, 'MIGRATION_FAILED'); }
}

export class WorldRuntime {
  #definition: WorldDefinition;
  #instances: Map<string, Instance>;
  #states: States;
  #revision: number;
  #eventSequence: number;
  #receipts: StoredReceipt[];
  #busy = false;

  /** Prefer createWorld/restoreWorld; Loaded is an internal assembly detail. */
  constructor(registry: ModuleRegistry, definition: WorldDefinition, loaded?: Loaded) {
    const assembly = assemble(registry, definition);
    this.#definition = assembly.definition;
    this.#instances = assembly.instances;
    this.#states = loaded ? this.#copyStates(loaded.states) : new Map([...this.#instances].map(([id, instance]) => [id, initialize(instance)]));
    this.#revision = loaded?.revision ?? 0;
    this.#eventSequence = loaded?.eventSequence ?? 0;
    this.#receipts = copyJson(loaded?.receipts ?? []);
    this.#validateStates({ states: this.#states, depth: 0 });
  }
  get definition(): WorldDefinition { return copyJson(this.#definition); }
  get revision(): number { return this.#revision; }

  #instance(id: string): Instance {
    const instance = this.#instances.get(id);
    if (!instance) throw new EngineError('UNKNOWN_INSTANCE', `Unknown instance: ${id}`);
    return instance;
  }
  #copyStates(states: States): States { return new Map([...states].map(([id, state]) => [id, copyJson(state)])); }
  #enter<T>(scope: Scope, execute: () => T): T {
    if (scope.depth >= 64) throw new EngineError('CALL_DEPTH', 'Nested call/query limit (64) exceeded');
    scope.depth++;
    try { return execute(); } finally { scope.depth--; }
  }
  #readContext(id: string, scope: Scope): ReadContext {
    const instance = this.#instance(id);
    const guard = <T>(execute: () => T): T => {
      try { return execute(); }
      catch (error) {
        const failure = errorOf(error);
        if ('active' in scope) (scope as Transaction).fault ??= failure;
        throw failure;
      }
    };
    return Object.freeze({
      self: id,
      config: freezeJson(copyJson(instance.definition.config)),
      state: <T = JsonObject>() => copyJson(scope.states.get(id)) as T,
      query: (capability: string, action: string, input: JsonObject = {}) => guard(() => this.#query(this.#provider(instance, capability), action, input, scope)),
      has: (capability: string) => instance.bindings.has(capability),
      provider: (capability: string) => instance.bindings.get(capability),
      fail: (code: string, message: string): never => guard(() => { throw new EngineError(code, message); }),
    });
  }
  #provider(instance: Instance, capability: string): string {
    const provider = instance.bindings.get(capability);
    if (provider === undefined) throw new EngineError('MISSING_CAPABILITY', `${instance.definition.id}: no bound capability ${capability}`);
    return provider;
  }
  #active(transaction: Transaction): void {
    if (!transaction.active) throw new EngineError('TRANSACTION_CLOSED', 'Transaction has already completed');
    if (transaction.fault) throw transaction.fault;
  }
  #executionContext(id: string, transaction: Transaction): ExecutionContext {
    const instance = this.#instance(id);
    const guard = <T>(execute: () => T): T => {
      try { this.#active(transaction); return execute(); }
      catch (error) { transaction.fault ??= errorOf(error); throw transaction.fault; }
    };
    return Object.freeze({
      ...this.#readContext(id, transaction),
      write: (state: JsonValue) => guard(() => { transaction.states.set(id, copyJson(state)); }),
      call: (capability: string, action: string, input: JsonObject = {}) => guard(() => this.#command(this.#provider(instance, capability), action, input, transaction)),
      emit: (type: string, payload: JsonObject = {}) => guard(() => {
        if (typeof type !== 'string' || !type.length) throw new EngineError('INVALID_EVENT', 'Event type must be a nonempty string');
        const detached = copyJson(payload); ensureObject(detached, 'INVALID_EVENT', 'Event payload');
        if (transaction.events.length >= 1024) throw new EngineError('EVENT_LIMIT', 'Event limit (1024) exceeded');
        transaction.events.push({ type, source: id, payload: detached });
      }),
    });
  }
  #query(id: string, action: string, input: JsonObject, scope: Scope): JsonValue {
    return this.#enter(scope, () => {
      const query = this.#instance(id).module.queries.get(action);
      if (!query) throw new EngineError('UNKNOWN_QUERY', `${id}: unknown query ${action}`);
      const detached = copyJson(input); ensureObject(detached, 'INVALID_INPUT', 'Query input');
      check(query.input, detached, 'INVALID_INPUT', `${id}.${action} input`);
      return copyJson(query.handler(this.#readContext(id, scope), freezeJson(detached)));
    });
  }
  #command(id: string, action: string, input: JsonObject, transaction: Transaction): JsonValue {
    return this.#enter(transaction, () => {
      const command = this.#instance(id).module.commands.get(action);
      if (!command) throw new EngineError('UNKNOWN_COMMAND', `${id}: unknown command ${action}`);
      const detached = copyJson(input); ensureObject(detached, 'INVALID_INPUT', 'Command input');
      check(command.input, detached, 'INVALID_INPUT', `${id}.${action} input`);
      return copyJson(command.handler(this.#executionContext(id, transaction), freezeJson(detached)));
    });
  }
  #validateStates(scope: Scope): void {
    if (scope.states.size !== this.#instances.size || [...scope.states.keys()].some(id => !this.#instances.has(id))) throw new EngineError('INVALID_SNAPSHOT', 'Saved module set does not match world definition');
    for (const [id, instance] of this.#instances) {
      if (!scope.states.has(id)) throw new EngineError('INVALID_SNAPSHOT', `Missing saved module: ${id}`);
      const state = copyJson(scope.states.get(id));
      check(instance.module.state, state, 'INVALID_STATE', `${id} state`);
    }
    for (const [id, instance] of this.#instances) {
      if (instance.module.validate) this.#enter(scope, () => {
        const result: unknown = instance.module.validate!(this.#readContext(id, scope));
        if (result !== undefined) throw new EngineError('INVALID_MODULE', `${id}: validate must be synchronous and return void`);
      });
    }
  }

  dispatch(request: Command): CommandResult {
    if (this.#busy) return { ok: false, revision: this.#revision, error: { code: 'REENTRANT_COMMAND', message: 'A command is already running' } };
    let transaction: Transaction | undefined;
    this.#busy = true;
    try {
      const command = copyJson(request);
      check(validateCommand, command, 'INVALID_COMMAND', 'Command');
      const fingerprint = canonical({ target: command.target, action: command.action, input: command.input ?? {} });
      if (command.id) {
        const receipt = this.#receipts.find(receipt => receipt.id === command.id);
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) throw new EngineError('DUPLICATE_COMMAND', `Command id ${command.id} was already used with different content`);
          return { ...copyJson(receipt.result), replayed: true };
        }
      }
      if (this.#revision >= Number.MAX_SAFE_INTEGER) throw new EngineError('REVISION_LIMIT', 'Revision limit reached');
      transaction = { states: this.#copyStates(this.#states), depth: 0, events: [], active: true };
      const value = this.#command(command.target, command.action, command.input ?? {}, transaction);
      for (let index = 0; index < transaction.events.length; index++) {
        const event = transaction.events[index]!;
        for (const [id, instance] of this.#instances) {
          const handler = instance.module.events.get(event.type);
          if (handler) this.#enter(transaction, () => {
            const result: unknown = handler(this.#executionContext(id, transaction!), freezeJson(copyJson(event)));
            if (result !== undefined) throw new EngineError('INVALID_MODULE', `${id}: event handlers must be synchronous and return void`);
          });
        }
      }
      this.#active(transaction);
      this.#validateStates(transaction);
      this.#active(transaction);
      if (this.#eventSequence > Number.MAX_SAFE_INTEGER - transaction.events.length) throw new EngineError('EVENT_SEQUENCE_LIMIT', 'Event sequence limit reached');
      const revision = this.#revision + 1;
      const events: WorldEvent[] = transaction.events.map((event, i) => ({ ...copyJson(event), sequence: this.#eventSequence + i + 1, revision }));
      const result: CommandSuccess = { ok: true, revision, value: copyJson(value), events };
      const states = this.#copyStates(transaction.states);
      const receipts = copyJson(command.id ? [...this.#receipts, { id: command.id, fingerprint, result }].slice(-128) : this.#receipts);
      this.#states = states;
      this.#revision = revision;
      this.#eventSequence += events.length;
      this.#receipts = receipts;
      return copyJson(result);
    } catch (error) {
      const failure = errorOf(error);
      return { ok: false, revision: this.#revision, error: { code: failure.code, message: failure.message } };
    } finally {
      if (transaction) transaction.active = false;
      this.#busy = false;
    }
  }
  query(instanceId: string, action: string, input: JsonObject = {}): JsonValue {
    try { return this.#query(instanceId, action, input, { states: this.#copyStates(this.#states), depth: 0 }); }
    catch (error) { throw errorOf(error); }
  }
  read(instanceId: string): JsonValue { this.#instance(instanceId); return copyJson(this.#states.get(instanceId)!); }
  actions(): { target: string; action: string; schema: JsonSchema }[] {
    return [...this.#instances].flatMap(([target, instance]) => [...instance.module.commandSchemas].map(([action, schema]) => ({ target, action, schema: copyJson(schema) })));
  }
  snapshot(): WorldSnapshot {
    const modules: Record<string, SavedModule> = {};
    for (const [id, instance] of this.#instances) {
      const manifest = instance.module.manifest;
      modules[id] = { definitionId: manifest.id, definitionVersion: manifest.version, stateVersion: manifest.stateVersion, state: copyJson(this.#states.get(id)!) };
    }
    return copyJson({ format: 1, definition: this.#definition, revision: this.#revision, eventSequence: this.#eventSequence, modules, receipts: this.#receipts });
  }
}

export function createWorld(registry: ModuleRegistry, definition: WorldDefinition): WorldRuntime {
  return new WorldRuntime(registry, definition);
}

function verifyReceipts(snapshot: WorldSnapshot, instances: Map<string, Instance>): void {
  if (snapshot.eventSequence > snapshot.revision * 1024) throw new EngineError('INVALID_SNAPSHOT', 'Event cursor exceeds the committed transaction event budget');
  const ids = new Set<string>();
  let priorRevision = 0;
  let lastReceiptEventSequence = 0;
  // A complete receipt fixes that revision's exact event count. Only missing
  // revisions may contribute an unknown 0–1024 events; keep their feasible range.
  let minimumCursor = 0;
  let maximumCursor = 0;
  for (const receipt of snapshot.receipts) {
    if (ids.has(receipt.id)) throw new EngineError('INVALID_SNAPSHOT', 'Duplicate receipt id');
    ids.add(receipt.id);
    const result = receipt.result;
    if (result.revision <= priorRevision || result.revision > snapshot.revision) throw new EngineError('INVALID_SNAPSHOT', 'Invalid receipt revision order');
    maximumCursor = Math.min(Number.MAX_SAFE_INTEGER, maximumCursor + (result.revision - priorRevision - 1) * 1024);
    let fingerprint: unknown;
    try { fingerprint = JSON.parse(receipt.fingerprint); }
    catch { throw new EngineError('INVALID_SNAPSHOT', 'Invalid receipt fingerprint'); }
    const checked = copyJson(fingerprint);
    ensureObject(checked, 'INVALID_SNAPSHOT', 'Receipt fingerprint');
    check(validateCommand, checked, 'INVALID_SNAPSHOT', 'Receipt command');
    if (Object.hasOwn(checked, 'id') || !Object.hasOwn(checked, 'input') || canonical(checked) !== receipt.fingerprint) throw new EngineError('INVALID_SNAPSHOT', 'Noncanonical receipt fingerprint');
    if (!instances.has(checked.target as string)) throw new EngineError('INVALID_SNAPSHOT', 'Receipt references unknown instance');
    let previousSequence = 0;
    for (const event of result.events) {
      if (!instances.has(event.source) || event.revision !== result.revision || event.sequence <= lastReceiptEventSequence || (previousSequence > 0 && event.sequence !== previousSequence + 1) || event.sequence > snapshot.eventSequence) throw new EngineError('INVALID_SNAPSHOT', 'Invalid receipt event cursor');
      previousSequence = event.sequence;
      lastReceiptEventSequence = event.sequence;
    }
    const firstEvent = result.events[0];
    if (firstEvent) {
      const cursorBeforeCommand = firstEvent.sequence - 1;
      if (cursorBeforeCommand < minimumCursor || cursorBeforeCommand > maximumCursor) throw new EngineError('INVALID_SNAPSHOT', 'Receipt event cursor contradicts complete prior receipt history');
      minimumCursor = previousSequence;
      maximumCursor = previousSequence;
    }
    priorRevision = result.revision;
  }
  maximumCursor = Math.min(Number.MAX_SAFE_INTEGER, maximumCursor + (snapshot.revision - priorRevision) * 1024);
  if (snapshot.eventSequence < minimumCursor || snapshot.eventSequence > maximumCursor) throw new EngineError('INVALID_SNAPSHOT', 'Snapshot event cursor contradicts complete receipt history');
}

export function restoreWorld(registry: ModuleRegistry, requested: WorldSnapshot): WorldRuntime {
  const snapshot = copyJson(requested);
  check(validateSnapshot, snapshot, 'INVALID_SNAPSHOT', 'Snapshot');
  const { instances } = assemble(registry, snapshot.definition);
  if (Object.keys(snapshot.modules).length !== instances.size || Object.keys(snapshot.modules).some(id => !instances.has(id))) throw new EngineError('INVALID_SNAPSHOT', 'Saved module set does not match world definition');
  const states: States = new Map();
  for (const [id, instance] of instances) {
    const previous = snapshot.modules[id];
    if (!previous) throw new EngineError('INVALID_SNAPSHOT', `Missing saved module ${id}`);
    if (!valid(previous.definitionVersion)) throw new EngineError('INVALID_SNAPSHOT', `Invalid saved version for ${id}`);
    states.set(id, migrate(instance, previous));
  }
  verifyReceipts(snapshot, instances);
  return new WorldRuntime(registry, snapshot.definition, { states, revision: snapshot.revision, eventSequence: snapshot.eventSequence, receipts: snapshot.receipts });
}

export function reconfigureWorld(registry: ModuleRegistry, oldWorld: WorldRuntime, nextDefinition: WorldDefinition, options: ReconfigureOptions = {}): WorldRuntime {
  const previous = oldWorld.snapshot();
  const { definition, instances } = assemble(registry, nextDefinition);
  if (definition.id !== previous.definition.id) throw new EngineError('WORLD_ID_MISMATCH', 'Reconfiguration must retain the world id');
  const allowed = copyJson(options);
  if (allowed.allowRemoved !== undefined && (!Array.isArray(allowed.allowRemoved) || allowed.allowRemoved.some(id => typeof id !== 'string'))) throw new EngineError('INVALID_RECONFIGURE', 'allowRemoved must be an array of instance ids');
  for (const oldId of Object.keys(previous.modules)) {
    if (!instances.has(oldId) && !allowed.allowRemoved?.includes(oldId)) throw new EngineError('REMOVAL_NOT_ALLOWED', `Removing ${oldId} requires explicit allowRemoved`);
  }
  const states: States = new Map();
  for (const [id, instance] of instances) {
    const prior = previous.modules[id];
    states.set(id, prior ? migrate(instance, prior) : initialize(instance));
  }
  return new WorldRuntime(registry, definition, { states, revision: previous.revision, eventSequence: previous.eventSequence, receipts: [] });
}
