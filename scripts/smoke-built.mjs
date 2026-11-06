import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { fingerprint } from './release-fingerprint.mjs';

const cli=resolve('dist/cli/index.js');
let temporary;
const results=[];
function report(status, extra={}) {
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/built-smoke.json',JSON.stringify({timestamp:new Date().toISOString(),node:process.versions.node,ok:status==='passed',status,results,...extra},null,2)+'\n');
}
function run(args) {
  const child=spawnSync(process.execPath,[cli,...args],{cwd:temporary,encoding:'utf8',timeout:20000});
  assert.equal(child.status,0,child.stderr||String(child.error));
  return JSON.parse(child.stdout);
}
report('running');
try {
  const inputs=fingerprint('built-smoke');
  temporary=mkdtempSync(join(tmpdir(),'text-world-built-'));
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
  assert.deepEqual(fingerprint('built-smoke'),inputs,'Verification inputs changed during built smoke');
  report('passed',{fingerprint:inputs});
  console.log('构建后的 JS、跨工作目录启动、外部模块与文件存档验证通过');
} catch(error) {
  report('failed',{error:String(error)});
  throw error;
} finally { if(temporary)rmSync(temporary,{recursive:true,force:true}); }
