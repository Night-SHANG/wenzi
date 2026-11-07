import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRegistry, createWorld, restoreWorld, reconfigureWorld } from '../src/engine/index.ts';
import type { JsonObject, JsonValue, ModuleDefinition, WorldDefinition } from '../src/contracts.ts';
import { capacityModules, safeCount } from '../src/modules/capacity.ts';
import { inventoryModule } from '../src/modules/inventory.ts';
import { locationModule } from '../src/modules/location.ts';
import { timeModules } from '../src/modules/time.ts';
import { combatRulesModule } from '../src/modules/combat-rules.ts';
import { encounterRulesModule } from '../src/modules/encounter-rules.ts';
import { encountersModule } from '../src/modules/encounters.ts';
import { partyBattleModule } from '../src/modules/party-battle.ts';
const member=(id:string,leader=false)=>({id,name:id,maxHp:20,hp:20,attack:4,defense:1,speed:2,isLeader:leader,recruited:true,active:true});
const enemy=(id:string)=>({id,name:id,maxHp:8,attack:5,defense:0,speed:1});
const squad=()=>({id:'wolves',name:'Wolves',location:'forest',enemies:[enemy('wolf'),enemy('bear')],loot:{pelt:1},experience:10,cooldownSeconds:10});
const party:ModuleDefinition={manifest:{id:'fixture.party',title:'Party',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{party:'1.0.0'}},initialState:config=>({members:config.members??[member('hero',true),member('friend')]}),queries:{status:{execute(ctx){const s=ctx.state<{members:ReturnType<typeof member>[]}>();return {leader:s.members[0]!.id,capacity:2,active:s.members.filter(m=>m.active).map(m=>m.id),members:s.members};}},member:{execute(ctx,input){const m=ctx.state<{members:ReturnType<typeof member>[]}>().members.find(m=>m.id===input.member);return m as unknown as JsonValue;}}},commands:{damage:{execute(ctx,input){const s=ctx.state<{members:ReturnType<typeof member>[]}>(),m=s.members.find(m=>m.id===input.member)!;m.hp=Math.max(0,m.hp-(input.amount as number));if(!ctx.config.lieDamage)ctx.write(s as unknown as JsonValue);return ctx.config.badDamage??{id:m.id,hp:m.hp,maxHp:m.maxHp};}},set:{execute(ctx,input){const s=ctx.state<{members:ReturnType<typeof member>[]}>(),m=s.members.find(m=>m.id===input.member)!;Object.assign(m,input.patch);ctx.write(s as unknown as JsonValue);return null;}}}};
const rules:ModuleDefinition={manifest:{id:'fixture.squad',title:'Squad',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'squad-rule':'1.0.0'}},initialState:()=>({}),queries:{list:{execute:ctx=>({encounters:ctx.config.entries??[squad()]})},get:{execute(ctx,input){if(ctx.config.getEntry)return ctx.config.getEntry;const entries=(ctx.config.entries??[squad()]) as unknown as {id:string}[];return entries.find(e=>e.id===input.encounter) as unknown as JsonValue;}}}};
const order:ModuleDefinition={manifest:{id:'fixture.order',title:'Order',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{initiative:'1.0.0'}},initialState:()=>({}),queries:{order:{execute(ctx,input){const actors=input.actors as unknown as {side:string;id:string;speed:number}[];return {order:ctx.config.order??actors.map(({side,id})=>({side,id}))};}}}};
const targeting:ModuleDefinition={manifest:{id:'fixture.target',title:'Target',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{targeting:'1.0.0'}},initialState:()=>({}),queries:{choose:{execute:(ctx,input)=>({target:ctx.config.target??(input.candidates as JsonObject[])[0]!.id!})}}};
const session:ModuleDefinition={manifest:{id:'fixture.session',title:'Session',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{'battle-session':'1.0.0'}},initialState:()=>({owner:null}),queries:{status:{execute:ctx=>ctx.state<JsonObject>()}},commands:{acquire:{execute(ctx,input){if(ctx.state<{owner:string|null}>().owner!==null)ctx.fail('BUSY','busy');ctx.write({owner:input.owner!});return {owner:input.owner!};}},release:{execute(ctx,input){if(ctx.config.failRelease)ctx.fail('RELEASE','release');if(ctx.state<{owner:string|null}>().owner!==input.owner)ctx.fail('OWNER','owner');ctx.write({owner:null});return {owner:null};}}}};
const progression:ModuleDefinition={manifest:{id:'fixture.xp',title:'XP',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{progression:'1.0.0'}},initialState:()=>({experience:0}),queries:{status:{execute:ctx=>({...ctx.state<JsonObject>(),level:1,floorExperience:0,nextExperience:null,values:{attack:4,defense:1,maxHp:20}})}},commands:{gain:{execute(ctx,input){const experience=safeCount(ctx,ctx.state<{experience:number}>().experience+(input.amount as number),'xp');if(!ctx.config.lie)ctx.write({experience});return {experience,level:1,floorExperience:0,nextExperience:null,values:{attack:4,defense:1,maxHp:20}};}},set:{execute(ctx,input){ctx.write(input);return input;}}}};
const vitals:ModuleDefinition={manifest:{id:'fixture.vitals',title:'Vitals',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{vitals:'1.0.0'}},initialState:()=>({hp:20,maxHp:20}),queries:{status:{execute:ctx=>ctx.state<JsonObject>()}},commands:{damage:{execute(ctx,input){const s=ctx.state<{hp:number;maxHp:number}>();s.hp=Math.max(0,s.hp-(input.amount as number));ctx.write(s);return s;}}}};
const noise:ModuleDefinition={manifest:{id:'fixture.noise',title:'Noise',version:'1.0.0',apiVersion:1,stateVersion:1,provides:{}},initialState:()=>({}),commands:{move:{execute(ctx){ctx.emit('location.moved');return null;}}}};
function registry(){return new ModuleRegistry([...capacityModules,inventoryModule,locationModule,...timeModules,combatRulesModule,party,rules,order,targeting,session,progression,vitals,noise,encounterRulesModule,encountersModule,partyBattleModule]);}
function definition():WorldDefinition{return {id:'party.test',title:'Party',version:'1.0.0',modules:[
{id:'capacity',module:'capacity.slots',config:{}},{id:'inventory',module:'inventory.basic',config:{items:{pelt:{name:'Pelt',weight:1,volume:1,length:1},ore:{name:'Ore',weight:1,volume:1,length:1}},containers:{bag:{limits:{slots:2},items:{}}}}},
{id:'location',module:'location.nodes',config:{start:'forest',nodes:{forest:{name:'Forest',description:'',exits:['town']},town:{name:'Town',description:'',exits:['forest']}}}},
{id:'clock',module:'time.step',config:{secondsPerStep:10}},{id:'party',module:'fixture.party',config:{}},{id:'rules',module:'fixture.squad',config:{}},{id:'order',module:'fixture.order',config:{}},{id:'targeting',module:'fixture.target',config:{}},{id:'session',module:'fixture.session',config:{}},{id:'xp',module:'fixture.xp',config:{}},{id:'combat',module:'combat.difference',config:{}},{id:'noise',module:'fixture.noise',config:{}},
{id:'battle',module:'battles.party',config:{container:'bag'},bindings:{party:'party','squad-rule':'rules',initiative:'order',targeting:'targeting','battle-session':'session',progression:'xp',inventory:'inventory',location:'location',time:'clock','combat-rule':'combat'}}]};}
function instance(d:WorldDefinition,id:string){const value=d.modules.find(m=>m.id===id);assert.ok(value);return value;}
function setup(edit?:(d:WorldDefinition)=>void){const d=definition();edit?.(d);return createWorld(registry(),d);}
type World=ReturnType<typeof setup>;
function ok(w:World,target:string,action:string,input:JsonObject={}){const r=w.dispatch({target,action,input});assert.equal(r.ok,true,JSON.stringify(r));if(!r.ok)throw Error('command');return r.value;}
function fail(w:World,target:string,action:string,input:JsonObject={}){const s=w.snapshot(),r=w.dispatch({target,action,input});assert.equal(r.ok,false,JSON.stringify(r));assert.deepEqual(w.snapshot(),s);}
const status=(w:World)=>w.query('battle','status') as any;
const hp=(w:World,id='hero')=>(w.query('party','member',{member:id}) as any).hp;
const start=(w:World)=>ok(w,'battle','start',{encounter:'wolves'});
const attack=(w:World,actor:string,target:string)=>ok(w,'battle','attack',{actor,target});
function win(w:World){start(w);attack(w,'hero','wolf');attack(w,'friend','wolf');attack(w,'hero','bear');attack(w,'friend','bear');}

test('two allies and two enemies follow queue with explicit actor and target and no immediate retaliation',()=>{
 const w=setup(),before=w.snapshot();assert.deepEqual(status(w),{phase:'idle',battle:null,current:null});assert.deepEqual(w.snapshot(),before);start(w);assert.deepEqual(status(w).current,{side:'party',id:'hero'});assert.deepEqual(w.query('session','status'),{owner:'battle'});fail(w,'battle','attack',{actor:'friend',target:'wolf'});fail(w,'battle','attack',{actor:'hero',target:'absent'});attack(w,'hero','wolf');assert.equal(hp(w),20);assert.equal(status(w).battle.enemies[0].hp,4);assert.deepEqual(status(w).current,{side:'party',id:'friend'});attack(w,'friend','wolf');assert.equal(hp(w),16);assert.equal(status(w).battle.round,2);assert.deepEqual(status(w).current,{side:'party',id:'hero'});attack(w,'hero','bear');attack(w,'friend','bear');assert.equal(status(w).phase,'victory');assert.equal(hp(w),16);assert.equal(status(w).current,null);assert.deepEqual(w.query('battle','records'),{wins:{}});ok(w,'battle','claim');assert.deepEqual(w.query('battle','records'),{wins:{wolves:1}});assert.deepEqual(w.query('inventory','count',{container:'bag',item:'pelt'}),{quantity:1});assert.deepEqual(w.query('session','status'),{owner:null});fail(w,'battle','claim');
});
test('enemy first order auto plays; leader KO skips leader while companion acts; all allies KO is defeat',()=>{
 const queue=[{side:'enemy',id:'wolf'},{side:'enemy',id:'bear'},{side:'party',id:'hero'},{side:'party',id:'friend'}];const w=setup(d=>{instance(d,'order').config.order=queue;instance(d,'party').config.members=[{...member('hero',true),hp:4},member('friend')];});start(w);assert.equal(hp(w),0);assert.equal(hp(w,'friend'),16);assert.equal(status(w).phase,'active');assert.deepEqual(status(w).current,{side:'party',id:'friend'});assert.equal((w.query('battle','actionStatus') as any).canAct,false);fail(w,'battle','performStrike',{attackBonus:0,target:'wolf'});
 const x=setup(d=>{instance(d,'order').config.order=queue;instance(d,'party').config.members=[{...member('hero',true),hp:4},{...member('friend'),hp:4}];});start(x);assert.equal(status(x).phase,'defeat');ok(x,'party','set',{member:'hero',patch:{hp:20}});assert.equal(status(x).phase,'defeat');fail(x,'battle','attack',{actor:'hero',target:'wolf'});ok(x,'battle','retreat');assert.equal(status(x).phase,'idle');
});
test('combat-action only acts for current leader and sole remaining target is optional',()=>{
 const w=setup();start(w);assert.deepEqual(w.query('battle','actionStatus'),{phase:'active',canAct:true,targets:[{id:'wolf',name:'wolf',hp:8,maxHp:8},{id:'bear',name:'bear',hp:8,maxHp:8}]});fail(w,'battle','performStrike',{attackBonus:0});ok(w,'battle','performStrike',{attackBonus:4,target:'wolf'});assert.equal((w.query('battle','actionStatus') as any).canAct,false);attack(w,'friend','bear');const result=ok(w,'battle','performStrike',{attackBonus:0});assert.deepEqual(result,{phase:'victory',canAct:false,targets:[]});
});
test('partial enemy attacks and malformed HP or targeting results rollback all writes and receipts',()=>{
 for(const edit of [(d:WorldDefinition)=>{instance(d,'party').config.badDamage={id:'hero',hp:19,maxHp:20};},(d:WorldDefinition)=>{instance(d,'targeting').config.target='absent';}]){const w=setup(edit);start(w);attack(w,'hero','wolf');fail(w,'battle','attack',{actor:'friend',target:'bear'});assert.equal(hp(w),20);}
 const w=setup(d=>{instance(d,'order').config.order=[{side:'party',id:'hero'}];});assert.throws(()=>start(w));
});
test('full inventory and XP overflow preserve victory and exact session for retry',()=>{
 const w=setup(d=>{instance(d,'rules').config.entries=[{...squad(),loot:{pelt:1,ore:1}}];(instance(d,'inventory').config.containers as any).bag.limits.slots=1;});win(w);fail(w,'battle','claim');assert.deepEqual(w.query('inventory','count',{container:'bag',item:'pelt'}),{quantity:0});const d=w.definition;(instance(d,'inventory').config.containers as any).bag.limits.slots=2;const x=reconfigureWorld(registry(),w,d);ok(x,'xp','set',{experience:Number.MAX_SAFE_INTEGER});fail(x,'battle','claim');ok(x,'xp','set',{experience:0});ok(x,'battle','claim');assert.deepEqual(x.query('session','status'),{owner:null});
});
test('release failure and lying XP write rollback the full reward transaction',()=>{
 for(const [id,key] of [['session','failRelease'],['xp','lie']]){const w=setup(d=>{instance(d,id!).config[key!]=true;});win(w);fail(w,'battle','claim');assert.deepEqual(w.query('inventory','count',{container:'bag',item:'pelt'}),{quantity:0});assert.equal(status(w).phase,'victory');}
});
test('active movement source filtering, active and pending restore, frozen deleted catalog and clock swap',()=>{
 const w=setup();start(w);fail(w,'location','move',{to:'town'});ok(w,'noise','move');attack(w,'hero','wolf');const active=restoreWorld(registry(),w.snapshot());attack(active,'friend','wolf');const d=active.definition;instance(d,'rules').config.entries=[];instance(d,'clock').module='time.continuous';instance(d,'clock').config={};const swapped=reconfigureWorld(registry(),active,d);attack(swapped,'hero','bear');attack(swapped,'friend','bear');const pending=restoreWorld(registry(),swapped.snapshot());ok(pending,'location','move',{to:'town'});fail(pending,'battle','claim');ok(pending,'location','move',{to:'forest'});ok(pending,'clock','advance',{seconds:3});ok(pending,'battle','claim');assert.deepEqual((pending.snapshot().modules.battle!.state as any).cooldowns,{wolves:{startedAt:3,readyAt:13}});assert.equal((pending.query('xp','status') as any).experience,10);
});
test('policy replacement keeps current queue and uses new order next round',()=>{
 const w=setup();start(w);attack(w,'hero','wolf');const queue=status(w).battle.queue,d=w.definition;instance(d,'order').config.order=[{side:'party',id:'friend'},{side:'party',id:'hero'},{side:'enemy',id:'bear'},{side:'enemy',id:'wolf'}];const x=reconfigureWorld(registry(),w,d);assert.deepEqual(status(x).battle.queue,queue);attack(x,'friend','wolf');assert.equal(status(x).battle.round,2);assert.deepEqual(status(x).current,{side:'party',id:'friend'});
});
test('duel and second squad cannot start while any non-null phase holds session',()=>{
 const w=setup(d=>{d.modules.push({...structuredClone(instance(d,'battle')),id:'second'},{id:'vitals',module:'fixture.vitals',config:{}},{id:'duelRules',module:'encounters.catalog',config:{encounters:{duel:{name:'Duel',location:'forest',enemy:{maxHp:4,attack:1,defense:0},loot:{},experience:0,cooldownSeconds:0}}}},{id:'duel',module:'encounters.duel',config:{container:'bag'},bindings:{'encounter-rule':'duelRules','combat-rule':'combat',inventory:'inventory',progression:'xp',vitals:'vitals',time:'clock',location:'location','battle-session':'session'}});});start(w);fail(w,'second','start',{encounter:'wolves'});fail(w,'duel','start',{encounter:'duel'});attack(w,'hero','wolf');attack(w,'friend','wolf');attack(w,'hero','bear');attack(w,'friend','bear');fail(w,'duel','start',{encounter:'duel'});ok(w,'battle','claim');ok(w,'duel','start',{encounter:'duel'});fail(w,'battle','start',{encounter:'wolves'});ok(w,'duel','attack');fail(w,'second','start',{encounter:'wolves'});ok(w,'duel','claim');
});

test('same ID on opposite sides, own object keys and astral IDs keep identity through victory',()=>{
 for(const id of ['hero','toString','wolf: "夜"','😀'.repeat(128)]){
  const w=setup(d=>{instance(d,'rules').config.entries=[{...squad(),id,enemies:[enemy('hero'),enemy('friend')]}];});
  ok(w,'battle','start',{encounter:id});attack(w,'hero','hero');attack(w,'friend','hero');attack(w,'hero','friend');attack(w,'friend','friend');const x=restoreWorld(registry(),w.snapshot());ok(x,'battle','claim');assert.deepEqual(x.query('battle','records'),{wins:{[id]:1}});
 }
});
test('safe arithmetic rejects bonus round wins and clock overflow without changing snapshots',()=>{
 const w=setup();start(w);fail(w,'battle','strike',{actor:'hero',target:'wolf',attackBonus:Number.MAX_SAFE_INTEGER});
 const save=w.snapshot();(save.modules.battle!.state as any).battle.round=Number.MAX_SAFE_INTEGER;const x=restoreWorld(registry(),save);attack(x,'hero','wolf');fail(x,'battle','attack',{actor:'friend',target:'wolf'});
 const v=setup();win(v);const s=v.snapshot();(s.modules.battle!.state as any).wins.wolves=Number.MAX_SAFE_INTEGER;const overflow=restoreWorld(registry(),s);fail(overflow,'battle','claim');
 for(const [time,cooldown] of [[Number.MAX_SAFE_INTEGER,10],[2**52,0.1]]){const t=setup(d=>{instance(d,'clock').module='time.continuous';instance(d,'clock').config={};instance(d,'rules').config.entries=[{...squad(),cooldownSeconds:cooldown!}];});ok(t,'clock','advance',{seconds:time!});win(t);fail(t,'battle','claim');fail(t,'battle','retreat');}
});
test('restored active queue identity phase location roster ownership and time invariants reject',()=>{
 const w=setup();start(w);ok(w,'clock','advance',{steps:1});
 for(const change of [(s:any)=>{s.modules.battle.state.battle.queue[0]={side:'party',id:'absent'};},(s:any)=>{s.modules.battle.state.battle.cursor=2;},(s:any)=>{s.modules.battle.state.battle.enemies[0].hp=9;},(s:any)=>{s.modules.battle.state.battle.phase='victory';},(s:any)=>{s.modules.battle.state.battle.startedAt=11;},(s:any)=>{s.modules.battle.state.battle.allies=['friend','hero'];},(s:any)=>{s.modules.session.state.owner='other';},(s:any)=>{s.modules.location.state.current='town';s.modules.location.state.visited.push('town');}]){const save=w.snapshot();change(save);assert.throws(()=>restoreWorld(registry(),save));}
});
test('revival before queued slot acts this round; revival after slot waits for next round',()=>{
 const w=setup(d=>{instance(d,'party').config.members=[member('hero',true),{...member('friend'),hp:0}];});start(w);ok(w,'party','set',{member:'friend',patch:{hp:20}});attack(w,'hero','wolf');assert.equal(status(w).battle.round,1);assert.deepEqual(status(w).current,{side:'party',id:'friend'});
 const x=setup(d=>{instance(d,'party').config.members=[member('hero',true),{...member('friend'),hp:0}];instance(d,'order').config.order=[{side:'party',id:'friend'},{side:'party',id:'hero'},{side:'enemy',id:'wolf'},{side:'enemy',id:'bear'}];});start(x);ok(x,'party','set',{member:'friend',patch:{hp:20}});attack(x,'hero','wolf');assert.equal(status(x).battle.round,2);assert.deepEqual(status(x).current,{side:'party',id:'friend'});
});
test('new malformed initiative is rejected only when renewed queue is consumed and rolls back earlier enemy turns',()=>{
 const w=setup();start(w);attack(w,'hero','wolf');const d=w.definition;instance(d,'order').config.order=[{side:'party',id:'hero'},{side:'party',id:'hero'},{side:'enemy',id:'wolf'},{side:'enemy',id:'bear'}];const x=reconfigureWorld(registry(),w,d);fail(x,'battle','attack',{actor:'friend',target:'bear'});assert.equal(hp(x),20);
});
test('live attack defense and target policy are read per action while current catalog remains independently validated',()=>{
 const w=setup();start(w);ok(w,'party','set',{member:'hero',patch:{attack:0,defense:5}});attack(w,'hero','wolf');assert.equal(status(w).battle.enemies[0].hp,7);const d=w.definition;instance(d,'targeting').config.target='friend';const x=reconfigureWorld(registry(),w,d);attack(x,'friend','wolf');assert.equal(hp(x),20);assert.equal(hp(x,'friend'),12);
 for(const entry of [{...squad(),enemies:[{...enemy('wolf'),attack:0}]},{...squad(),id:'😀'.repeat(129)},{...squad(),loot:{pelt:0}}]){const before=x.snapshot(),bad=x.definition;instance(bad,'rules').config.entries=[entry];assert.throws(()=>reconfigureWorld(registry(),x,bad));assert.deepEqual(x.snapshot(),before);}
});

test('valid HP result without an actual party write cannot commit outgoing or enemy damage',()=>{
 const w=setup(d=>{instance(d,'party').config.lieDamage=true;});start(w);attack(w,'hero','wolf');fail(w,'battle','attack',{actor:'friend',target:'bear'});assert.equal(hp(w),20);
});
test('list availability includes session ownership living active party and frozen cooldown',()=>{
 const w=setup();assert.equal((w.query('battle','list') as any).encounters[0].available,true);ok(w,'session','acquire',{owner:'another'});assert.equal((w.query('battle','list') as any).encounters[0].available,false);fail(w,'battle','start',{encounter:'wolves'});ok(w,'session','release',{owner:'another'});start(w);ok(w,'battle','retreat');assert.equal((w.query('battle','list') as any).encounters[0].remainingSeconds,10);ok(w,'clock','advance',{steps:1});assert.equal((w.query('battle','list') as any).encounters[0].available,true);ok(w,'party','set',{member:'hero',patch:{hp:0}});ok(w,'party','set',{member:'friend',patch:{hp:0}});assert.equal((w.query('battle','list') as any).encounters[0].available,false);fail(w,'battle','start',{encounter:'wolves'});
});

test('a catalog cannot start or describe a hidden get-only encounter absent from its list',()=>{
 const w=setup(d=>{instance(d,'rules').config.entries=[];instance(d,'rules').config.getEntry=squad();});
 fail(w,'battle','start',{encounter:'wolves'});assert.throws(()=>w.query('battle','describe',{encounter:'wolves'}));
});
