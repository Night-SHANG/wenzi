import { randomUUID } from 'node:crypto';
import { link, mkdir, open, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type { WorldPackage } from '../authoring/contracts.ts';
import { parseWorldPackage } from '../authoring/packages.ts';

/** Structural export only; callers inspect module semantics before publishing. */
export async function writeWorldPackage(path: string, pack: WorldPackage, options: { overwrite?: boolean } = {}): Promise<void> {
  const bytes = `${JSON.stringify(parseWorldPackage(pack), null, 2)}\n`;
  const destination = resolve(path);
  const directory = dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = `${directory}/.${basename(destination)}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    try { await file.writeFile(bytes, 'utf8'); await file.sync(); }
    finally { await file.close(); }
    if (options.overwrite) await rename(temporary, destination);
    else await link(temporary, destination);
  } finally {
    if (created) await rm(temporary, { force: true });
  }
}
