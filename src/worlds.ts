import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command, WorldDefinition } from './contracts.ts';

export interface WorldPackage { format: 1; world: WorldDefinition; demo: Command[] }
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
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('世界包必须是 JSON 对象');
  const value = data as Record<string, unknown>;
  if (value.format !== 1 || !value.world || !Array.isArray(value.demo)) throw new Error('世界包格式错误：需要 format:1、world 和 demo 数组');
  for (const command of value.demo) {
    if (!command || typeof command !== 'object' || typeof command.target !== 'string' || typeof command.action !== 'string') {
      throw new Error('世界包 demo 中的命令需要 target 和 action');
    }
  }
  return data as WorldPackage;
}
