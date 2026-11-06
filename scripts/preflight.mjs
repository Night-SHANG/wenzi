import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fingerprint } from './release-fingerprint.mjs';

const checks = [];
function writeReport(status, extra={}) {
  const report={timestamp:new Date().toISOString(),node:process.versions.node,ok:status==='passed',status,checks,...extra};
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/preflight.json',JSON.stringify(report,null,2)+'\n');
}
function check(name, fn) {
  const start=performance.now();
  try { fn(); checks.push({name,ok:true,ms:Math.round(performance.now()-start)}); console.log(`通过：${name}`); }
  catch(error) { checks.push({name,ok:false,ms:Math.round(performance.now()-start),error:String(error)}); console.error(`未通过：${name}\n${error}`); }
}
function run(args) {
  const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:120000});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status!==0) throw result.error??new Error(`进程退出码 ${result.status}`);
}
writeReport('running');
try {
const inputs=fingerprint('preflight');
const {default:ts}=await import('typescript');
check('运行时与固定依赖',()=>{
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<24||(major===24&&minor<12))throw new Error('需要 Node.js 24.12.0 或更高版本');
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
  for(const [name,version]of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
    if(lock.packages[`node_modules/${name}`]?.version!==version)throw new Error(`${name} 的 Lock 版本不一致`);
  }
});
check('世界数据与项目文件',()=>{
  for(const file of ['src/contracts.ts','src/engine/index.ts','src/catalog.ts','src/cli/index.ts','README.md','THIRD_PARTY.md','docs/design.md']){
    if(!existsSync(file))throw new Error(`缺少 ${file}`);
  }
  for(const dir of ['worlds','examples'])for(const name of readdirSync(dir).filter(name=>name.endsWith('.json')))JSON.parse(readFileSync(join(dir,name),'utf8'));
});
check('宿主不依赖玩法或平台实现',()=>{
  for(const name of readdirSync('src/engine').filter(name=>name.endsWith('.ts'))){
    const path=join('src/engine',name),source=readFileSync(path,'utf8');
    const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
    for(const statement of ast.statements){
      if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)){
        const specifier=statement.moduleSpecifier.text;
        if(!specifier.startsWith('./')&&specifier!=='../contracts.ts'&&!['ajv','semver'].includes(specifier))throw new Error(`${path} 不允许依赖 ${specifier}`);
      }
    }
  }
});
check('TypeScript 严格类型检查',()=>run(['node_modules/typescript/bin/tsc','--noEmit']));
check('自动行为测试',()=>run(['scripts/test.mjs']));
check('全部世界实际运行与恢复',()=>run(['scripts/validate-worlds.mjs']));
assert.deepEqual(fingerprint('preflight'),inputs,'Verification inputs changed during preflight');
const ok=checks.every(value=>value.ok);
writeReport(ok?'passed':'failed',ok?{fingerprint:inputs}:{error:'One or more preflight checks failed'});
console.log(`Preflight：${checks.filter(value=>value.ok).length}/${checks.length} 项通过`);
if(!ok)process.exitCode=1;
} catch(error) {
  writeReport('failed',{error:String(error)});
  throw error;
}
