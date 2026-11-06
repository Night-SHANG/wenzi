import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtinRegistry } from '../catalog.ts';
import { createWorld, restoreWorld, reconfigureWorld } from '../engine/index.ts';
import type { ModuleRegistry, WorldRuntime } from '../engine/index.ts';
import type { CommandResult, JsonObject, ModuleDefinition, WorldSnapshot } from '../contracts.ts';
import { loadWorldPackage, worldNames } from '../worlds.ts';
import { JsonFileStorage } from '../adapters/storage.ts';
import { renderText, readTextView } from '../adapters/text.ts';

const storage = new JsonFileStorage();
const help = `模块化文字世界 · 作者运行工具\n\n用法：\n  node dist/cli/index.js list\n  node dist/cli/index.js demo farm [--json] [--save save.json]\n  node dist/cli/index.js play farm\n  node dist/cli/index.js validate path/to/world.json\n  node dist/cli/index.js inspect save.json\n  --plugin path/to/module.mjs  显式加载可信本地模块，可重复\n\n交互命令：\n  look / 状态\n  actions / 动作\n  do <实例> <操作> <JSON参数>\n  save <文件路径>\n  load <文件路径>\n  swap <世界包名称或路径>\n  exit / 退出\n\n这是模块与规则的运行入口，正式游戏界面另行设计。`;

function explain(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function report(result: CommandResult): void {
  if (!result.ok) { console.log(`操作未生效 [${result.error.code}]：${result.error.message}`); return; }
  console.log(`操作完成 · 状态版本 ${result.revision}`);
  for (const event of result.events) console.log(`  ${event.type} ${JSON.stringify(event.payload)}`);
}

async function plugins(registry: ModuleRegistry, paths: string[]): Promise<void> {
  for (const path of paths) {
    const imported = await import(pathToFileURL(resolve(path)).href);
    const exported: unknown = imported.default ?? imported.modules;
    const definitions = Array.isArray(exported) ? exported : [exported];
    for (const definition of definitions) registry.register(definition as ModuleDefinition);
  }
}

async function play(registry: ModuleRegistry, runtime: WorldRuntime): Promise<void> {
  console.log(renderText(runtime));
  console.log('输入 help 查看命令；输入 actions 查看这个世界的操作。');
  const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
  if (process.stdin.isTTY) { reader.setPrompt('世界> '); reader.prompt(); }
  try {
    for await (const raw of reader) {
      const line = raw.trim();
      if (!line) { if (process.stdin.isTTY) reader.prompt(); continue; }
      const separator = line.indexOf(' ');
      const verb = separator < 0 ? line : line.slice(0, separator);
      const rest = separator < 0 ? '' : line.slice(separator + 1).trim();
      try {
        if (verb === 'exit' || verb === '退出') break;
        if (verb === 'help' || verb === '帮助') console.log(help);
        else if (verb === 'look' || verb === '状态') console.log(renderText(runtime));
        else if (verb === 'actions' || verb === '动作') {
          for (const action of runtime.actions()) console.log(`${action.target} ${action.action} ${JSON.stringify(action.schema)}`);
        } else if (verb === 'do') {
          const match = rest.match(/^(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/);
          if (!match) throw new Error('用法：do <实例> <操作> {"参数":"值"}');
          const input: unknown = match[3] ? JSON.parse(match[3]) : {};
          report(runtime.dispatch({ target: match[1]!, action: match[2]!, input: input as JsonObject }));
          console.log(renderText(runtime));
        } else if (verb === 'save') {
          if (!rest) throw new Error('请指定存档文件路径');
          await storage.save(rest, runtime.snapshot());
          console.log(`已保存：${rest}`);
        } else if (verb === 'load') {
          if (!rest) throw new Error('请指定存档文件路径');
          const candidate = restoreWorld(registry, await storage.load(rest) as WorldSnapshot);
          const text = renderText(candidate);
          runtime = candidate;
          console.log(`已恢复：${rest}\n${text}`);
        } else if (verb === 'swap') {
          if (!rest) throw new Error('请指定新装配使用的世界包');
          const next = await loadWorldPackage(rest);
          const candidate = reconfigureWorld(registry, runtime, next.world);
          const text = renderText(candidate);
          runtime = candidate;
          console.log(`已切换模块装配\n${text}`);
        } else throw new Error(`未知命令：${verb}。输入 help 查看用法。`);
      } catch (error) { console.log(`未完成：${explain(error)}`); }
      if (process.stdin.isTTY) reader.prompt();
    }
  } finally { reader.close(); }
}

async function main(): Promise<void> {
  const parsed = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean' }, plugin: { type: 'string', multiple: true }, save: { type: 'string' } } });
  const [operation = 'help', name = 'farm'] = parsed.positionals;
  if (operation === 'help') { console.log(help); return; }
  if (operation === 'list') { console.log((await worldNames()).join('\n')); return; }
  const registry = builtinRegistry();
  await plugins(registry, parsed.values.plugin ?? []);
  if (operation === 'inspect') {
    if (!parsed.positionals[1]) throw new Error('inspect 需要存档文件路径');
    const runtime = restoreWorld(registry, await storage.load(name) as WorldSnapshot);
    console.log(parsed.values.json ? JSON.stringify(runtime.snapshot(), null, 2) : renderText(runtime));
    return;
  }
  if (!['demo','play','validate'].includes(operation)) throw new Error(`未知操作：${operation}`);
  const pack = await loadWorldPackage(name);
  const runtime = createWorld(registry, pack.world);
  if (operation === 'validate') { console.log(`世界包可装配：${pack.world.title}（${pack.world.modules.length} 个模块）`); return; }
  if (operation === 'play') { await play(registry, runtime); return; }
  const results: CommandResult[] = [];
  for (const [index, command] of pack.demo.entries()) {
    const result = runtime.dispatch({ ...command, id: command.id ?? `demo-${index + 1}` });
    results.push(result);
    if (!result.ok) throw new Error(`演示在第 ${index + 1} 步失败 [${result.error.code}]：${result.error.message}`);
  }
  const snapshot = runtime.snapshot();
  if (parsed.values.save) await storage.save(parsed.values.save, snapshot);
  if (parsed.values.json) console.log(JSON.stringify({ world: pack.world.title, results, view: readTextView(runtime), snapshot }, null, 2));
  else { console.log(renderText(runtime)); console.log(`\n已执行 ${results.length} 次行动，状态版本 ${runtime.revision}。`); }
}

main().catch(error => { console.error(`失败：${explain(error)}`); process.exitCode = 1; });
