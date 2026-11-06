import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, restoreWorld, reconfigureWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules, safeCount } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { locationModule } from '../src/modules/location.ts';
import { timeModules } from '../src/modules/time.ts';
import { encounterRulesModule } from '../src/modules/encounter-rules.ts';
import { combatRulesModule } from '../src/modules/combat-rules.ts';
import { encountersModule } from '../src/modules/encounters.ts';

// Ordinary host modules exercise public capabilities while production providers are built separately.
const progression: ModuleDefinition = {
  manifest: { id: 'test.progression', title: 'Progression fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' } },
  initialState: () => ({ experience: 0 }),
  queries: { status: { execute(ctx) { return Object.hasOwn(ctx.config, 'override') ? ctx.config.override! : { ...ctx.state<JsonObject>(), level: 1, floorExperience: 0, nextExperience: null, values: { maxHp: 20, attack: 4, defense: 1 } }; } } },
  commands: { gain: { execute(ctx, input) { const experience = safeCount(ctx, ctx.state<{experience:number}>().experience + (input.amount as number), 'XP'); ctx.write({ experience }); return { experience, level: 1, floorExperience: 0, nextExperience: null, values: { maxHp: 20, attack: 4, defense: 1 } }; } }, set: { execute(ctx, input) { ctx.write(input); return null; } } }
};
const vitals: ModuleDefinition = {
  manifest: { id: 'test.vitals', title: 'Vitals fixture', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { vitals: '1.0.0' } },
  initialState: () => ({ hp: 20, maxHp: 20 }),
  queries: { status: { execute: ctx => Object.hasOwn(ctx.config, 'override') ? ctx.config.override! : ctx.state<JsonObject>() } },
  commands: { damage: { execute(ctx, input) { const s = ctx.state<{hp:number;maxHp:number}>(); s.hp = Math.max(0, s.hp - (input.amount as number)); ctx.write(s); return ctx.config.damageOverride ?? s; } }, heal: { execute(ctx) { const s = { hp: 20, maxHp: 20 }; ctx.write(s); return s; } }, set: { execute(ctx, input) { ctx.write(input); return input; } } }
};
const noise: ModuleDefinition = { manifest: { id:'test.noise',title:'Noise',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{} },initialState:()=>({}),commands:{move:{execute(ctx){ctx.emit('location.moved',{from:'forest',to:'town'});return null;}}} };
const external: ModuleDefinition = { manifest:{id:'test.external',title:'External',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'encounter-rule':'1.0.0','combat-rule':'1.0.0',time:'1.0.0',location:'1.0.0',inventory:'1.0.0'}},initialState:()=>({}),queries:Object.fromEntries(['get','list','damage','now','current','describe','count'].map(action=>[action,{execute:(ctx: any)=>ctx.config[action]}])) };
function registry(extra: ModuleDefinition[] = []) { return new ModuleRegistry([...capacityModules,inventoryModule,locationModule,...timeModules,progression,vitals,noise,external,encounterRulesModule,combatRulesModule,encountersModule,...extra]); }
const wolf = () => ({name:'Wolf',location:'forest',enemy:{maxHp:12,attack:5,defense:0},loot:{pelt:1},experience:10,cooldownSeconds:10});
function definition(): WorldDefinition { return {id:'duels',title:'Duels',version:'1.0.0',modules:[
  {id:'capacity',module:'capacity.slots',config:{}},
  {id:'inventory',module:'inventory.basic',config:{items:{pelt:{name:'Pelt',weight:1,volume:1,length:1},ore:{name:'Ore',weight:1,volume:1,length:1}},containers:{player:{limits:{slots:2},items:{}}}}},
  {id:'location',module:'location.nodes',config:{start:'forest',nodes:{forest:{name:'Forest',description:'',exits:['town']},town:{name:'Town',description:'',exits:['forest']}}}},
  {id:'clock',module:'time.step',config:{secondsPerStep:10}},
  {id:'progression',module:'test.progression',config:{}},{id:'vitals',module:'test.vitals',config:{}},
  {id:'rules',module:'encounters.catalog',config:{encounters:{wolf:wolf()}}},{id:'combat',module:'combat.difference',config:{}},
  {id:'encounters',module:'encounters.duel',config:{container:'player'},bindings:{'encounter-rule':'rules','combat-rule':'combat',inventory:'inventory',location:'location',time:'clock',progression:'progression',vitals:'vitals'}},{id:'noise',module:'test.noise',config:{}}
]}; }
function instance(d:WorldDefinition,id:string){const m=d.modules.find(m=>m.id===id);assert.ok(m);return m;}
function setup(edit?:(d:WorldDefinition)=>void){const d=definition();edit?.(d);return createWorld(registry(),d);}
type World=ReturnType<typeof setup>;
function ok(w:World,target:string,action:string,input:JsonObject={}){const r=w.dispatch({target,action,input});assert.equal(r.ok,true,JSON.stringify(r));if(!r.ok)throw Error('Failed');return r.value;}
function fail(w:World,target:string,action:string,input:JsonObject={}){const before=w.snapshot();const r=w.dispatch({target,action,input});assert.equal(r.ok,false,JSON.stringify(r));assert.deepEqual(w.snapshot(),before);}
const status=(w:World)=>w.query('encounters','status') as any;
function victory(w:World,id='wolf'){ok(w,'encounters','start',{encounter:id});for(let i=0;i<3;i++)ok(w,'encounters','attack');}
const count=(w:World,item='pelt')=>w.query('inventory','count',{container:'player',item});

test('exact public queries are pure and duel grants rewards only at claim',()=>{
 const w=setup(),before=w.snapshot();assert.deepEqual(w.query('rules','get',{encounter:'wolf'}),{id:'wolf',...wolf()});assert.deepEqual(w.query('rules','list'),{encounters:[{id:'wolf',...wolf()}]});assert.deepEqual(w.query('encounters','describe',{encounter:'wolf'}),{id:'wolf',...wolf()});assert.deepEqual(w.query('encounters','list'),{encounters:[{id:'wolf',...wolf(),available:true,remainingSeconds:0}]});assert.deepEqual(status(w),{battle:null,phase:'idle'});assert.deepEqual(w.snapshot(),before);
 ok(w,'encounters','start',{encounter:'wolf'});ok(w,'encounters','attack');assert.equal(status(w).battle.enemyHp,8);assert.deepEqual(w.query('vitals','status'),{hp:16,maxHp:20});ok(w,'encounters','attack');assert.equal(status(w).battle.enemyHp,4);assert.deepEqual(w.query('vitals','status'),{hp:12,maxHp:20});ok(w,'encounters','attack');assert.equal(status(w).phase,'victory');assert.equal(status(w).battle.enemyHp,0);assert.deepEqual(w.query('vitals','status'),{hp:12,maxHp:20});assert.deepEqual(count(w),{quantity:0});assert.deepEqual(w.query('encounters','records'),{wins:{}});fail(w,'encounters','attack');ok(w,'encounters','claim');assert.deepEqual(count(w),{quantity:1});assert.equal((w.query('progression','status') as any).experience,10);assert.deepEqual(w.query('encounters','records'),{wins:{wolf:1}});assert.deepEqual(status(w),{battle:null,phase:'idle'});assert.deepEqual((w.snapshot().modules.encounters!.state as any).cooldowns,{wolf:{startedAt:0,readyAt:10}});fail(w,'encounters','attack');fail(w,'encounters','claim');fail(w,'encounters','start',{encounter:'wolf'});ok(w,'clock','advance',{steps:1});ok(w,'encounters','start',{encounter:'wolf'});
});
test('start gates and bound movement veto roll back complete transactions',()=>{const w=setup();ok(w,'location','move',{to:'town'});fail(w,'encounters','start',{encounter:'wolf'});ok(w,'location','move',{to:'forest'});ok(w,'vitals','set',{hp:0,maxHp:20});fail(w,'encounters','start',{encounter:'wolf'});ok(w,'vitals','heal');ok(w,'encounters','start',{encounter:'wolf'});fail(w,'encounters','start',{encounter:'wolf'});fail(w,'location','move',{to:'town'});ok(w,'noise','move');assert.equal((w.query('location','current') as any).id,'forest');});
test('defeat remains terminal after healing and any phase can retreat without prizes',()=>{const w=setup();ok(w,'vitals','set',{hp:1,maxHp:20});ok(w,'encounters','start',{encounter:'wolf'});ok(w,'encounters','attack');assert.equal(status(w).phase,'defeat');ok(w,'vitals','heal');assert.equal(status(w).phase,'defeat');fail(w,'encounters','attack');ok(w,'location','move',{to:'town'});ok(w,'encounters','retreat');assert.deepEqual(w.query('encounters','records'),{wins:{}});assert.deepEqual(count(w),{quantity:0});fail(w,'encounters','retreat');for(const terminal of [false,true]){const x=setup();if(terminal)victory(x);else ok(x,'encounters','start',{encounter:'wolf'});ok(x,'encounters','retreat');assert.deepEqual(count(x),{quantity:0});assert.deepEqual(x.query('encounters','records'),{wins:{}});}});

test('later loot capacity failure and XP overflow roll back earlier inserts, then claim once',()=>{
 const w=setup(d=>{(instance(d,'inventory').config.containers as any).player.limits.slots=1;(instance(d,'rules').config.encounters as any).wolf.loot={pelt:1,ore:1};});victory(w);fail(w,'encounters','claim');assert.deepEqual(count(w),{quantity:0});assert.equal(status(w).phase,'victory');const d=w.definition;(instance(d,'inventory').config.containers as any).player.limits.slots=2;const retry=reconfigureWorld(registry(),w,d);ok(retry,'encounters','claim');assert.deepEqual(count(retry),{quantity:1});assert.deepEqual(count(retry,'ore'),{quantity:1});fail(retry,'encounters','claim');
 const x=setup();victory(x);ok(x,'progression','set',{experience:Number.MAX_SAFE_INTEGER});fail(x,'encounters','claim');assert.deepEqual(count(x),{quantity:0});assert.equal(status(x).phase,'victory');ok(x,'progression','set',{experience:0});ok(x,'encounters','claim');assert.deepEqual(count(x),{quantity:1});assert.deepEqual(x.query('encounters','records'),{wins:{wolf:1}});
});
test('active and pending victory restore and cooldown survives replacing step with continuous time',()=>{
 const w=setup();ok(w,'encounters','start',{encounter:'wolf'});ok(w,'encounters','attack');const active=restoreWorld(registry(),w.snapshot());assert.equal(status(active).battle.enemyHp,8);ok(active,'encounters','attack');ok(active,'encounters','attack');const win=restoreWorld(registry(),active.snapshot());ok(win,'clock','advance',{steps:1});ok(win,'encounters','claim');const d=win.definition;instance(d,'clock').module='time.continuous';instance(d,'clock').config={};const continuous=reconfigureWorld(registry(),win,d);assert.equal((continuous.query('encounters','list') as any).encounters[0].remainingSeconds,10);ok(continuous,'clock','advance',{seconds:9});fail(continuous,'encounters','start',{encounter:'wolf'});ok(continuous,'clock','advance',{seconds:1});ok(continuous,'encounters','start',{encounter:'wolf'});
});
test('current catalog changes never rewrite frozen battles; deletion still permits claim',()=>{
 const w=setup();ok(w,'encounters','start',{encounter:'wolf'});const frozen=status(w).battle;const d=w.definition;(instance(d,'rules').config.encounters as any).wolf={...wolf(),name:'Changed',enemy:{maxHp:50,attack:50,defense:50},loot:{ore:2},experience:99,cooldownSeconds:500};const changed=reconfigureWorld(registry(),w,d);assert.deepEqual(status(changed).battle,frozen);for(let i=0;i<3;i++)ok(changed,'encounters','attack');const deleted=changed.definition;instance(deleted,'rules').config.encounters={};const empty=reconfigureWorld(registry(),changed,deleted);assert.deepEqual(empty.query('encounters','list'),{encounters:[]});ok(empty,'encounters','claim');assert.deepEqual(count(empty),{quantity:1});assert.deepEqual(count(empty,'ore'),{quantity:0});assert.equal((empty.query('progression','status') as any).experience,10);assert.deepEqual(empty.query('encounters','records'),{wins:{wolf:1}});restoreWorld(registry(),empty.snapshot());
});
test('invalid current catalogs and deleted frozen references reject without modifying original',()=>{
 const w=setup();victory(w);for(const edit of [(d:WorldDefinition)=>{(instance(d,'rules').config.encounters as any).wolf.enemy.attack=0;},(d:WorldDefinition)=>{instance(d,'rules').config.encounters={};delete (instance(d,'inventory').config.items as any).pelt;},(d:WorldDefinition)=>{instance(d,'rules').config.encounters={};const l=instance(d,'location').config as any;l.start='town';delete l.nodes.forest;l.nodes.town.exits=[];}]){const before=w.snapshot(),d=w.definition;edit(d);assert.throws(()=>reconfigureWorld(registry(),w,d));assert.deepEqual(w.snapshot(),before);}
 const active=setup();ok(active,'encounters','start',{encounter:'wolf'});const d=active.definition;instance(d,'rules').config.encounters={};const removed=reconfigureWorld(registry(),active,d);for(let i=0;i<3;i++)ok(removed,'encounters','attack');ok(removed,'encounters','claim');
});
test('victory may travel but claim requires frozen location',()=>{const w=setup();victory(w);ok(w,'location','move',{to:'town'});fail(w,'encounters','claim');ok(w,'location','move',{to:'forest'});ok(w,'encounters','claim');});
test('clock reversal overflow precision loss and zero cooldown are checked',()=>{
 for(const [time,duration] of [[Number.MAX_SAFE_INTEGER,10],[2**52,0.1]]){const w=setup(d=>{instance(d,'clock').module='test.external';instance(d,'clock').config={now:{elapsedSeconds:time!}};(instance(d,'rules').config.encounters as any).wolf.cooldownSeconds=duration;});victory(w);fail(w,'encounters','claim');fail(w,'encounters','retreat');}
 const w=setup();ok(w,'clock','advance',{steps:1});ok(w,'encounters','start',{encounter:'wolf'});const s=w.snapshot();(s.modules.clock!.state as any).elapsedSeconds=9;assert.throws(()=>restoreWorld(registry(),s));ok(w,'encounters','retreat');const c=w.snapshot();(c.modules.clock!.state as any).elapsedSeconds=9;assert.throws(()=>restoreWorld(registry(),c));
 const zero=setup(d=>{(instance(d,'rules').config.encounters as any).wolf.cooldownSeconds=0;(instance(d,'rules').config.encounters as any).wolf.experience=0;});victory(zero);ok(zero,'encounters','claim');assert.equal((zero.query('progression','status') as any).experience,0);assert.deepEqual((zero.snapshot().modules.encounters!.state as any).cooldowns.wolf,{startedAt:0,readyAt:0});ok(zero,'encounters','start',{encounter:'wolf'});
});
test('independent combat provider changes damage and invalid replacement returns fail assembly',()=>{
 const w=setup(d=>{instance(d,'combat').module='test.external';instance(d,'combat').config={damage:{damage:6}};});ok(w,'encounters','start',{encounter:'wolf'});ok(w,'encounters','attack');assert.equal(status(w).battle.enemyHp,6);assert.deepEqual(w.query('vitals','status'),{hp:14,maxHp:20});ok(w,'encounters','attack');assert.equal(status(w).phase,'victory');assert.deepEqual(w.query('vitals','status'),{hp:14,maxHp:20});
 for(const result of [null,[],{}, {damage:0},{damage:-1},{damage:0.5},{damage:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>setup(d=>{instance(d,'combat').module='test.external';instance(d,'combat').config={damage:result};}));
 const one=setup();assert.deepEqual(one.query('combat','damage',{attack:0,defense:Number.MAX_SAFE_INTEGER}),{damage:1});assert.throws(()=>one.query('combat','damage',{attack:-1,defense:0}));
});
test('external get/list identities full definitions duplicate IDs and malformed envelopes reject',()=>{
 const entry={id:'wolf',...wolf()};for(const value of [null,[],{}, {...entry,id:'wrong'},{...entry,enemy:{maxHp:12,attack:0,defense:0}},{...entry,loot:{pelt:0}},{...entry,experience:0.5},{...entry,cooldownSeconds:-1}])assert.throws(()=>setup(d=>{instance(d,'rules').module='test.external';instance(d,'rules').config={list:{encounters:[entry]},get:value};}));
 for(const list of [null,[],{}, {encounters:[null]}, {encounters:[entry,entry]}, {encounters:[{...entry,id:'other'}]}, {encounters:[{...entry,name:'Different'}]}])assert.throws(()=>setup(d=>{instance(d,'rules').module='test.external';instance(d,'rules').config={list,get:entry};}));
});
test('malformed progression and vitals are rejected; damage return failure rolls back enemy and player',()=>{
 const base={experience:0,level:1,floorExperience:0,nextExperience:null,values:{maxHp:20,attack:4,defense:1}};
 for(const override of [null,[],{}, {...base,values:{attack:0,defense:1}},{...base,values:{attack:4,defense:-1}},{...base,experience:0.5},{...base,level:0},{...base,nextExperience:0}])assert.throws(()=>setup(d=>{instance(d,'progression').config.override=override;}));
 for(const override of [[],{}, {hp:-1,maxHp:20},{hp:21,maxHp:20},{hp:0,maxHp:0},{hp:0.5,maxHp:20}])assert.throws(()=>setup(d=>{instance(d,'vitals').config.override=override;}));
 for(const damageOverride of [[],{}, {hp:17,maxHp:20},{hp:16,maxHp:21}]){const w=setup(d=>{instance(d,'vitals').config.damageOverride=damageOverride;});ok(w,'encounters','start',{encounter:'wolf'});fail(w,'encounters','attack');}
});
test('malformed inventory location and clock responses are rejected',()=>{
 for(const now of [null,[],{}, {elapsedSeconds:-1},{elapsedSeconds:'0'},{elapsedSeconds:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>setup(d=>{instance(d,'clock').module='test.external';instance(d,'clock').config={now};}));
 for(const count of [null,[],{}, {quantity:-1},{quantity:0.5},{quantity:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>setup(d=>{instance(d,'inventory').module='test.external';instance(d,'inventory').config={list:{items:[],limits:{}},count};}));
 for(const current of [null,[],{}, {id:''},{id:'x'.repeat(129)}])assert.throws(()=>setup(d=>{instance(d,'location').module='test.external';instance(d,'location').config={current,describe:{id:'forest',name:'Forest',description:'',exits:[]}};}));
 for(const describe of [null,[],{}, {id:'wrong',name:'Forest',description:'',exits:[]},{id:'forest',name:'Forest',description:'',exits:[null]}])assert.throws(()=>setup(d=>{instance(d,'location').module='test.external';instance(d,'location').config={current:{id:'forest'},describe};}));
});
test('safe own-key and whitespace IDs win repeatedly; wins overflow rolls back pending rewards',()=>{
 for(const id of ['toString','valueOf','狼 " 林']){const w=setup(d=>{instance(d,'rules').config.encounters=Object.fromEntries([[id,wolf()]]);});victory(w,id);ok(w,'encounters','claim');assert.deepEqual(w.query('encounters','records'),{wins:{[id]:1}});assert.throws(()=>w.query('rules','get',{encounter:'hasOwnProperty'}));ok(w,'clock','advance',{steps:1});ok(w,'vitals','heal');victory(w,id);ok(w,'encounters','claim');assert.deepEqual(w.query('encounters','records'),{wins:{[id]:2}});}
 const w=setup();victory(w);const save=w.snapshot();(save.modules.encounters!.state as any).wins.wolf=Number.MAX_SAFE_INTEGER;const overflow=restoreWorld(registry(),save);fail(overflow,'encounters','claim');assert.equal(status(overflow).phase,'victory');assert.deepEqual(count(overflow),{quantity:0});
});
test('restored inconsistent battle states and cooldown ordering are invalid',()=>{
 const w=setup();ok(w,'encounters','start',{encounter:'wolf'});for(const patch of [{enemyHp:13},{enemyHp:0},{phase:'victory'},{phase:'defeat',enemyHp:0},{startedAt:1}]){const save=w.snapshot();Object.assign((save.modules.encounters!.state as any).battle,patch);assert.throws(()=>restoreWorld(registry(),save));}const s=w.snapshot();(s.modules.encounters!.state as any).cooldowns.wolf={startedAt:10,readyAt:9};assert.throws(()=>restoreWorld(registry(),s));
});
