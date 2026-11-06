import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { WorldSnapshot } from '../contracts.ts';

export interface SnapshotStorage {
  save(key: string, snapshot: WorldSnapshot): Promise<void>;
  load(key: string): Promise<unknown>;
}

/** File format remains owned/validated by the runtime; this adapter only transfers bytes. */
export class JsonFileStorage implements SnapshotStorage {
  async save(key: string, snapshot: WorldSnapshot): Promise<void> {
    const bytes = JSON.stringify(snapshot, null, 2) + '\n';
    const destination = resolve(key);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(bytes, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  async load(key: string): Promise<unknown> { return JSON.parse(await readFile(resolve(key), 'utf8')); }
}

export class MemoryStorage implements SnapshotStorage {
  #slots = new Map<string, WorldSnapshot>();
  async save(key: string, snapshot: WorldSnapshot): Promise<void> { this.#slots.set(key, structuredClone(snapshot)); }
  async load(key: string): Promise<unknown> {
    if (!this.#slots.has(key)) throw new Error(`存档不存在：${key}`);
    return structuredClone(this.#slots.get(key));
  }
}
