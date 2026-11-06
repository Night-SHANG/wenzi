import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, reconfigureWorld, restoreWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules, safeCount } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { locationModule } from '../src/modules/location.ts';
import { questRulesModule } from '../src/modules/quest-rules.ts';
import { questsModule } from '../src/modules/quests.ts';
const quest = (edit: JsonObject = {}): JsonObject => ({ name: '补给', description: '交付工具', prerequisites: [], delivery: { tool: 1 }, victories: {}, rewards: { tonic: 2 }, experience: 10, locations: [], repeatable: true, ...edit });
const progression: ModuleDefinition = {
  manifest: { id: 'test.progression', title: '契约成长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { progression: '1.0.0' } },
  initialState: cfg => ({ experience: cfg.initialExperience ?? 0 }),
  commands: { gain: { execute(ctx, input) { const experience = safeCount(ctx, ctx.state<{experience:number}>().experience + (input.amount as number), '经验'); ctx.write({ experience }); return { experience, level: 1, floorExperience: 0, nextExperience: null, values: {} }; } } },
  queries: { status: { execute(ctx) { return { experience: ctx.state<{experience:number}>().experience, level: 1, floorExperience: 0, nextExperience: null, values: {} }; } } }
};
const encounters: ModuleDefinition = {
  manifest: { id: 'test.encounters', title: '契约遭遇', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { encounters: '1.0.0' } },
  initialState: cfg => ({ wins: cfg.wins ?? {} }),
  commands: { set: { execute(ctx, input) { ctx.write({ wins: input.wins! }); return null; } } },
  queries: { records: { execute: ctx => ctx.state<JsonObject>() }, describe: { execute(ctx, input) { if (!(ctx.config.ids as string[]).includes(input.encounter as string)) ctx.fail('UNKNOWN_ENCOUNTER', '未知遭遇'); return { id: input.encounter!, name: '遭遇', location: 'woods', enemy: { maxHp: 1, attack: 1, defense: 0 }, loot: {}, experience: 0, cooldownSeconds: 0 }; } } }
};
const foreignRules: ModuleDefinition = {
  manifest: { id: 'test.quest-rule', title: '契约目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'quest-rule': '1.0.0' } }, initialState: () => ({}),
  queries: { list: { execute: ctx => ctx.config.list! }, get: { execute: ctx => ctx.config.get! } }
};
function registry(extra: ModuleDefinition[] = []) { return new ModuleRegistry([...capacityModules, inventoryModule, locationModule, progression, encounters, foreignRules, questRulesModule, questsModule, ...extra]); }
function definition(): WorldDefinition { return { id: 'quest-test', title: '任务测试', version: '1', modules: [
  { id: 'capacity', module: 'capacity.slots', config: {} },
  { id: 'inventory', module: 'inventory.basic', config: { items: Object.fromEntries(['tool','tonic','badge','medal','stone','toString','valueOf','hasOwnProperty'].map(id => [id, {name:id,weight:1,volume:1,length:1}])), containers: {bag:{limits:{slots:8},items:{tool:3}}} } },
  { id: 'progression', module: 'test.progression', config: {} },
  { id: 'rules', module: 'quests.catalog', config: { quests: { supply: quest() } } },
  { id: 'quests', module: 'quests.journal', config: {container:'bag'} }
] }; }
function instance(d: WorldDefinition, id: string) { const value=d.modules.find(m=>m.id===id); assert.ok(value); return value; }
function catalog(d: WorldDefinition) { return instance(d,'rules').config.quests as Record<string,JsonObject>; }
function bag(d: WorldDefinition) { return (instance(d,'inventory').config.containers as any).bag; }
function setup(edit?: (d:WorldDefinition)=>void, extra:ModuleDefinition[] = []) { const d=definition(); edit?.(d); return createWorld(registry(extra),d); }
type World = ReturnType<typeof setup>;
function ok(w:World,target:string,action:string,input:JsonObject={}) { const r=w.dispatch({target,action,input}); assert.equal(r.ok,true,JSON.stringify(r)); if(!r.ok)throw Error('动作失败'); return r; }
function fails(w:World,target:string,action:string,input:JsonObject={},code?:string) { const before=w.snapshot();const r=w.dispatch({target,action,input});assert.equal(r.ok,false,JSON.stringify(r)); if(!r.ok&&code)assert.equal(r.error.code,code);assert.deepEqual(w.snapshot(),before); }
function rows(w:World) { return (w.query('quests','list') as {quests:JsonObject[]}).quests; }
function row(w:World,id='supply') { const r=rows(w).find(q=>q.id===id);assert.ok(r);return r; }
function count(w:World,item:string) { return (w.query('inventory','count',{container:'bag',item}) as JsonObject).quantity; }
function atTown(d:WorldDefinition) { d.modules.push({id:'location',module:'location.nodes',config:{start:'town',nodes:{town:{name:'镇',description:'',exits:['woods']},woods:{name:'林',description:'',exits:['town']}}}}); }
function withEncounters(d:WorldDefinition,wins:JsonObject={}) { d.modules.push({id:'encounters',module:'test.encounters',config:{ids:['wolf','raider'],wins}}); }
function win(w:World,wolf:number,raider=0) { ok(w,'encounters','set',{wins:{wolf,raider}}); }

test('delivery uses present inventory, queries are pure and turn-in grants exactly once',()=>{
 const w=setup();assert.equal(row(w).status,'available');ok(w,'quests','accept',{quest:'supply'});fails(w,'quests','accept',{quest:'supply'});assert.equal(row(w).status,'ready');
 ok(w,'inventory','remove',{container:'bag',item:'tool',quantity:3});assert.equal(row(w).ready,false);assert.deepEqual(row(w).remainingDelivery,{tool:1});fails(w,'quests','turnIn',{quest:'supply'});
 ok(w,'inventory','add',{container:'bag',item:'tool',quantity:1});const before=w.snapshot();rows(w);rows(w);assert.deepEqual(w.snapshot(),before);assert.equal(count(w,'tonic'),0);ok(w,'quests','turnIn',{quest:'supply'});assert.equal(count(w,'tonic'),2);assert.equal(row(w).completed,1);assert.equal((w.query('progression','status')as JsonObject).experience,10);fails(w,'quests','turnIn',{quest:'supply'});
});
test('supply patrol guard unlock sequentially and repeatable victories use fresh acceptance baselines',()=>{
 const w=setup(d=>{withEncounters(d,{wolf:5});catalog(d).patrol=quest({name:'巡林',prerequisites:['supply'],delivery:{},victories:{wolf:2},rewards:{badge:1}});catalog(d).guard=quest({prerequisites:['patrol'],delivery:{},victories:{raider:1},rewards:{medal:1},repeatable:false});});
 assert.equal(row(w,'patrol').status,'locked');fails(w,'quests','accept',{quest:'patrol'});ok(w,'quests','accept',{quest:'supply'});ok(w,'quests','turnIn',{quest:'supply'});ok(w,'quests','accept',{quest:'patrol'});assert.deepEqual(row(w,'patrol').remainingVictories,{wolf:2});win(w,6);assert.deepEqual(row(w,'patrol').remainingVictories,{wolf:1});
 const restored=restoreWorld(registry(),w.snapshot());assert.deepEqual(row(restored,'patrol').remainingVictories,{wolf:1});win(restored,7);ok(restored,'quests','turnIn',{quest:'patrol'});ok(restored,'quests','accept',{quest:'patrol'});assert.deepEqual(row(restored,'patrol').remainingVictories,{wolf:2});ok(restored,'quests','accept',{quest:'guard'});win(restored,7,1);ok(restored,'quests','turnIn',{quest:'guard'});assert.equal(row(restored,'guard').status,'completed');fails(restored,'quests','accept',{quest:'guard'});
});
test('location constrains accept and turn-in while abandonment is allowed elsewhere',()=>{
 const w=setup(d=>{atTown(d);catalog(d).supply!.locations=['town'];});ok(w,'location','move',{to:'woods'});fails(w,'quests','accept',{quest:'supply'});ok(w,'location','move',{to:'town'});ok(w,'quests','accept',{quest:'supply'});ok(w,'location','move',{to:'woods'});fails(w,'quests','turnIn',{quest:'supply'});ok(w,'quests','abandon',{quest:'supply'});fails(w,'quests','abandon',{quest:'supply'});assert.equal(count(w,'tonic'),0);
});
test('later reward capacity failure rolls back delivery all rewards completion and XP; retry grants once',()=>{
 const w=setup(d=>{bag(d).limits.slots=2;bag(d).items={tool:1,stone:1};catalog(d).supply!.rewards={tonic:1,badge:1};});ok(w,'quests','accept',{quest:'supply'});fails(w,'quests','turnIn',{quest:'supply'},'CAPACITY_EXCEEDED');assert.equal(count(w,'tool'),1);assert.equal(count(w,'tonic'),0);ok(w,'inventory','remove',{container:'bag',item:'stone',quantity:1});ok(w,'quests','turnIn',{quest:'supply'});assert.equal(count(w,'tonic'),1);assert.equal(count(w,'badge'),1);fails(w,'quests','turnIn',{quest:'supply'});
});
test('XP overflow after inventory changes and completed counter overflow are atomic',()=>{
 const w=setup(d=>{instance(d,'progression').config.initialExperience=Number.MAX_SAFE_INTEGER;});ok(w,'quests','accept',{quest:'supply'});fails(w,'quests','turnIn',{quest:'supply'});assert.equal(count(w,'tool'),3);assert.equal(count(w,'tonic'),0);
 const normal=setup();ok(normal,'quests','accept',{quest:'supply'});const s=normal.snapshot();(s.modules.quests!.state as any).completed.supply=Number.MAX_SAFE_INTEGER;const overflow=restoreWorld(registry(),s);fails(overflow,'quests','turnIn',{quest:'supply'});
});
test('accepted full definition remains frozen through catalog replacement deletion and restore',()=>{
 const w=setup();ok(w,'quests','accept',{quest:'supply'});const original=row(w);const d=w.definition;catalog(d).supply=quest({name:'新版',delivery:{stone:3},rewards:{medal:4},experience:99});const changed=reconfigureWorld(registry(),w,d);assert.deepEqual(row(changed),original);const deleted=changed.definition;instance(deleted,'rules').config.quests={};const restored=restoreWorld(registry(),reconfigureWorld(registry(),changed,deleted).snapshot());assert.deepEqual(row(restored),original);ok(restored,'quests','turnIn',{quest:'supply'});assert.equal(count(restored,'tonic'),2);assert.equal(count(restored,'medal'),0);assert.deepEqual(row(restored),{id:'supply',name:'supply',description:'',status:'completed',ready:false,completed:1,remainingDelivery:{},remainingVictories:{},rewards:{},experience:0,locations:[]});
});
test('active quests do not mask invalid current catalogs or dangling current references',()=>{
 const w=setup(d=>{withEncounters(d);atTown(d);});ok(w,'quests','accept',{quest:'supply'});
 for(const edit of [{delivery:{missing:1}},{rewards:{missing:1}},{victories:{missing:1}},{locations:['missing']},{prerequisites:['missing']},{delivery:{},victories:{}}]){const d=w.definition;catalog(d).bad=quest(edit);assert.throws(()=>reconfigureWorld(registry(),w,d));}
});
test('deleted encounter targets remain readable from counters and abandonable; counters cannot rewind',()=>{
 const w=setup(d=>{withEncounters(d,{wolf:5});catalog(d).supply=quest({delivery:{},victories:{wolf:2}});});ok(w,'quests','accept',{quest:'supply'});const d=w.definition;instance(d,'rules').config.quests={};instance(d,'encounters').config.ids=[];const changed=reconfigureWorld(registry(),w,d);assert.deepEqual(row(changed).remainingVictories,{wolf:2});fails(changed,'encounters','set',{wins:{wolf:4}});ok(changed,'quests','abandon',{quest:'supply'});
 const complete=reconfigureWorld(registry(),w,d);win(complete,7);ok(complete,'quests','turnIn',{quest:'supply'});assert.equal(row(complete).completed,1);
});
test('current frozen item and location references remain mandatory',()=>{
 const w=setup(d=>{atTown(d);catalog(d).supply!.locations=['town'];});ok(w,'quests','accept',{quest:'supply'});
 for(const item of ['tool','tonic']){const d=w.definition;instance(d,'rules').config.quests={};delete(instance(d,'inventory').config.items as any)[item];assert.throws(()=>reconfigureWorld(registry(),w,d));}
 const snapshot=w.snapshot();instance(snapshot.definition,'rules').config.quests={};instance(snapshot.definition,'location').config={start:'woods',nodes:{woods:{name:'林',description:'',exits:[]}}};snapshot.modules.location!.state={current:'woods',visited:['woods']};assert.throws(()=>restoreWorld(registry(),snapshot),(error:any)=>error.code==='UNKNOWN_LOCATION');
});
test('catalog validates missing prerequisites cycles empty objectives counts and optional providers',()=>{
 for(const edit of [{prerequisites:['missing']},{prerequisites:['supply']},{delivery:{},victories:{}},{delivery:{tool:0}},{rewards:{tonic:0}},{victories:{wolf:0.5}},{experience:Number.MAX_SAFE_INTEGER+1},{locations:['town','town']},{locations:['town']},{victories:{wolf:1}}])assert.throws(()=>setup(d=>{Object.assign(catalog(d).supply!,edit);}));
 assert.throws(()=>setup(d=>{catalog(d).supply!.prerequisites=['second'];catalog(d).second=quest({prerequisites:['supply']});}));
 const w=setup();ok(w,'quests','accept',{quest:'supply'});ok(w,'quests','abandon',{quest:'supply'});
});
test('prototype-like IDs survive own-key lookup acceptance completion and repeat baselines',()=>{
 for(const id of ['toString','valueOf','hasOwnProperty',' 空 白 ']){const w=setup(d=>{catalog(d).supply=quest({rewards:{}});instance(d,'rules').config.quests=Object.fromEntries([[id,quest({delivery:Object.fromEntries([['toString',1]]),rewards:{}})]]);bag(d).items=Object.fromEntries([['toString',2]]);});assert.equal(row(w,id).id,id);ok(w,'quests','accept',{quest:id});ok(w,'quests','turnIn',{quest:id});assert.equal(row(w,id).completed,1);ok(w,'quests','accept',{quest:id});ok(w,'quests','turnIn',{quest:id});assert.equal(row(w,id).completed,2);}
 const w=setup();fails(w,'quests','accept',{quest:'toString'});assert.throws(()=>w.query('rules','get',{quest:'toString'}));
});
function external(edit?:(d:WorldDefinition)=>void){return setup(d=>{instance(d,'rules').module='test.quest-rule';instance(d,'rules').config={list:{quests:[{id:'supply',...quest()}]},get:{id:'supply',...quest()}};edit?.(d);});}
test('foreign catalogs reject malformed values duplicate IDs dangling prerequisites and mismatched get identity',()=>{
 for(const list of [null,{}, {quests:{}},{quests:[null]}, {quests:[{id:'supply',...quest()},{id:'supply',...quest()}]}, {quests:[{id:'supply',...quest({prerequisites:['missing']})}]}, {quests:[{id:'supply',...quest({delivery:[]})}]}, {quests:[{id:'supply',...quest({repeatable:'yes'})}]}])assert.throws(()=>external(d=>{instance(d,'rules').config.list=list;}));
 for(const get of [null,{}, {id:'other',...quest()}, {id:'supply',...quest({delivery:{tool:'1'}})}, {id:'supply',...quest({prerequisites:['missing']})}, {id:'supply',...quest({locations:['missing']})}, {id:'supply',...quest({rewards:{missing:1}})}]){const w=external(d=>{instance(d,'rules').config.get=get;});fails(w,'quests','accept',{quest:'supply'});}
 const w=external();ok(w,'quests','accept',{quest:'supply'});ok(w,'quests','turnIn',{quest:'supply'});
});
test('malformed inventory list count and mutation results cannot pass through journal',()=>{
 for(const [action,response]of [['list',null],['list',{items:{}}],['list',{items:[{}]}],['list',{items:[{id:'tool',quantity:-1}]}],['list',{items:[{id:'tool',quantity:2},{id:'tool',quantity:2}]}],['count',{}],['count',{quantity:'3'}],['count',{quantity:-1}],['count',{quantity:Number.MAX_SAFE_INTEGER+1}]]as[string,JsonValue][]){const bad={...inventoryModule,manifest:{...inventoryModule.manifest,id:'test.bad-inventory'},queries:{...inventoryModule.queries,[action]:{execute:()=>response}}};assert.throws(()=>setup(d=>{instance(d,'inventory').module=bad.manifest.id;},[bad]));}
 for(const action of ['add','remove']){const bad={...inventoryModule,manifest:{...inventoryModule.manifest,id:'test.bad-inventory'},commands:{...inventoryModule.commands,[action]:{execute:()=>({quantity:'bad'})}}};const w=setup(d=>{instance(d,'inventory').module=bad.manifest.id;},[bad]);ok(w,'quests','accept',{quest:'supply'});fails(w,'quests','turnIn',{quest:'supply'});}
});
test('malformed encounter records and mismatched descriptions reject assembly',()=>{
 for(const [action,response]of [['records',null],['records',{}],['records',{wins:[]}],['records',{wins:{wolf:-1}}],['records',{wins:{wolf:0.5}}],['records',{wins:{wolf:Number.MAX_SAFE_INTEGER+1}}],['describe',{id:'other'}]]as[string,JsonValue][]){const bad={...encounters,manifest:{...encounters.manifest,id:'test.bad-encounters'},queries:{...encounters.queries,[action]:{execute:()=>response}}};assert.throws(()=>setup(d=>{withEncounters(d);instance(d,'encounters').module=bad.manifest.id;catalog(d).supply=quest({delivery:{},victories:{wolf:2}});},[bad]));}
});
test('malformed location identities cannot bypass restrictions',()=>{
 for(const action of ['describe','current'])for(const response of [null,{}, {id:7},{id:''},{id:'missing'}]){const bad={...locationModule,manifest:{...locationModule.manifest,id:'test.bad-location'},queries:{...locationModule.queries,[action]:{execute:()=>response}}};if(action==='describe')assert.throws(()=>setup(d=>{atTown(d);instance(d,'location').module=bad.manifest.id;catalog(d).supply!.locations=['town'];},[bad]));else{const w=setup(d=>{atTown(d);instance(d,'location').module=bad.manifest.id;catalog(d).supply!.locations=['town'];},[bad]);fails(w,'quests','accept',{quest:'supply'});}}
});

test('foreign get cannot silently change valid terms published under the same catalog ID',()=>{
 const w=external(d=>{instance(d,'rules').config.get={id:'supply',...quest({experience:99,rewards:{medal:1}})};});
 fails(w,'quests','accept',{quest:'supply'},'INVALID_QUEST');assert.equal(count(w,'tool'),3);
});

test('unaccepted rows show current delivery shortages and full future victory requirements',()=>{
 const w=setup(d=>{withEncounters(d,{wolf:8});catalog(d).supply!.delivery={tool:4};catalog(d).supply!.victories={wolf:2};});
 assert.deepEqual(row(w).remainingDelivery,{tool:1});assert.deepEqual(row(w).remainingVictories,{wolf:2});assert.equal(row(w).ready,false);
 ok(w,'inventory','add',{container:'bag',item:'tool',quantity:1});assert.deepEqual(row(w).remainingDelivery,{tool:0});assert.equal(row(w).ready,false);
});
