import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const cli=resolve('dist/cli/index.js');
const temporary=mkdtempSync(join(tmpdir(),'text-world-built-'));
const results=[];
function run(args) {
  const child=spawnSync(process.execPath,[cli,...args],{cwd:temporary,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr||String(child.error));
  return JSON.parse(child.stdout);
}
try {
  for(const name of ['farm','farm-continuous','farm-physical','farm-greenhouse','tactics','story']){
    const save=join(temporary,`${name}.json`);
    const output=run(['demo',name,'--json','--save',save]);
    const restored=run(['inspect',save,'--json']);
    assert.deepEqual(restored,output.snapshot);
    assert.deepEqual(JSON.parse(readFileSync(save,'utf8')),output.snapshot);
    results.push({world:name,actions:output.results.length,revision:restored.revision,ok:true});
    console.log(`构建产物通过：${name}`);
  }
  const custom=run(['demo',resolve('examples/custom-world.json'),'--plugin',resolve('examples/custom-module.mjs'),'--json']);
  assert.equal(custom.snapshot.modules.research.state.progress,7);
  results.push({world:'external-author-module',actions:custom.results.length,revision:custom.snapshot.revision,ok:true});
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/built-smoke.json',JSON.stringify({timestamp:new Date().toISOString(),node:process.versions.node,ok:true,results},null,2)+'\n');
  console.log('构建后的 JS、跨工作目录启动、外部模块与文件存档验证通过');
} finally { rmSync(temporary,{recursive:true,force:true}); }
