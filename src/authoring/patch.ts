import jsonPatch from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import type { JsonValue } from '../contracts.ts';
import { canonical, copyJson, EngineError, errorOf } from '../engine/json.ts';
import type { WorldPackage } from './contracts.ts';
import { parseWorldPackage } from './packages.ts';

const supported = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
function invalid(message: string): never { throw new EngineError('INVALID_PATCH', message); }

function pointer(value: unknown): string[] {
  if (typeof value !== 'string' || value !== '' && !value.startsWith('/')) invalid('Pointer must be empty or start with /');
  if (value === '') return [];
  return value.slice(1).split('/').map(part => {
    if (/~(?:[^01]|$)/u.test(part)) invalid('Pointer contains an invalid ~ escape');
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (forbidden.has(decoded)) invalid(`Unsafe pointer segment: ${decoded}`);
    return decoded;
  });
}

/** Read-only guards compensate for inherited lookup and 32-bit coercion in the dependency. */
function guard(document: unknown, segments: string[], addDestination = false): unknown {
  let current = document;
  for (const [position, segment] of segments.entries()) {
    if (current === null || typeof current !== 'object') invalid('Pointer traverses a non-container');
    const mayAdd = addDestination && position === segments.length - 1;
    if (Array.isArray(current)) {
      if (segment === '-' && mayAdd) return undefined;
      if (!/^(0|[1-9][0-9]*)$/u.test(segment)) invalid('Array index must be a canonical nonnegative integer');
      const index = Number(segment);
      if (index > 2147483647 || index > current.length || !mayAdd && index === current.length) invalid('Array index is out of bounds');
    }
    const own = Object.hasOwn(current, segment);
    if (!own && !mayAdd) invalid('Pointer does not reference an own property');
    current = own ? (current as Record<string, unknown>)[segment] : undefined;
  }
  return current;
}

export function patchWorldPackage(source: unknown, operations: unknown): WorldPackage {
  let candidate: unknown = parseWorldPackage(source);
  const sequence = copyJson(operations);
  if (!Array.isArray(sequence)) invalid('Patch must be an array of operations');
  for (const [index, raw] of sequence.entries()) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('Operation must be an object');
      const op = raw as Record<string, unknown>;
      if (!Object.hasOwn(op, 'op') || typeof op.op !== 'string' || !supported.has(op.op)) invalid('Unsupported operation');
      if (!Object.hasOwn(op, 'path')) invalid('Operation requires path');
      const path = pointer(op.path);
      if (['add', 'replace', 'test'].includes(op.op) && !Object.hasOwn(op, 'value')) invalid('Operation requires value');
      if (op.op === 'move' || op.op === 'copy') {
        if (!Object.hasOwn(op, 'from')) invalid('Operation requires from');
        const from = pointer(op.from);
        guard(candidate, from);
        if (op.op === 'move') {
          if (path.length > from.length && from.every((part, offset) => path[offset] === part)) invalid('Move destination cannot be a descendant of its source');
          // The dependency's move traverses the destination before removal, which
          // fails when removal shifts its container. Delegate both mutations in
          // RFC 6902 order, then keep the successfully validated detached result.
          const removal = jsonPatch.applyOperation(copyJson(candidate), { op: 'remove', path: op.from as string }, false, true, true, index);
          guard(removal.newDocument, path, true);
          candidate = jsonPatch.applyOperation(removal.newDocument, { op: 'add', path: op.path as string, value: removal.removed }, false, true, true, index).newDocument;
          continue;
        } else guard(candidate, path, true);
      } else {
        const actual = guard(candidate, path, op.op === 'add');
        if (op.op === 'test') {
          // The dependency calls value.hasOwnProperty, which is legal JSON data.
          if (canonical(actual as JsonValue) !== canonical(op.value as JsonValue)) throw new EngineError('TEST_OPERATION_FAILED', 'Test operation failed');
          continue;
        }
      }
      candidate = jsonPatch.applyOperation(candidate, op as unknown as Operation, false, true, true, index).newDocument;
    } catch (error) {
      const failure = errorOf(error, 'INVALID_PATCH');
      throw new EngineError(failure.code, `Patch operation ${index}: ${failure.message}`);
    }
  }
  return parseWorldPackage(candidate);
}
