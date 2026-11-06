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
  const names=run(['list','--json']);
  assert.ok(Array.isArray(names)&&['frontier','frontier-continuous','campaign','campaign-continuous'].every(name=>names.includes(name)));
  for(const name of names){
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
  const catalog=run(['modules','--json']);
  assert.ok(['quests.journal','encounters.duel','progression.track'].every(id=>catalog.some(row=>row.manifest.id===id)));
  const forked=join(temporary,'my authored farm.json');
  const edited=join(temporary,'authored-farm.json');
  assert.equal(run(['fork','farm','--id','author.smoke-farm','--out',forked,'--json']).ok,true);
  assert.equal(run(['patch',forked,'--patch',resolve('examples/farm-authoring.patch.json'),'--out',edited,'--run-demo','--json']).ok,true);
  const inspection=run(['validate',edited,'--run-demo','--json']);
  assert.equal(inspection.ok,true);
  assert.equal(inspection.demo.steps,4);
  const authoredSave=join(temporary,'authored-farm.save.json');
  const authored=run(['demo',edited,'--json','--save',authoredSave]);
  assert.equal(authored.snapshot.modules.market.state.coins,10);
  assert.equal(authored.snapshot.definition.modules[0].module,'capacity.physical');
  assert.deepEqual(run(['inspect',authoredSave,'--json']),authored.snapshot);
  results.push({world:'authored-farm',actions:authored.results.length,revision:authored.snapshot.revision,ok:true});
  const researchFork=join(temporary,'authored-research.json');
  const researchEdited=join(temporary,'authored-research-edited.json');
  const researchPatch=join(temporary,'research.patch.json');
  const plugin=resolve('examples/custom-module.mjs');
  assert.equal(run(['fork',resolve('examples/custom-world.json'),'--id','author.smoke-research','--out',researchFork,'--plugin',plugin,'--json']).ok,true);
  writeFileSync(researchPatch,JSON.stringify([{op:'replace',path:'/demo/0/input/amount',value:9}]));
  assert.equal(run(['patch',researchFork,'--patch',researchPatch,'--out',researchEdited,'--plugin',plugin,'--run-demo','--json']).ok,true);
  const research=run(['demo',researchEdited,'--plugin',plugin,'--json']);
  assert.equal(research.snapshot.modules.research.state.progress,13);
  results.push({world:'authored-external-module',actions:research.results.length,revision:research.snapshot.revision,ok:true});
  const frontierFork=join(temporary,'my frontier.json');
  const frontierEdited=join(temporary,'frontier-edited.json');
  const frontierPatch=join(temporary,'frontier.patch.json');
  assert.equal(run(['fork','frontier','--id','author.smoke-frontier','--out',frontierFork,'--json']).ok,true);
  const frontierPack=JSON.parse(readFileSync(frontierFork,'utf8'));
  const ruleIndex=frontierPack.world.modules.findIndex(instance=>instance.id==='gather-rules');
  assert.ok(ruleIndex>=0);
  writeFileSync(frontierPatch,JSON.stringify([
    {op:'test',path:`/world/modules/${ruleIndex}/id`,value:'gather-rules'},
    {op:'replace',path:`/world/modules/${ruleIndex}/config/rules/wood/quantity`,value:4}
  ]));
  assert.equal(run(['patch',frontierFork,'--patch',frontierPatch,'--out',frontierEdited,'--run-demo','--json']).ok,true);
  const frontier=run(['demo',frontierEdited,'--json']);
  assert.equal(frontier.snapshot.modules.market.state.coins,18);
  assert.equal(frontier.snapshot.modules.inventory.state.containers.player.wood,2);
  assert.equal(frontier.snapshot.modules.workshop.state.job,null);
  results.push({world:'authored-frontier',actions:frontier.results.length,revision:frontier.snapshot.revision,ok:true});
  const checkpoint=join(temporary,'frontier checkpoint.save.json');
  const resumed=join(temporary,'frontier resumed.save.json');
  const originalFrontier=JSON.parse(readFileSync(resolve('worlds/frontier.json'),'utf8'));
  const commands=originalFrontier.demo.map(command=>`do ${command.target} ${command.action} ${JSON.stringify(command.input??{})}`);
  commands.push(`save ${checkpoint}`,'do location move {"to":"forest"}','do gathering gather {"site":"wood"}',`load ${checkpoint}`,`save ${resumed}`,'exit','');
  const interactive=spawnSync(process.execPath,[cli,'play','frontier'],{cwd:temporary,input:commands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(interactive.status,0,interactive.stderr||String(interactive.error));
  assert.doesNotMatch(interactive.stdout,/操作未生效|未完成：/);
  assert.match(interactive.stdout,/已恢复：/);
  const beforeResume=JSON.parse(readFileSync(checkpoint,'utf8'));
  const afterResume=JSON.parse(readFileSync(resumed,'utf8'));
  assert.equal(beforeResume.modules.market.state.coins,18);
  assert.equal(beforeResume.modules.inventory.state.containers.player.wood,1);
  assert.deepEqual(afterResume,beforeResume);
  results.push({world:'interactive-frontier-save-load',actions:originalFrontier.demo.length+2,revision:afterResume.revision,ok:true});
  const campaignFork=join(temporary,'my campaign.json');
  const campaignEdited=join(temporary,'campaign-edited.json');
  const campaignPatch=join(temporary,'campaign.patch.json');
  assert.equal(run(['fork','campaign','--id','author.smoke-campaign','--out',campaignFork,'--json']).ok,true);
  const campaignPack=JSON.parse(readFileSync(campaignFork,'utf8'));
  const questIndex=campaignPack.world.modules.findIndex(instance=>instance.id==='quest-rules');
  assert.ok(questIndex>=0);
  writeFileSync(campaignPatch,JSON.stringify([
    {op:'test',path:`/world/modules/${questIndex}/id`,value:'quest-rules'},
    {op:'replace',path:`/world/modules/${questIndex}/config/quests/guard/experience`,value:35}
  ]));
  assert.equal(run(['patch',campaignFork,'--patch',campaignPatch,'--out',campaignEdited,'--run-demo','--json']).ok,true);
  const campaign=run(['demo',campaignEdited,'--json']);
  assert.equal(campaign.snapshot.modules.progression.state.experience,110);
  assert.equal(campaign.snapshot.modules.market.state.coins,16);
  assert.deepEqual(campaign.snapshot.modules.quests.state.completed,{supply:1,patrol:1,guard:1});
  results.push({world:'authored-campaign',actions:campaign.results.length,revision:campaign.snapshot.revision,ok:true});

  const campaignCheckpoint=join(temporary,'campaign checkpoint.save.json');
  const campaignResumed=join(temporary,'campaign resumed.save.json');
  const originalCampaign=JSON.parse(readFileSync(resolve('worlds/campaign.json'),'utf8'));
  const campaignCommands=originalCampaign.demo.map(command=>`do ${JSON.stringify(command)}`);
  campaignCommands.push(`save ${campaignCheckpoint}`,'do location move {"to":"forest"}','do gathering gather {"site":"wood"}',`load ${campaignCheckpoint}`,`save ${campaignResumed}`,'exit','');
  const campaignPlay=spawnSync(process.execPath,[cli,'play','campaign'],{cwd:temporary,input:campaignCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(campaignPlay.status,0,campaignPlay.stderr||String(campaignPlay.error));
  assert.doesNotMatch(campaignPlay.stdout,/操作未生效|未完成：/);
  assert.match(campaignPlay.stdout,/已恢复：/);
  const campaignBefore=JSON.parse(readFileSync(campaignCheckpoint,'utf8'));
  assert.equal(campaignBefore.modules.progression.state.experience,105);
  assert.equal(campaignBefore.modules.vitals.state.hp,22);
  assert.deepEqual(campaignBefore.modules.encounters.state.wins,{wolf:2,raider:1});
  assert.deepEqual(JSON.parse(readFileSync(campaignResumed,'utf8')),campaignBefore);
  results.push({world:'interactive-campaign-save-load',actions:originalCampaign.demo.length+2,revision:campaignBefore.revision,ok:true});

  const renamed=structuredClone(originalCampaign), renamedFile=join(temporary,'quoted campaign.json'), renamedSave=join(temporary,'quoted campaign.save.json');
  const ids=new Map(renamed.world.modules.map(instance=>[instance.id,`模块 "${instance.id}" 空格`]));
  for(const instance of renamed.world.modules){
    instance.id=ids.get(instance.id);
    for(const key of Object.keys(instance.bindings??{})) instance.bindings[key]=ids.get(instance.bindings[key]);
  }
  renamed.world.entryView.instance=ids.get(renamed.world.entryView.instance);
  for(const command of renamed.demo)command.target=ids.get(command.target);
  writeFileSync(renamedFile,JSON.stringify(renamed));
  const renamedCommands=renamed.demo.map(command=>`do ${JSON.stringify(command)}`);
  renamedCommands.push(`save ${renamedSave}`,'exit','');
  const renamedPlay=spawnSync(process.execPath,[cli,'play',renamedFile],{cwd:temporary,input:renamedCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(renamedPlay.status,0,renamedPlay.stderr||String(renamedPlay.error));
  assert.doesNotMatch(renamedPlay.stdout,/操作未生效|未完成：/);
  const renamedSnapshot=JSON.parse(readFileSync(renamedSave,'utf8'));
  assert.equal(renamedSnapshot.modules[ids.get('progression')].state.experience,105);
  assert.equal(renamedSnapshot.modules[ids.get('market')].state.coins,16);
  assert.equal(renamedSnapshot.modules[ids.get('vitals')].state.hp,22);
  assert.deepEqual(renamedSnapshot.modules[ids.get('quests')].state.completed,{supply:1,patrol:1,guard:1});
  results.push({world:'interactive-campaign-arbitrary-ids',actions:renamed.demo.length,revision:renamedSnapshot.revision,ok:true});
  assert.deepEqual(fingerprint('built-smoke'),inputs,'Verification inputs changed during built smoke');
  report('passed',{fingerprint:inputs});
  console.log('构建后的 JS、跨目录启动、世界创作、交互任务战斗成长、任意ID与文件存档验证通过');
} catch(error) {
  report('failed',{error:String(error)});
  throw error;
} finally { if(temporary)rmSync(temporary,{recursive:true,force:true}); }
