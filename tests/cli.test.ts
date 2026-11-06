import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function cli(args: string[], input?: string) {
  return spawnSync(process.execPath, ['src/cli/index.ts', ...args], { encoding: 'utf8', input, timeout: 20000 });
}

test('farm CLI executes actual modules and emits a restorable snapshot', () => {
  const r = cli(['demo', 'farm', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.results.length, 4);
  assert.ok(output.results.every((v: {ok:boolean}) => v.ok));
  assert.equal(output.snapshot.modules.market.state.coins, 10);
  assert.ok(output.view.lines.some((line: string) => line.includes('10')));
});

test('narrative world runs without loading inventory, combat or time', () => {
  const r = cli(['demo', 'story', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.snapshot.modules.story.state.node, 'archive');
  assert.deepEqual(Object.keys(output.snapshot.modules).sort(), ['story', 'view']);
});

test('an external module and world load through public registration', () => {
  const r = cli(['demo', 'examples/custom-world.json', '--plugin', 'examples/custom-module.mjs', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.snapshot.modules.research.state.progress, 7);
});

test('invalid JSON world fails with a nonzero status and useful error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'text-world-bad-'));
  try {
    const file = join(dir, 'bad.json');
    await writeFile(file, '{broken', 'utf8');
    const r = cli(['validate', file]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /JSON|格式|解析/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('interactive save/load keeps successful state after a rejected command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'text-world-save-'));
  try {
    const file = join(dir, 'world.json');
    const input = `do crops plant {"plot":"p1","crop":"turnip"}\ndo crops harvest {"plot":"p1"}\nsave ${file}\nload ${file}\nexit\n`;
    const r = cli(['play', 'farm'], input);
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.revision, 1);
    assert.equal(saved.modules.crops.state.plots.p1.crop, 'turnip');
    assert.match(r.stdout, /已保存/);
    assert.match(r.stdout, /已恢复/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('interactive JSON commands address whitespace and quoted IDs while malformed input preserves state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'text-world-command-'));
  try {
    const pack = JSON.parse(await readFile('worlds/frontier.json', 'utf8'));
    const id = '地图 "nodes" 空格';
    for (const instance of pack.world.modules) {
      if (instance.id === 'location') instance.id = id;
      for (const key of Object.keys(instance.bindings ?? {})) if (instance.bindings[key] === 'location') instance.bindings[key] = id;
    }
    for (const command of pack.demo) if (command.target === 'location') command.target = id;
    const worldFile = join(dir, 'world.json'), save = join(dir, 'saved.json');
    await writeFile(worldFile, JSON.stringify(pack));
    const commands = [
      { target: id, action: 'move', input: { to: 'forest' } },
      { target: 'gathering', action: 'gather', input: { site: 'wood' } },
      { target: id, action: 'move', input: [] },
      { target: id, action: 'move', input: { to: 'town' }, extra: true },
    ].map(command => `do ${JSON.stringify(command)}`);
    commands.push(`save ${save}`, 'exit', '');
    const r = cli(['play', worldFile], commands.join('\n'));
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(await readFile(save, 'utf8'));
    assert.equal(saved.revision, 2);
    assert.equal(saved.modules[id].state.current, 'forest');
    assert.equal(saved.modules.inventory.state.containers.player.wood, 3);
    assert.equal((r.stdout.match(/未完成：/g) ?? []).length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('interactive legacy commands dispatch to brace-prefixed targets and reject malformed commands without mutation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'text-world-brace-'));
  try {
    const pack = JSON.parse(await readFile('worlds/frontier.json', 'utf8'));
    const id = '{map';
    for (const instance of pack.world.modules) {
      if (instance.id === 'location') instance.id = id;
      for (const key of Object.keys(instance.bindings ?? {})) if (instance.bindings[key] === 'location') instance.bindings[key] = id;
    }
    for (const command of pack.demo) if (command.target === 'location') command.target = id;
    const worldFile = join(dir, 'world.json'), save = join(dir, 'saved.json');
    await writeFile(worldFile, JSON.stringify(pack));
    const commands = [
      'do {map move {"to":"forest"}',
      'do {"target":"{map","action":"move","input":{"to":"town"}}',
      'do {"target":"{map","action":"move","input":{"to":"forest"}',
      'do {"target":"{map","action":"move","input":{"to":"forest"},"extra":true}',
      'do {"target":"{map","action":"move","input":[]}',
      `save ${save}`, 'exit', '',
    ];
    const r = cli(['play', worldFile], commands.join('\n'));
    assert.equal(r.status, 0, r.stderr);
    const saved = JSON.parse(await readFile(save, 'utf8'));
    assert.equal(saved.revision, 2);
    assert.equal(saved.modules[id].state.current, 'town');
    assert.equal((r.stdout.match(/未完成：/g) ?? []).length, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('early argument errors honor json mode and end-of-options remains positional', () => {
  for (const args of [['modules', '--json', '--not-a-flag'], ['fork', 'farm', '--json', '--id']]) {
    const r = cli(args);
    assert.equal(r.status, 1);
    const error = JSON.parse(r.stderr);
    assert.equal(error.ok, false);
    assert.equal(typeof error.error.message, 'string');
  }
  const positional = cli(['not-an-operation', '--', '--json']);
  assert.equal(positional.status, 1);
  assert.match(positional.stderr, /^失败/);
});
