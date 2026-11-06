import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorldPackage } from './authoring/contracts.ts';
import { parseWorldPackage } from './authoring/packages.ts';

export type { WorldPackage } from './authoring/contracts.ts';
const builtinDirectory = fileURLToPath(new URL('../worlds/', import.meta.url));

export async function worldNames(): Promise<string[]> {
  return (await readdir(builtinDirectory)).filter(name => name.endsWith('.json')).map(name => name.slice(0,-5)).sort();
}

export async function loadWorldPackage(nameOrPath: string): Promise<WorldPackage> {
  const path = /^[a-z0-9][a-z0-9-]*$/.test(nameOrPath)
    ? resolve(builtinDirectory, `${nameOrPath}.json`) : resolve(nameOrPath);
  let data: unknown;
  try { data = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`无法读取或解析世界 JSON：${path}。${error instanceof Error ? error.message : String(error)}`); }
  return parseWorldPackage(data);
}
