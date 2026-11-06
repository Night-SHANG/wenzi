import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { builtinRegistry } from '../catalog.ts';
import { createWorld, restoreWorld, reconfigureWorld } from '../engine/index.ts';
import type { ModuleRegistry, WorldRuntime } from '../engine/index.ts';
import type { CommandResult, ModuleDefinition, WorldSnapshot } from '../contracts.ts';
import { loadWorldPackage, worldNames } from '../worlds.ts';
import { JsonFileStorage } from '../adapters/storage.ts';
import { renderText, readTextView } from '../adapters/text.ts';
import { writeWorldPackage } from '../adapters/world-package-files.ts';
import { cloneWorldPackage, inspectWorldPackage } from '../authoring/packages.ts';
import { patchWorldPackage } from '../authoring/patch.ts';
import type { PackageInspection } from '../authoring/contracts.ts';
import { EngineError, errorOf } from '../engine/json.ts';
import { formatActionCommand, parseActionCommand } from '../presentation/actions.ts';

const storage = new JsonFileStorage();
const help = `模块化文字世界 · 作者运行工具

运行：
  node dist/cli/index.js list [--json]
  node dist/cli/index.js demo farm [--json] [--save save.json]
  node dist/cli/index.js play farm
  node dist/cli/index.js inspect save.json [--json]

创作：
  node dist/cli/index.js modules [--json]
  node dist/cli/index.js describe inventory.basic [--json]
  node dist/cli/index.js fork farm --id author.my-world --out my-world.json [--title 标题]
  node dist/cli/index.js patch my-world.json --patch changes.json --out edited-world.json
  node dist/cli/index.js validate edited-world.json [--run-demo] [--json]
  check 是 validate 的别名。

参数：
  --plugin path/to/module.mjs  显式加载可信本地模块，可重复
  --run-demo                  检查时实际执行示范动作；可用于 fork、patch、validate
  --overwrite                 fork、patch 明确覆盖已有输出；默认保留已有文件
  --world-version 1.0.0       fork 时指定世界版本

交互命令：
  look / 状态
  actions / 动作
  do <实例> <操作> <JSON参数>
  do {"target":"任意实例 ID","action":"操作","input":{}}
  save <文件路径>
  load <文件路径>
  swap <世界包名称或路径>
  exit / 退出

这是模块与规则的运行入口，正式游戏界面另行设计。`;
let jsonErrors = false;

function inspectionMessage(result: PackageInspection): string {
  if (!result.ok) return `[${result.stage}/${result.error.code}] ${result.step === undefined ? '' : `第 ${result.step} 步：`}${result.error.message}`;
  const demo = result.demo.executed ? `示范动作 ${result.demo.steps} 步通过` : '未执行示范动作';
  return `${result.title}（${result.moduleCount} 个模块）；${demo}；存档恢复通过`;
}

function requireInspection(result: PackageInspection): asserts result is Extract<PackageInspection, { ok: true }> {
  if (!result.ok) throw new EngineError(result.error.code, inspectionMessage(result));
}

const operationRules: Record<string, { min: number; max: number; options: string[] }> = {
  help: { min: 0, max: 0, options: [] },
  list: { min: 0, max: 0, options: ['json'] },
  modules: { min: 0, max: 0, options: ['json', 'plugin'] },
  describe: { min: 1, max: 1, options: ['json', 'plugin'] },
  demo: { min: 0, max: 1, options: ['json', 'plugin', 'save'] },
  play: { min: 0, max: 1, options: ['plugin'] },
  inspect: { min: 1, max: 1, options: ['json', 'plugin'] },
  validate: { min: 0, max: 1, options: ['json', 'plugin', 'run-demo'] },
  check: { min: 0, max: 1, options: ['json', 'plugin', 'run-demo'] },
  fork: { min: 1, max: 1, options: ['json', 'plugin', 'id', 'title', 'world-version', 'out', 'overwrite', 'run-demo'] },
  patch: { min: 1, max: 1, options: ['json', 'plugin', 'patch', 'out', 'overwrite', 'run-demo'] },
};

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
          for (const action of runtime.actions()) console.log(`${formatActionCommand({ target: action.target, action: action.action })}\n  参数约定：${JSON.stringify(action.schema)}`);
        } else if (verb === 'do') {
          report(runtime.dispatch(parseActionCommand(rest)));
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
  const args = process.argv.slice(2), end = args.indexOf('--');
  jsonErrors = (end < 0 ? args : args.slice(0, end)).includes('--json');
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    json: { type: 'boolean' }, plugin: { type: 'string', multiple: true }, save: { type: 'string' },
    id: { type: 'string' }, title: { type: 'string' }, 'world-version': { type: 'string' },
    out: { type: 'string' }, patch: { type: 'string' }, overwrite: { type: 'boolean' }, 'run-demo': { type: 'boolean' },
  } });
  jsonErrors = Boolean(parsed.values.json);
  const [operation = 'help', name = 'farm'] = parsed.positionals;
  const rules = Object.hasOwn(operationRules, operation) ? operationRules[operation] : undefined;
  if (!rules) throw new EngineError('INVALID_ARGUMENT', `未知操作：${operation}`);
  const argumentsCount = Math.max(0, parsed.positionals.length - 1);
  if (argumentsCount < rules.min || argumentsCount > rules.max) throw new EngineError('INVALID_ARGUMENT', `${operation} 需要 ${rules.min === rules.max ? rules.min : `${rules.min}–${rules.max}`} 个位置参数；输入 help 查看用法`);
  for (const flag of Object.keys(parsed.values)) {
    if (!rules.options.includes(flag)) throw new EngineError('INVALID_ARGUMENT', `${operation} 不支持 --${flag}`);
  }
  for (const [flag, value] of Object.entries(parsed.values)) {
    if (typeof value === 'string' && !value.trim()) throw new EngineError('INVALID_ARGUMENT', `--${flag} 不能为空`);
  }
  if (operation === 'help') { console.log(help); return; }
  if (operation === 'list') {
    const names = await worldNames();
    console.log(parsed.values.json ? JSON.stringify(names, null, 2) : names.join('\n'));
    return;
  }
  const registry = builtinRegistry();
  await plugins(registry, parsed.values.plugin ?? []);
  if (operation === 'modules' || operation === 'describe') {
    const catalog = registry.catalog();
    if (operation === 'modules') {
      if (parsed.values.json) console.log(JSON.stringify(catalog, null, 2));
      else for (const entry of catalog) console.log(`${entry.manifest.id} · ${entry.manifest.title} · ${entry.manifest.version}\n  提供：${Object.keys(entry.manifest.provides).join('、') || '无'}；需要：${Object.keys(entry.manifest.requires ?? {}).join('、') || '无'}`);
    } else {
      const entry = catalog.find(value => value.manifest.id === name);
      if (!entry) throw new EngineError('UNKNOWN_MODULE', `模块未注册：${name}`);
      console.log(JSON.stringify(entry, null, 2));
    }
    return;
  }
  if (operation === 'inspect') {
    if (!parsed.positionals[1]) throw new Error('inspect 需要存档文件路径');
    const runtime = restoreWorld(registry, await storage.load(name) as WorldSnapshot);
    console.log(parsed.values.json ? JSON.stringify(runtime.snapshot(), null, 2) : renderText(runtime));
    return;
  }
  if (operation === 'fork' || operation === 'patch') {
    if (!parsed.values.out) throw new EngineError('INVALID_ARGUMENT', `${operation} 需要 --out 输出文件路径`);
    if (operation === 'fork' && !parsed.values.id) throw new EngineError('INVALID_ARGUMENT', 'fork 需要 --id 新世界标识');
    if (operation === 'patch' && !parsed.values.patch) throw new EngineError('INVALID_ARGUMENT', 'patch 需要 --patch 补丁文件路径');
    const source = await loadWorldPackage(name);
    let candidate;
    if (operation === 'fork') {
      candidate = cloneWorldPackage(source, {
        id: parsed.values.id!,
        ...(parsed.values.title === undefined ? {} : { title: parsed.values.title }),
        ...(parsed.values['world-version'] === undefined ? {} : { version: parsed.values['world-version'] }),
      });
    } else {
      let changes: unknown;
      try { changes = JSON.parse(await readFile(resolve(parsed.values.patch!), 'utf8')); }
      catch (error) { throw new EngineError('INVALID_PATCH_FILE', `无法读取或解析补丁 JSON：${parsed.values.patch}。${explain(error)}`); }
      candidate = patchWorldPackage(source, changes);
    }
    const inspection = inspectWorldPackage(registry, candidate, { runDemo: Boolean(parsed.values['run-demo']) });
    requireInspection(inspection);
    await writeWorldPackage(parsed.values.out, candidate, { overwrite: Boolean(parsed.values.overwrite) });
    const file = resolve(parsed.values.out);
    if (parsed.values.json) console.log(JSON.stringify({ ok: true, file, worldId: candidate.world.id, inspection }, null, 2));
    else console.log(`已导出：${file}\n${inspectionMessage(inspection)}`);
    return;
  }
  if (operation === 'validate' || operation === 'check') {
    let inspection: PackageInspection;
    try {
      const pack = await loadWorldPackage(name);
      inspection = inspectWorldPackage(registry, pack, { runDemo: Boolean(parsed.values['run-demo']) });
    } catch (error) {
      const detail = errorOf(error, 'INVALID_PACKAGE_FILE');
      inspection = { ok: false, stage: 'package', error: { code: detail.code, message: detail.message } };
    }
    if (parsed.values.json) console.log(JSON.stringify(inspection, null, 2));
    else if (inspection.ok) console.log(`世界包检查通过：${inspectionMessage(inspection)}`);
    else console.error(`世界包检查未通过：${inspectionMessage(inspection)}`);
    if (!inspection.ok) process.exitCode = 1;
    return;
  }
  const pack = await loadWorldPackage(name);
  const runtime = createWorld(registry, pack.world);
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

main().catch(error => {
  const detail = errorOf(error, 'CLI_ERROR');
  if (jsonErrors) console.error(JSON.stringify({ ok: false, error: { code: detail.code, message: detail.message } }));
  else console.error(`失败 [${detail.code}]：${detail.message}`);
  process.exitCode = 1;
});
