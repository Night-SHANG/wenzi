import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort().map(name => `tests/${name}`);
if (!files.length) throw new Error('没有找到测试文件');
const run = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
