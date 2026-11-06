import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checkout = resolve('.');
function run(cwd: string, command: string, args: string[]) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 20000 });
}
async function put(root: string, name: string, contents: string) {
  await mkdir(resolve(root, name, '..'), { recursive: true });
  await writeFile(join(root, name), contents);
}

for (const [script, reportName] of [['smoke-built.mjs', 'built-smoke.json'], ['preflight.mjs', 'preflight.json']] as const) {
test(`an actual failing ${script} replaces an earlier successful report`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-failed-smoke-'));
  try {
    await put(root, `artifacts/${reportName}`, JSON.stringify({ ok: true, timestamp: 'prior-success' }));
    const result = run(root, process.execPath, [join(checkout, 'scripts', script)]);
    assert.notEqual(result.status, 0);
    const report = JSON.parse(await readFile(join(root, 'artifacts', reportName), 'utf8'));
    assert.equal(report.ok, false);
    assert.equal(report.status, 'failed');
    assert.equal(typeof report.error, 'string');
    assert.ok(report.error.length > 0);
    assert.notEqual(report.timestamp, 'prior-success');
  } finally { await rm(root, { recursive: true, force: true }); }
});
}

test('offline packaging rejects evidence after relevant bytes change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-stale-evidence-'));
  try {
    await cp(join(checkout, 'scripts'), join(root, 'scripts'), { recursive: true });
    for (const directory of ['src', 'tests', 'docs', 'worlds', 'examples', '.github']) {
      await put(root, `${directory}/fixture.txt`, 'fixture\n');
    }
    for (const name of ['tsconfig.json', '.gitignore', 'README.md', 'THIRD_PARTY.md', 'run-demo.cmd', 'play-farm.cmd']) {
      await put(root, name, '{}\n');
    }
    await put(root, 'package.json', JSON.stringify({ name: 'release-fixture', version: '1.0.0', type: 'module' }));
    await put(root, 'package-lock.json', JSON.stringify({ packages: {} }));
    await put(root, 'examples/custom-world.json', '{}');
    await put(root, 'examples/custom-module.mjs', '// fixture');
    // Exercise the real smoke script with a tiny CLI protocol fixture; no checkout outputs are changed.
    await put(root, 'dist/cli/index.js', `import {writeFileSync} from 'node:fs';
const snapshot={revision:1,modules:{research:{state:{progress:7}}}};
if(process.argv[2]==='inspect') console.log(JSON.stringify(snapshot));
else {const i=process.argv.indexOf('--save');if(i>=0)writeFileSync(process.argv[i+1],JSON.stringify(snapshot));console.log(JSON.stringify({snapshot,results:[{ok:true}]}));}
`);
    const smoke = run(root, process.execPath, ['scripts/smoke-built.mjs']);
    assert.equal(smoke.status, 0, smoke.stderr);
    const fingerprint = run(root, process.execPath, ['scripts/release-fingerprint.mjs', 'preflight']);
    assert.equal(fingerprint.status, 0, fingerprint.stderr);
    await put(root, 'artifacts/preflight.json', JSON.stringify({ ok: true, fingerprint: JSON.parse(fingerprint.stdout) }));
    for (const args of [['init'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture']]) {
      const result = run(root, 'git', args);
      assert.equal(result.status, 0, result.stderr);
    }
    const baseline = run(root, 'python3', ['scripts/package.py']);
    assert.equal(baseline.status, 0, baseline.stderr);
    for (const name of ['dist/cli/index.js', 'src/fixture.txt', 'worlds/fixture.txt', 'examples/custom-module.mjs', 'scripts/validate-worlds.mjs', 'tsconfig.json']) {
      const previous = await readFile(join(root, name), 'utf8');
      await put(root, name, previous + '\n');
      const stale = run(root, 'python3', ['scripts/package.py']);
      assert.notEqual(stale.status, 0, `accepted changed ${name}`);
      assert.match(stale.stderr, /stale verification/i, `${name}: ${stale.stderr}`);
      await put(root, name, previous);
    }
    const cli = await readFile(join(root, 'dist/cli/index.js'), 'utf8');
    await rm(join(root, 'dist/cli/index.js'));
    const missing = run(root, 'python3', ['scripts/package.py']);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /missing required.*dist\/cli\/index.js/i);
    await put(root, 'dist/cli/index.js', "throw new Error('intentional CLI failure');\n");
    const failedSmoke = run(root, process.execPath, ['scripts/smoke-built.mjs']);
    assert.notEqual(failedSmoke.status, 0);
    const failedReport = JSON.parse(await readFile(join(root, 'artifacts/built-smoke.json'), 'utf8'));
    assert.equal(failedReport.ok, false);
    assert.equal(failedReport.status, 'failed');
    assert.match(failedReport.error, /intentional CLI failure/);
    await put(root, 'dist/cli/index.js', cli);
    const failedPackage = run(root, 'python3', ['scripts/package.py']);
    assert.notEqual(failedPackage.status, 0);
    assert.match(failedPackage.stderr, /failed verification: built-smoke.json/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
