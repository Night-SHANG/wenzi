import type { JsonValue } from '../contracts.ts';
import { createWorld, parseCommand, parseWorldDefinition, restoreWorld } from '../engine/index.ts';
import type { ModuleRegistry } from '../engine/index.ts';
import { canonical, copyJson, EngineError, errorOf } from '../engine/json.ts';
import { readTextView } from '../adapters/text.ts';
import type { PackageInspection, WorldPackage } from './contracts.ts';

/** Structural parsing does not resolve modules or run their hooks. */
export function parseWorldPackage(value: unknown): WorldPackage {
  const data = copyJson(value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new EngineError('INVALID_PACKAGE', 'World package must be an object');
  const envelope = data as Record<string, unknown>;
  if (Object.keys(envelope).length !== 3 || !['format', 'world', 'demo'].every(key => Object.hasOwn(envelope, key)) || envelope.format !== 1 || !Array.isArray(envelope.demo)) {
    throw new EngineError('INVALID_PACKAGE', 'World package requires only format:1, world and demo');
  }
  return { format: 1, world: parseWorldDefinition(envelope.world), demo: envelope.demo.map(command => parseCommand(command)) };
}

export function cloneWorldPackage(source: unknown, identity: { id: string; title?: string; version?: string }): WorldPackage {
  const pack = parseWorldPackage(source);
  const replacement = copyJson(identity);
  pack.world.id = replacement.id;
  if (replacement.title !== undefined) pack.world.title = replacement.title;
  if (replacement.version !== undefined) pack.world.version = replacement.version;
  return parseWorldPackage(pack);
}

/** Inspection owns only a fresh runtime, never the caller's exported initial config. */
export function inspectWorldPackage(registry: ModuleRegistry, source: unknown, options: { runDemo?: boolean } = {}): PackageInspection {
  let stage: Extract<PackageInspection, { ok: false }>['stage'] = 'package';
  let step: number | undefined;
  try {
    const pack = parseWorldPackage(source);
    stage = 'assembly';
    const runtime = createWorld(registry, pack.world);
    const actions = runtime.actions();
    stage = 'view';
    let view = readTextView(runtime);
    let steps = 0;
    if (options.runDemo) {
      stage = 'demo';
      for (const [index, command] of pack.demo.entries()) {
        step = index + 1;
        const result = runtime.dispatch({ ...command, id: command.id ?? `demo-${step}` });
        if (!result.ok) return { ok: false, stage, step, error: result.error };
        steps++;
      }
      step = undefined;
    }
    stage = 'view';
    view = readTextView(runtime);
    stage = 'restore';
    const saved = runtime.snapshot();
    const restored = restoreWorld(registry, saved);
    if (canonical(restored.snapshot() as unknown as JsonValue) !== canonical(saved as unknown as JsonValue)) {
      throw new EngineError('INVALID_SNAPSHOT', 'Restored snapshot does not match inspected snapshot');
    }
    return { ok: true, worldId: pack.world.id, title: pack.world.title, moduleCount: pack.world.modules.length, actions, view, demo: { executed: options.runDemo === true, steps, finalRevision: runtime.revision }, restored: true };
  } catch (error) {
    const failure = errorOf(error, stage === 'view' ? 'INVALID_VIEW' : 'INSPECTION_FAILED');
    return { ok: false, stage, error: { code: failure.code, message: failure.message }, ...(stage === 'demo' && step !== undefined ? { step } : {}) };
  }
}
