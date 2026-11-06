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
