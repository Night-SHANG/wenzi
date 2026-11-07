import test from 'node:test';
import assert from 'node:assert/strict';
import type { JsonObject, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { ModuleRegistry, createWorld, restoreWorld, reconfigureWorld } from '../src/engine/index.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { capacityModules } from '../src/modules/capacity.ts';
import { timeModules } from '../src/modules/time.ts';
import { locationModule } from '../src/modules/location.ts';
import { progressionModule } from '../src/modules/progression.ts';
import { progressionRulesModule } from '../src/modules/progression-rules.ts';
import { vitalsModule } from '../src/modules/vitals.ts';
import { encounterRulesModule } from '../src/modules/encounter-rules.ts';
import { combatRulesModule } from '../src/modules/combat-rules.ts';
import { encountersModule } from '../src/modules/encounters.ts';
import { skillRulesModule } from '../src/modules/skill-rules.ts';
import { skillsModule } from '../src/modules/skills.ts';

// Sibling modules are implemented concurrently. Ordinary providers expose their full
// documented results; actual inventory, XP, health, clock and battle remain real.
const equipment:ModuleDefinition={manifest:{id:'fixture.equipment',title:'Equipment',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{equipment:'1.0.0'}},initialState:()=>({tags:['blade']}),queries:{status:{execute:ctx=>Object.hasOwn(ctx.config,'override')?ctx.config.override!:{slots:[{slot:'hand',item:{id:'sword',name:'Sword',slot:'hand',modifiers:{attack:2,defense:1},tags:ctx.state<JsonObject>().tags!}}],modifiers:{attack:2,defense:1},tags:ctx.state<JsonObject>().tags!}}},commands:{set:{execute(ctx,input){ctx.write(input);return null;}}}};
const effectRule:ModuleDefinition={manifest:{id:'fixture.effect-rule',title:'Effect rule',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'effect-rule':'1.0.0'}},initialState:()=>({}),queries:{get:{execute(ctx,input){if(input.effect!=='boost')ctx.fail('UNKNOWN_EFFECT','未知效果');return ctx.config.override??{id:'boost',name:'Boost',durationSeconds:20,modifiers:{attack:2,defense:1}};}},list:{execute:()=>({effects:[{id:'boost',name:'Boost',durationSeconds:20,modifiers:{attack:2,defense:1}}]})}}};
const effects:ModuleDefinition={manifest:{id:'fixture.effects',title:'Effects',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{effects:'1.0.0'},requires:{time:{version:'^1.0.0'}}},initialState:()=>({startedAt:0,expiresAt:0}),queries:{status:{execute(ctx){const now=(ctx.query('time','now') as JsonObject).elapsedSeconds as number,s=ctx.state<{startedAt:number;expiresAt:number}>();return{now,effects:now<s.expiresAt?[{id:'boost',name:'Boost',modifiers:{attack:2,defense:1},startedAt:s.startedAt,expiresAt:s.expiresAt,remainingSeconds:s.expiresAt-now}]:[],modifiers:now<s.expiresAt?{attack:2,defense:1}:{}};}}},commands:{apply:{execute(ctx,input){assert.equal(input.effect,'boost');const now=(ctx.query('time','now') as JsonObject).elapsedSeconds as number;ctx.write({startedAt:now,expiresAt:now+20});if(ctx.config.reject)ctx.fail('EFFECT_REJECTED','效果拒绝');return{now,effects:[{id:'boost',name:'Boost',modifiers:{attack:2,defense:1},startedAt:now,expiresAt:now+20,remainingSeconds:20}],modifiers:{attack:2,defense:1}};}}}};
const attributes:ModuleDefinition={manifest:{id:'fixture.attributes',title:'Attributes',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{attributes:'1.0.0'},requires:{effects:{version:'^1.0.0'}}},initialState:()=>({}),queries:{status:{execute(ctx){const active=((ctx.query('effects','status') as JsonObject).effects as unknown[]).length>0;return{base:{attack:4,defense:1},equipment:{attack:2,defense:1},effects:active?{attack:2,defense:1}:{},values:{attack:active?8:6,defense:active?3:2}};}}}};
const external:ModuleDefinition={manifest:{id:'fixture.external',title:'External',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'skill-rule':'1.0.0',time:'1.0.0',encounters:'1.1.0',inventory:'1.0.0',progression:'1.0.0'}},initialState:()=>({touched:false}),queries:Object.fromEntries(['list','get','now','status','count'].map(action=>[action,{execute:(ctx:any)=>ctx.config[action]}])),commands:{strike:{execute(ctx){ctx.write({touched:true});if(ctx.config.reject)ctx.fail('STRIKE_REJECTED','出招拒绝');return ctx.config.result!;}},remove:{execute(ctx){ctx.write({touched:true});return ctx.config.result!;}}}};
function registry(){return new ModuleRegistry([...capacityModules,...timeModules,inventoryModule,locationModule,progressionModule,progressionRulesModule,vitalsModule,encounterRulesModule,combatRulesModule,encountersModule,skillRulesModule,skillsModule,equipment,effectRule,effects,attributes,external]);}
function definition():WorldDefinition{return{id:'skills-test',title:'Skills',version:'1',modules:[
{id:'capacity',module:'capacity.slots',config:{}},
{id:'inventory',module:'inventory.basic',config:{items:{spark:{name:'Spark',weight:1,volume:1,length:1}},containers:{pack:{limits:{slots:2},items:{spark:3}}}}},
{id:'clock',module:'time.step',config:{secondsPerStep:10}},
{id:'location',module:'location.nodes',config:{start:'forest',nodes:{forest:{name:'Forest',description:'',exits:[]}}}},
{id:'curve',module:'progression.curve',config:{levels:[{experience:0,values:{maxHp:30,attack:4,defense:1}},{experience:10,values:{maxHp:40,attack:6,defense:2}}]}},
{id:'xp',module:'progression.track',config:{initialExperience:0}}, {id:'hp',module:'vitals.pool',config:{initialHp:30}},
{id:'encounter-rule',module:'encounters.catalog',config:{encounters:{wolf:{name:'Wolf',location:'forest',enemy:{maxHp:100,attack:5,defense:0},loot:{},experience:0,cooldownSeconds:0}}}},
{id:'combat',module:'combat.difference',config:{}},{id:'battle',module:'encounters.duel',config:{container:'pack'}},
{id:'equipment',module:'fixture.equipment',config:{}},{id:'effect-rule',module:'fixture.effect-rule',config:{}},{id:'effects',module:'fixture.effects',config:{}},{id:'attributes',module:'fixture.attributes',config:{}},
{id:'skill-rule',module:'skills.catalog',config:{skills:{burst:{name:'Burst',minLevel:1,requiredTags:['blade'],costs:{spark:1},cooldownSeconds:10,attackBonus:3,effect:'boost'},heavy:{name:'Heavy',minLevel:2,requiredTags:[],costs:{},cooldownSeconds:0,attackBonus:2,effect:null}}}},
{id:'skills',module:'skills.combat',config:{container:'pack',known:['burst','heavy']}}
]};}
function instance(d:WorldDefinition,id:string){const x=d.modules.find(x=>x.id===id);assert.ok(x);return x;}
function setup(edit?:(d:WorldDefinition)=>void){const d=definition();edit?.(d);return createWorld(registry(),d);}
type World=ReturnType<typeof setup>;
function ok(w:World,target:string,action:string,input:JsonObject={}){const r=w.dispatch({target,action,input});assert.equal(r.ok,true,JSON.stringify(r));if(!r.ok)throw Error('failed');return r.value as any;}
function fail(w:World,target:string,action:string,input:JsonObject={},code?:string){const before=w.snapshot(),r=w.dispatch({target,action,input});assert.equal(r.ok,false);if(!r.ok&&code)assert.equal(r.error.code,code);assert.deepEqual(w.snapshot(),before);}
function start(w:World){ok(w,'battle','start',{encounter:'wolf'});}
function rows(w:World){return (w.query('skills','list') as any).skills as any[];}
function burst(d:WorldDefinition){return (instance(d,'skill-rule').config.skills as any).burst;}

test('skills use current eligibility and apply effect before real strike, paying once without advancing time',()=>{
 const w=setup();const before=w.snapshot();assert.equal(rows(w)[0].available,false);assert.deepEqual(w.snapshot(),before);start(w);assert.equal(rows(w)[0].available,true);const r=ok(w,'skills','use',{skill:'burst'});assert.equal(r.readyAt,10);assert.equal(r.battle.battle.enemyHp,89);assert.deepEqual(w.query('hp','status'),{hp:28,maxHp:30});assert.deepEqual(w.query('inventory','count',{container:'pack',item:'spark'}),{quantity:2});assert.deepEqual(w.query('clock','now'),{elapsedSeconds:0});assert.equal(rows(w)[0].remainingSeconds,10);assert.equal(rows(w)[0].available,false);fail(w,'skills','use',{skill:'burst'});ok(w,'clock','advance',{steps:1});ok(w,'skills','use',{skill:'burst'});assert.equal((w.query('battle','status') as any).battle.enemyHp,78);
});
test('level, tags, known, inventory and active-battle gates are live',()=>{
 const w=setup();fail(w,'skills','use',{skill:'burst'});start(w);fail(w,'skills','use',{skill:'heavy'});ok(w,'xp','gain',{amount:10});assert.equal(rows(w)[1].available,true);ok(w,'skills','use',{skill:'heavy'});ok(w,'equipment','set',{tags:[]});assert.equal(rows(w)[0].available,false);assert.ok(rows(w)[0].reasons.length);fail(w,'skills','use',{skill:'burst'});ok(w,'equipment','set',{tags:['blade']});ok(w,'inventory','remove',{container:'pack',item:'spark',quantity:3});fail(w,'skills','use',{skill:'burst'});const u=setup(d=>instance(d,'skills').config.known=[]);start(u);assert.equal(rows(u)[0].known,false);fail(u,'skills','use',{skill:'burst'});fail(u,'skills','use',{skill:'missing'});
});
test('effect rejection and strike rejection roll back inventory, effects and partial battle writes',()=>{
 const e=setup(d=>instance(d,'effects').config.reject=true);start(e);fail(e,'skills','use',{skill:'burst'},'EFFECT_REJECTED');
 const d=definition();instance(d,'battle').module='fixture.external';instance(d,'battle').config={status:{phase:'active',battle:{phase:'active',enemyHp:100,enemyMaxHp:100}},reject:true};for(const id of ['skills','hp','attributes','effects']){const x=instance(d,id);x.bindings={...(x.bindings??{}),...(id==='skills'?{inventory:'inventory',progression:'xp',time:'clock','skill-rule':'skill-rule',encounters:'battle'}:id==='hp'?{progression:'xp'}:id==='effects'?{time:'clock'}:{})};}const w=createWorld(registry(),d);fail(w,'skills','use',{skill:'burst'},'STRIKE_REJECTED');
});
test('cooldowns survive catalog edits/deletion and save/clock replacement with exact equality readiness',()=>{
 const w=setup();start(w);ok(w,'skills','use',{skill:'burst'});let d=w.definition;burst(d).cooldownSeconds=100;let x=reconfigureWorld(registry(),w,d);assert.equal(rows(x)[0].remainingSeconds,10);d=x.definition;instance(d,'clock').module='time.continuous';instance(d,'clock').config={};x=reconfigureWorld(registry(),restoreWorld(registry(),x.snapshot()),d);ok(x,'clock','advance',{seconds:9.5});fail(x,'skills','use',{skill:'burst'});ok(x,'clock','advance',{seconds:0.5});assert.equal(rows(x)[0].available,true);d=x.definition;delete(instance(d,'skill-rule').config.skills as any).burst;x=reconfigureWorld(registry(),x,d);fail(x,'skills','use',{skill:'burst'});assert.deepEqual((x.snapshot().modules.skills!.state as any).cooldowns.burst,{startedAt:0,readyAt:10});
});
test('zero cooldown repeats, positive precision/overflow and clock reversal reject atomically',()=>{
 const z=setup(d=>burst(d).cooldownSeconds=0);start(z);ok(z,'skills','use',{skill:'burst'});ok(z,'skills','use',{skill:'burst'});assert.equal(rows(z)[0].remainingSeconds,0);
 for(const [time,duration]of [[Number.MAX_SAFE_INTEGER,10],[2**52,0.1]]){const w=setup(d=>{burst(d).effect=null;burst(d).cooldownSeconds=duration;});start(w);const s=w.snapshot();s.modules.clock!.state={elapsedSeconds:time!};const x=restoreWorld(registry(),s);fail(x,'skills','use',{skill:'burst'});}
 const w=setup();start(w);ok(w,'clock','advance',{steps:1});ok(w,'skills','use',{skill:'burst'});const s=w.snapshot();s.modules.clock!.state={elapsedSeconds:9};assert.throws(()=>restoreWorld(registry(),s));
});
test('current skill references require optional equipment, effects and effect catalog independently',()=>{
 for(const remove of ['equipment','effects','effect-rule']){assert.throws(()=>setup(d=>{d.modules=d.modules.filter(x=>x.id!==remove&&x.id!=='attributes');}));}
 assert.throws(()=>setup(d=>burst(d).costs={unknown:1}));assert.throws(()=>setup(d=>burst(d).effect='missing'));
 const w=setup(d=>{d.modules=d.modules.filter(x=>!['equipment','effects','effect-rule','attributes'].includes(x.id));burst(d).effect=null;burst(d).requiredTags=[];});start(w);ok(w,'skills','use',{skill:'burst'});assert.equal((w.query('battle','status') as any).battle.enemyHp,93);
});
test('Unicode and ordinary own keys remain usable skill identities',()=>{
 for(const id of ['toString','valueOf','😀'.repeat(128)]){const w=setup(d=>{const b=burst(d);instance(d,'skill-rule').config.skills={[id]:b};instance(d,'skills').config.known=[id];});start(w);assert.equal(ok(w,'skills','use',{skill:id}).skill,id);restoreWorld(registry(),w.snapshot());}
});

test('malformed external catalogs and get/list disagreement are rejected independently',()=>{
 const provider:ModuleDefinition={manifest:{id:'fixture.skill',title:'Skills',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'skill-rule':'1.0.0'}},initialState:()=>({}),queries:{list:{execute:ctx=>ctx.config.list!},get:{execute:ctx=>ctx.config.get!}}};
 const entry={id:'burst',name:'Burst',minLevel:1,requiredTags:['blade'],costs:{spark:1},cooldownSeconds:10,attackBonus:3,effect:'boost'};
 for(const bad of [null,[],{}, {...entry,id:'other'},{...entry,minLevel:0},{...entry,requiredTags:['blade','blade']},{...entry,costs:{spark:0}},{...entry,attackBonus:-1},{...entry,effect:4},{...entry,cooldownSeconds:Infinity},{...entry,id:'😀'.repeat(129)}]){const d=definition();instance(d,'skill-rule').module='fixture.skill';instance(d,'skill-rule').config={list:{skills:[entry]},get:bad};const r=registry();r.register(provider);assert.throws(()=>createWorld(r,d));}
 for(const list of [null,[],{}, {skills:[entry,entry]},{skills:[{...entry,name:'Different'}]}]){const d=definition();instance(d,'skill-rule').module='fixture.skill';instance(d,'skill-rule').config={list,get:entry};const r=registry();r.register(provider);assert.throws(()=>createWorld(r,d));}
});
test('invalid tags and effect reference descriptions fail before spending',()=>{
 for(const override of [{tags:['blade','blade']},{tags:[1]},null]){assert.throws(()=>setup(d=>instance(d,'equipment').config.override=override));}
 for(const override of [{id:'other',name:'Boost',durationSeconds:20,modifiers:{attack:2}},{id:'boost',name:'Boost',durationSeconds:0,modifiers:{}},{id:'boost',name:'Boost',durationSeconds:20,modifiers:{attack:0.5}}])assert.throws(()=>setup(d=>instance(d,'effect-rule').config.override=override));
});

test('malformed strike result after real HP and enemy writes rolls back the entire skill',()=>{
 const proxy:ModuleDefinition={manifest:{id:'fixture.strike-proxy',title:'Strike proxy',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{encounters:'1.1.0'},requires:{encounters:{version:'^1.1.0'}}},initialState:()=>({}),queries:{status:{execute:ctx=>ctx.query('encounters','status')}},commands:{strike:{execute(ctx,input){ctx.call('encounters','strike',input);return ctx.config.result!;}}}};
 for(const result of [null,[],{}, {phase:'idle',battle:null},{phase:'victory',battle:{phase:'victory',enemyHp:2,enemyMaxHp:100}}]){const d=definition();d.modules.push({id:'proxy',module:'fixture.strike-proxy',config:{result},bindings:{encounters:'battle'}});instance(d,'skills').bindings={encounters:'proxy'};const r=registry();r.register(proxy);const w=createWorld(r,d);start(w);fail(w,'skills','use',{skill:'burst'},'INVALID_ENCOUNTERS');}
});
test('bad inventory removal response after spending rejects without recording cooldown',()=>{
 const proxy:ModuleDefinition={manifest:{id:'fixture.inventory-proxy',title:'Inventory proxy',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{inventory:'1.0.0'},requires:{inventory:{version:'^1.0.0'}}},initialState:()=>({}),queries:{list:{execute:(ctx,input)=>ctx.query('inventory','list',input)},count:{execute:(ctx,input)=>ctx.query('inventory','count',input)}},commands:{remove:{execute(ctx,input){ctx.call('inventory','remove',input);return ctx.config.result!;}}}};
 for(const result of [{quantity:3},{quantity:-1},null,{}]){const d=definition();d.modules.push({id:'proxy',module:'fixture.inventory-proxy',config:{result},bindings:{inventory:'inventory'}});instance(d,'skills').bindings={inventory:'proxy'};instance(d,'battle').bindings={inventory:'inventory'};const r=registry();r.register(proxy);const w=createWorld(r,d);start(w);fail(w,'skills','use',{skill:'burst'},'INVALID_INVENTORY');}
});
