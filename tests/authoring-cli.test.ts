import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cliPath = resolve(root, 'src/cli/index.ts');
const pluginPath = resolve(root, 'examples/custom-module.mjs');
const customWorld = resolve(root, 'examples/custom-world.json');
function cli(args: string[], cwd = root) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8', timeout: 20000 });
}
function success(args: string[], cwd = root): any {
  const result = cli(args, cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
async function temporary(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'text-world-author-cli-'));
  try { await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('authors can discover built-in and external module schemas without assembling a world', () => {
  const modules = success(['modules', '--json']);
  assert.equal(modules.length, 16);
  assert.ok(modules.some((entry: any) => entry.manifest.id === 'capacity.physical'));
  const inventory = success(['describe', 'inventory.basic', '--json']);
  assert.equal(inventory.manifest.id, 'inventory.basic');
  assert.equal(inventory.commands.transfer.schema.type, 'object');
  assert.equal(inventory.configSchema.type, 'object');
  const external = success(['describe', 'author.research.counter', '--plugin', pluginPath, '--json']);
  assert.equal(external.manifest.id, 'author.research.counter');
  assert.equal(external.commands.study.schema.type, 'object');
  const absent = cli(['describe', 'author.absent', '--json']);
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /UNKNOWN_MODULE/);
});

test('world inspection reports whether demo execution was requested', () => {
  const structural = success(['validate', 'farm', '--json']);
  assert.equal(structural.ok, true);
  assert.equal(structural.demo.executed, false);
  assert.equal(structural.demo.steps, 0);
  assert.equal(structural.restored, true);
  const exercised = success(['check', 'farm', '--run-demo', '--json']);
  assert.equal(exercised.demo.executed, true);
  assert.equal(exercised.demo.steps, 4);
  assert.equal(exercised.demo.finalRevision, 4);
});

test('fork, patch, inspect and run work from a different directory with spaced paths', async () => {
  await temporary(async directory => {
    const forked = join(directory, 'my world.json');
    const edited = join(directory, 'edited world.json');
    const saved = join(directory, 'my save.json');
    success(['fork', 'farm', '--id', 'author.my-farm', '--title', '我的农田', '--out', forked, '--run-demo', '--json'], directory);
    const original = await readFile(forked, 'utf8');
    assert.equal(JSON.parse(original).world.title, '我的农田');
    const patch = join(directory, 'rule changes.json');
    await writeFile(patch, JSON.stringify([
      { op: 'test', path: '/world/modules/0/id', value: 'capacity' },
      { op: 'replace', path: '/world/modules/0/module', value: 'capacity.physical' },
      { op: 'replace', path: '/world/title', value: '我的物理容量农田' },
      { op: 'replace', path: '/world/modules/6/config/title', value: '我的物理容量农田' },
    ]));
    success(['patch', forked, '--patch', patch, '--out', edited, '--run-demo', '--json'], directory);
    assert.equal(await readFile(forked, 'utf8'), original);
    const checked = success(['validate', edited, '--run-demo', '--json'], directory);
    assert.equal(checked.worldId, 'author.my-farm');
    const played = success(['demo', edited, '--json', '--save', saved], directory);
    assert.equal(played.snapshot.modules.market.state.coins, 10);
    assert.equal(played.snapshot.definition.modules[0].module, 'capacity.physical');
    assert.equal(played.view.title, '我的物理容量农田');
    const restored = success(['inspect', saved, '--json'], directory);
    assert.deepEqual(restored, played.snapshot);
  });
});

test('external author modules can be forked and edited through the same commands', async () => {
  await temporary(async directory => {
    const forked = join(directory, 'research.json');
    const edited = join(directory, 'research-edited.json');
    const patch = join(directory, 'research.patch.json');
    success(['fork', customWorld, '--id', 'author.my-research', '--out', forked, '--plugin', pluginPath, '--json']);
    await writeFile(patch, JSON.stringify([{ op: 'replace', path: '/demo/0/input/amount', value: 9 }]));
    success(['patch', forked, '--patch', patch, '--out', edited, '--plugin', pluginPath, '--run-demo', '--json']);
    const played = success(['demo', edited, '--plugin', pluginPath, '--json']);
    assert.equal(played.snapshot.modules.research.state.progress, 13);
    assert.equal(JSON.parse(await readFile(forked, 'utf8')).demo[0].input.amount, 3);
  });
});

test('a late failed patch leaves an existing output untouched even with overwrite requested', async () => {
  await temporary(async directory => {
    const patch = join(directory, 'bad.patch.json');
    const output = join(directory, 'keep.json');
    const before = '{"keep":"this exact data"}\n';
    await writeFile(output, before);
    await writeFile(patch, JSON.stringify([
      { op: 'replace', path: '/world/title', value: '不应写入' },
      { op: 'test', path: '/format', value: 99 },
    ]));
    const failed = cli(['patch', 'farm', '--patch', patch, '--out', output, '--overwrite', '--json']);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /TEST|test|测试/);
    assert.equal(await readFile(output, 'utf8'), before);
    assert.deepEqual((await readdir(directory)).sort(), ['bad.patch.json', 'keep.json']);
  });
});

test('removing a required capability provider cannot export a broken world', async () => {
  await temporary(async directory => {
    const patch = join(directory, 'remove.patch.json');
    const output = join(directory, 'broken.json');
    await writeFile(patch, JSON.stringify([{ op: 'remove', path: '/world/modules/0' }]));
    const failed = cli(['patch', 'farm', '--patch', patch, '--out', output, '--json']);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /UNKNOWN_BINDING|unknown provider/);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
  });
});

test('same-file editing requires explicit overwrite and otherwise preserves the source', async () => {
  await temporary(async directory => {
    const world = join(directory, 'world.json');
    const patch = join(directory, 'rename.patch.json');
    success(['fork', 'story', '--id', 'author.story', '--out', world, '--json']);
    const before = await readFile(world, 'utf8');
    await writeFile(patch, JSON.stringify([{ op: 'replace', path: '/world/title', value: '改名后的故事' }]));
    assert.equal(cli(['patch', world, '--patch', patch, '--out', world]).status, 1);
    assert.equal(await readFile(world, 'utf8'), before);
    success(['patch', world, '--patch', patch, '--out', world, '--overwrite', '--json']);
    assert.equal(JSON.parse(await readFile(world, 'utf8')).world.title, '改名后的故事');
  });
});

test('JSON inspection identifies a failed second demo step and command mistakes fail visibly', async () => {
  await temporary(async directory => {
    const pack = JSON.parse(await readFile(resolve(root, 'worlds/farm.json'), 'utf8'));
    pack.demo[1].action = 'missing-action';
    const path = join(directory, 'bad-demo.json');
    await writeFile(path, JSON.stringify(pack));
    assert.equal(success(['validate', path, '--json']).ok, true);
    const result = cli(['validate', path, '--run-demo', '--json']);
    assert.equal(result.status, 1);
    const diagnostic = JSON.parse(result.stdout);
    assert.equal(diagnostic.ok, false);
    assert.equal(diagnostic.stage, 'demo');
    assert.equal(diagnostic.step, 2);
    assert.equal(cli(['fork', 'farm', '--out', join(directory, 'missing-id.json')]).status, 1);
    assert.equal(cli(['validate', 'farm', 'ignored.json']).status, 1);
    assert.equal(cli(['list', '--overwrite']).status, 1);
  });
});

test('malformed package input produces a machine-readable failed validation report', async () => {
  await temporary(async directory => {
    const file = join(directory, 'malformed.json');
    await writeFile(file, '{bad json');
    const failed = cli(['validate', file, '--json']);
    assert.equal(failed.status, 1);
    const report = JSON.parse(failed.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.stage, 'package');
    assert.match(report.error.message, /JSON|解析/);
  });
});
