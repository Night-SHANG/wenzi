import type { JsonValue } from '../contracts.ts';

export class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export function errorOf(error: unknown, fallback = 'MODULE_ERROR'): EngineError {
  if (error instanceof EngineError) return error;
  return new EngineError(fallback, error instanceof Error ? error.message : 'Module execution failed');
}

/** JSON serialization is deliberately lossless: no getters, coercion, holes or toJSON. */
export function copyJson<T>(value: T): T {
  const ancestors = new Set<object>();
  function visit(item: unknown, path: string): JsonValue {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || item === null) throw new EngineError('INVALID_JSON', `${path}: expected finite JSON data`);
    if (ancestors.has(item)) throw new EngineError('INVALID_JSON', `${path}: circular JSON data`);
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new EngineError('INVALID_JSON', `${path}: only plain JSON objects and arrays are supported`);
    }
    if (Object.getOwnPropertySymbols(item).length) throw new EngineError('INVALID_JSON', `${path}: symbol properties are not JSON`);
    ancestors.add(item);
    try {
      const names = Object.getOwnPropertyNames(item);
      if (array) {
        const input = item as unknown[];
        if (names.length !== input.length + 1) throw new EngineError('INVALID_JSON', `${path}: sparse arrays or extra array properties are not JSON`);
        const result: JsonValue[] = [];
        for (let i = 0; i < input.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(i));
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new EngineError('INVALID_JSON', `${path}[${i}]: invalid JSON property`);
          result.push(visit(descriptor.value, `${path}[${i}]`));
        }
        return result;
      }
      const result: Record<string, JsonValue> = {};
      for (const key of names) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new EngineError('INVALID_JSON', `${path}: unsafe property ${key}`);
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!('value' in descriptor) || !descriptor.enumerable) throw new EngineError('INVALID_JSON', `${path}.${key}: accessors and hidden properties are not JSON`);
        result[key] = visit(descriptor.value, `${path}.${key}`);
      }
      return result;
    } finally { ancestors.delete(item); }
  }
  try { return visit(value, '$') as T; }
  catch (error) {
    if (error instanceof EngineError) throw error;
    throw new EngineError('INVALID_JSON', 'Cannot inspect JSON value');
  }
}

export function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function canonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}
