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
  assert.ok(Array.isArray(names)&&['frontier','frontier-continuous','campaign','campaign-continuous','loadout','loadout-continuous','party','party-continuous'].every(name=>names.includes(name)));
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
  assert.ok(['quests.journal','encounters.duel','progression.track','equipment.slots','effects.timed','skills.combat','party.roster','battles.party','initiative.speed','targeting.lowest-hp','vitals.party-member'].every(id=>catalog.some(row=>row.manifest.id===id)));
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

  const loadoutFork=join(temporary,'my loadout.json'), loadoutEdited=join(temporary,'loadout-edited.json'), loadoutPatch=join(temporary,'loadout.patch.json');
  assert.equal(run(['fork','loadout','--id','author.smoke-loadout','--out',loadoutFork,'--json']).ok,true);
  const loadoutPack=JSON.parse(readFileSync(loadoutFork,'utf8'));
  const skillIndex=loadoutPack.world.modules.findIndex(instance=>instance.id==='skill-rules');
  assert.ok(skillIndex>=0);
  writeFileSync(loadoutPatch,JSON.stringify([
    {op:'test',path:`/world/modules/${skillIndex}/id`,value:'skill-rules'},
    {op:'replace',path:`/world/modules/${skillIndex}/config/skills/cleave/costs`,value:{}}
  ]));
  assert.equal(run(['patch',loadoutFork,'--patch',loadoutPatch,'--out',loadoutEdited,'--run-demo','--json']).ok,true);
  assert.equal(run(['validate',loadoutEdited,'--run-demo','--json']).ok,true);
  const authoredLoadout=run(['demo',loadoutEdited,'--json']);
  assert.equal(authoredLoadout.snapshot.modules.inventory.state.containers.player.spark,3);
  assert.equal(authoredLoadout.snapshot.modules.progression.state.experience,105);
  assert.equal(authoredLoadout.snapshot.modules.vitals.state.hp,34);
  assert.deepEqual(authoredLoadout.snapshot.modules.effects.state.active,{});
  results.push({world:'authored-loadout',actions:authoredLoadout.results.length,revision:authoredLoadout.snapshot.revision,ok:true});

  const originalLoadout=JSON.parse(readFileSync(resolve('worlds/loadout.json'),'utf8'));
  const checkpointIndex=originalLoadout.demo.findIndex(command=>command.target==='skills')+1;
  assert.ok(checkpointIndex>0);
  const loadoutCheckpoint=join(temporary,'loadout active.save.json'), loadoutFinal=join(temporary,'loadout final.save.json'), loadoutResumed=join(temporary,'loadout resumed.save.json');
  const initialCommands=originalLoadout.demo.slice(0,checkpointIndex).map(command=>`do ${JSON.stringify(command)}`);
  const laterCommands=originalLoadout.demo.slice(checkpointIndex).map(command=>`do ${JSON.stringify(command)}`);
  const loadoutCommands=[...initialCommands,`save ${loadoutCheckpoint}`,...laterCommands,`save ${loadoutFinal}`,`load ${loadoutCheckpoint}`,...laterCommands,`save ${loadoutResumed}`,'exit',''];
  const loadoutPlay=spawnSync(process.execPath,[cli,'play','loadout'],{cwd:temporary,input:loadoutCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(loadoutPlay.status,0,loadoutPlay.stderr||String(loadoutPlay.error));
  assert.doesNotMatch(loadoutPlay.stdout,/操作未生效|未完成：/);
  assert.match(loadoutPlay.stdout,/已恢复：/);
  const midLoadout=JSON.parse(readFileSync(loadoutCheckpoint,'utf8'));
  assert.equal(midLoadout.modules.encounters.state.battle.enemyHp,1);
  assert.equal(midLoadout.modules.vitals.state.hp,17);
  assert.equal(midLoadout.modules.effects.state.active.rally.expiresAt,70);
  assert.equal(midLoadout.modules.skills.state.cooldowns.cleave.readyAt,60);
  assert.equal(midLoadout.modules.equipment.state.slots.hand.id,'sword');
  const finalLoadout=JSON.parse(readFileSync(loadoutFinal,'utf8'));
  assert.equal(finalLoadout.modules.progression.state.experience,105);
  assert.equal(finalLoadout.modules.vitals.state.hp,34);
  assert.equal(finalLoadout.modules.clock.state.elapsedSeconds,90);
  assert.equal(finalLoadout.modules.inventory.state.containers.player.spark,0);
  assert.deepEqual(JSON.parse(readFileSync(loadoutResumed,'utf8')),finalLoadout);
  results.push({world:'interactive-loadout-active-save-load',actions:originalLoadout.demo.length+laterCommands.length,revision:finalLoadout.revision,ok:true});

  const quotedLoadout=structuredClone(originalLoadout), quotedLoadoutFile=join(temporary,'quoted loadout.json'), quotedLoadoutSave=join(temporary,'quoted loadout.save.json');
  const loadoutIds=new Map(quotedLoadout.world.modules.map(instance=>[instance.id,`模组 "${instance.id}" 😀`]));
  for(const instance of quotedLoadout.world.modules){
    instance.id=loadoutIds.get(instance.id);
    for(const key of Object.keys(instance.bindings??{}))instance.bindings[key]=loadoutIds.get(instance.bindings[key]);
  }
  quotedLoadout.world.entryView.instance=loadoutIds.get(quotedLoadout.world.entryView.instance);
  for(const command of quotedLoadout.demo)command.target=loadoutIds.get(command.target);
  writeFileSync(quotedLoadoutFile,JSON.stringify(quotedLoadout));
  const quotedCommands=quotedLoadout.demo.map(command=>`do ${JSON.stringify(command)}`);
  quotedCommands.push(`save ${quotedLoadoutSave}`,'exit','');
  const quotedPlay=spawnSync(process.execPath,[cli,'play',quotedLoadoutFile],{cwd:temporary,input:quotedCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(quotedPlay.status,0,quotedPlay.stderr||String(quotedPlay.error));
  assert.doesNotMatch(quotedPlay.stdout,/操作未生效|未完成：/);
  const quotedSnapshot=JSON.parse(readFileSync(quotedLoadoutSave,'utf8'));
  assert.equal(quotedSnapshot.modules[loadoutIds.get('progression')].state.experience,105);
  assert.equal(quotedSnapshot.modules[loadoutIds.get('vitals')].state.hp,34);
  assert.equal(quotedSnapshot.modules[loadoutIds.get('inventory')].state.containers.player.spark,0);
  assert.deepEqual(quotedSnapshot.modules[loadoutIds.get('encounters')].state.wins,{wolf:2,raider:1});
  results.push({world:'interactive-loadout-arbitrary-ids',actions:quotedLoadout.demo.length,revision:quotedSnapshot.revision,ok:true});

  const partyFork=join(temporary,'my party.json'), partyEdited=join(temporary,'party-edited.json'), partyPatch=join(temporary,'party.patch.json');
  assert.equal(run(['fork','party','--id','author.smoke-party','--out',partyFork,'--json']).ok,true);
  const partyPack=JSON.parse(readFileSync(partyFork,'utf8'));
  const squadIndex=partyPack.world.modules.findIndex(instance=>instance.id==='squad-rules');
  assert.ok(squadIndex>=0);
  writeFileSync(partyPatch,JSON.stringify([
    {op:'test',path:`/world/modules/${squadIndex}/id`,value:'squad-rules'},
    {op:'replace',path:`/world/modules/${squadIndex}/config/encounters/wolves/loot/pelt`,value:2}
  ]));
  assert.equal(run(['patch',partyFork,'--patch',partyPatch,'--out',partyEdited,'--run-demo','--json']).ok,true);
  assert.equal(run(['validate',partyEdited,'--run-demo','--json']).ok,true);
  const authoredParty=run(['demo',partyEdited,'--json']);
  assert.equal(authoredParty.results.length,63);
  assert.equal(authoredParty.snapshot.modules.inventory.state.containers.player.pelt,2);
  assert.equal(authoredParty.snapshot.modules.progression.state.experience,105);
  assert.equal(authoredParty.snapshot.modules.party.state.members.lin.hp,14);
  assert.equal(authoredParty.snapshot.modules.session.state.owner,null);
  results.push({world:'authored-party',actions:authoredParty.results.length,revision:authoredParty.snapshot.revision,ok:true});

  const originalParty=JSON.parse(readFileSync(resolve('worlds/party.json'),'utf8'));
  const partyCheckpoint=join(temporary,'party active.save.json'), partyFinal=join(temporary,'party final.save.json'), partyResumed=join(temporary,'party resumed.save.json');
  const partySplit=originalParty.demo.findIndex(command=>command.target==='skills')+1;
  assert.equal(partySplit,27);
  const partyBefore=originalParty.demo.slice(0,partySplit).map(command=>`do ${JSON.stringify(command)}`);
  const partyAfter=originalParty.demo.slice(partySplit).map(command=>`do ${JSON.stringify(command)}`);
  const partyCommands=[...partyBefore,`save ${partyCheckpoint}`,...partyAfter,`save ${partyFinal}`,`load ${partyCheckpoint}`,...partyAfter,`save ${partyResumed}`,'exit',''];
  const partyPlay=spawnSync(process.execPath,[cli,'play','party'],{cwd:temporary,input:partyCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(partyPlay.status,0,partyPlay.stderr||String(partyPlay.error));
  assert.doesNotMatch(partyPlay.stdout,/操作未生效|未完成：/);
  assert.match(partyPlay.stdout,/已恢复：/);
  const midParty=JSON.parse(readFileSync(partyCheckpoint,'utf8'));
  assert.equal(midParty.modules.battles.state.battle.enemies[0].hp,1);
  assert.deepEqual(midParty.modules.battles.state.battle.queue[midParty.modules.battles.state.battle.cursor],{side:'party',id:'mira'});
  assert.equal(midParty.modules.session.state.owner,'battles');
  assert.equal(midParty.modules.effects.state.active.rally.expiresAt,70);
  assert.equal(midParty.modules.skills.state.cooldowns.cleave.readyAt,60);
  const finalParty=JSON.parse(readFileSync(partyFinal,'utf8'));
  assert.equal(finalParty.modules.progression.state.experience,105);
  assert.equal(finalParty.modules.vitals.state.hp,20);
  assert.equal(finalParty.modules.party.state.members.mira.hp,14);
  assert.equal(finalParty.modules.party.state.members.lin.hp,14);
  assert.equal(finalParty.modules.clock.state.elapsedSeconds,90);
  assert.deepEqual(finalParty.modules.battles.state.wins,{wolves:2,raiders:1});
  assert.equal(finalParty.modules.session.state.owner,null);
  assert.deepEqual(JSON.parse(readFileSync(partyResumed,'utf8')),finalParty);
  results.push({world:'interactive-party-active-save-load',actions:originalParty.demo.length+partyAfter.length,revision:finalParty.revision,ok:true});

  const quotedParty=structuredClone(originalParty), quotedPartyFile=join(temporary,'quoted party.json'), quotedPartySave=join(temporary,'quoted party.save.json');
  const partyIds=new Map(quotedParty.world.modules.map(instance=>[instance.id,`队伍 "${instance.id}" 😀`]));
  for(const instance of quotedParty.world.modules){
    instance.id=partyIds.get(instance.id);
    for(const key of Object.keys(instance.bindings??{}))instance.bindings[key]=partyIds.get(instance.bindings[key]);
  }
  quotedParty.world.entryView.instance=partyIds.get(quotedParty.world.entryView.instance);
  for(const command of quotedParty.demo)command.target=partyIds.get(command.target);
  writeFileSync(quotedPartyFile,JSON.stringify(quotedParty));
  const partyQuotedCommands=quotedParty.demo.map(command=>`do ${JSON.stringify(command)}`);
  partyQuotedCommands.push(`save ${quotedPartySave}`,'exit','');
  const partyQuotedPlay=spawnSync(process.execPath,[cli,'play',quotedPartyFile],{cwd:temporary,input:partyQuotedCommands.join('\n'),encoding:'utf8',timeout:20000});
  assert.equal(partyQuotedPlay.status,0,partyQuotedPlay.stderr||String(partyQuotedPlay.error));
  assert.doesNotMatch(partyQuotedPlay.stdout,/操作未生效|未完成：/);
  const partyQuotedSnapshot=JSON.parse(readFileSync(quotedPartySave,'utf8'));
  assert.equal(partyQuotedSnapshot.modules[partyIds.get('progression')].state.experience,105);
  assert.equal(partyQuotedSnapshot.modules[partyIds.get('party')].state.members.mira.hp,14);
  assert.equal(partyQuotedSnapshot.modules[partyIds.get('party')].state.members.lin.hp,14);
  assert.equal(partyQuotedSnapshot.modules[partyIds.get('session')].state.owner,null);
  assert.deepEqual(partyQuotedSnapshot.modules[partyIds.get('battles')].state.wins,{wolves:2,raiders:1});
  results.push({world:'interactive-party-arbitrary-ids',actions:quotedParty.demo.length,revision:partyQuotedSnapshot.revision,ok:true});
  assert.deepEqual(fingerprint('built-smoke'),inputs,'Verification inputs changed during built smoke');
  report('passed',{fingerprint:inputs});
  console.log('构建后的 JS、世界创作、队伍与装备技能联动、活动战斗存档恢复与任意ID验证通过');
} catch(error) {
  report('failed',{error:String(error)});
  throw error;
} finally { if(temporary)rmSync(temporary,{recursive:true,force:true}); }
