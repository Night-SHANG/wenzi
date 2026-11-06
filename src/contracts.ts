/** Public contracts. Gameplay concepts must never be added to the host as fixed kinds. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue }
export type JsonSchema = Record<string, unknown>;

export interface Requirement { version: string; optional?: boolean }
export interface ModuleManifest {
  id: string;
  title: string;
  version: string;
  apiVersion: 1;
  stateVersion: number;
  provides: Record<string, string>;
  requires?: Record<string, Requirement>;
  conflicts?: string[];
  provenance?: { origin: string; license: string; reference?: string };
}
export interface ModuleInstance {
  id: string;
  module: string;
  config: JsonObject;
  bindings?: Record<string, string>;
}
export interface WorldDefinition {
  id: string;
  title: string;
  version: string;
  description?: string;
  modules: ModuleInstance[];
  entryView?: { instance: string; query: string };
}
export interface DomainEvent { type: string; source: string; payload: JsonObject }
export interface WorldEvent extends DomainEvent { sequence: number; revision: number }
export interface ReadContext {
  readonly self: string;
  readonly config: JsonObject;
  /** Detached JSON copy. Mutating it never commits changes. */
  state<T = JsonObject>(): T;
  /** Capability name resolves through this instance's explicit bindings. */
  query(capability: string, action: string, input?: JsonObject): JsonValue;
  has(capability: string): boolean;
  provider(capability: string): string | undefined;
  fail(code: string, message: string): never;
}
export interface ExecutionContext extends ReadContext {
  /** Writes only this module instance's state in the active transaction. */
  write(state: JsonValue): void;
  call(capability: string, action: string, input?: JsonObject): JsonValue;
  emit(type: string, payload?: JsonObject): void;
}
export interface CommandDefinition {
  schema?: JsonSchema;
  execute(context: ExecutionContext, input: JsonObject): JsonValue;
}
export interface QueryDefinition {
  schema?: JsonSchema;
  execute(context: ReadContext, input: JsonObject): JsonValue;
}
export interface PreviousState {
  moduleId: string;
  version: string;
  stateVersion: number;
  state: JsonValue;
}
export interface ModuleDefinition {
  manifest: ModuleManifest;
  configSchema?: JsonSchema;
  stateSchema?: JsonSchema;
  initialState(config: JsonObject): JsonValue;
  commands?: Record<string, CommandDefinition>;
  queries?: Record<string, QueryDefinition>;
  events?: Record<string, (context: ExecutionContext, event: DomainEvent) => void>;
  /** Pure cross-capability/state validation, at assembly, commit and restore. */
  validate?(context: ReadContext): void;
  /** Explicit migration is required when code identity/version/state format changes. */
  migrate?(previous: PreviousState, config: JsonObject): JsonValue;
}
export interface Command {
  id?: string;
  target: string;
  action: string;
  input?: JsonObject;
}
export interface CommandSuccess {
  ok: true;
  revision: number;
  value: JsonValue;
  events: WorldEvent[];
  replayed?: boolean;
}
export interface CommandFailure {
  ok: false;
  revision: number;
  error: { code: string; message: string };
}
export type CommandResult = CommandSuccess | CommandFailure;
export interface SavedModule {
  definitionId: string;
  definitionVersion: string;
  stateVersion: number;
  state: JsonValue;
}
export interface StoredReceipt { id: string; fingerprint: string; result: CommandSuccess }
export interface WorldSnapshot {
  format: 1;
  definition: WorldDefinition;
  revision: number;
  eventSequence: number;
  modules: Record<string, SavedModule>;
  receipts: StoredReceipt[];
}
export interface ReconfigureOptions { allowRemoved?: string[] }
