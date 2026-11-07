import type { ExecutionContext, JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema, safeCount, safeNumber } from './capacity.ts';
import { isCount, isId, isObject } from './encounter-rules.ts';
import { readPartyMember, readPartyStatus } from './party.ts';
import type { PartyMember } from './party.ts';
import { readSquad } from './squad-rules.ts';
import type { EnemyDefinition, SquadDefinition } from './squad-rules.ts';
import type { ActorRef, InitiativeActor } from './initiative.ts';
import { checkAdventureContainer, grantAdventureRewards, readAdventureInventory, readAdventureProgression } from './adventure-rewards.ts';
import { readSimulationTime } from './simulation-time.ts';

interface Battle {
  encounter: string; name: string; location: string; allies: string[];
  enemies: Array<EnemyDefinition & { hp: number }>;
  loot: Record<string, number>; experience: number; cooldownSeconds: number; startedAt: number;
  phase: 'active' | 'victory' | 'defeat'; round: number; queue: ActorRef[]; cursor: number;
}
interface State { battle: Battle | null; cooldowns: Record<string, { startedAt: number; readyAt: number }>; wins: Record<string, number> }
const refSchema = objectSchema({ side: { enum: ['party', 'enemy'] }, id: idSchema });
const battleSchema = objectSchema({
  encounter: idSchema, name: { type: 'string', minLength: 1 }, location: idSchema,
  allies: { type: 'array', minItems: 1, uniqueItems: true, items: idSchema },
  enemies: { type: 'array', minItems: 1, items: objectSchema({ id: idSchema, name: { type: 'string', minLength: 1 }, maxHp: positiveCountSchema, hp: countSchema, attack: positiveCountSchema, defense: countSchema, speed: countSchema }) },
  loot: recordSchema(positiveCountSchema), experience: countSchema, cooldownSeconds: numberSchema, startedAt: numberSchema,
  phase: { enum: ['active', 'victory', 'defeat'] }, round: positiveCountSchema,
  queue: { type: 'array', minItems: 1, items: refSchema }, cursor: countSchema
});
function json(value: unknown): JsonValue { return value as JsonValue; }
function put<T>(record: Record<string, T>, id: string, value: T): void { Object.defineProperty(record, id, { value, enumerable: true, writable: true, configurable: true }); }
function container(ctx: ReadContext): string { return ctx.config.container as string; }
function sessionOwner(ctx: ReadContext, value = ctx.query('battle-session', 'status')): string | null {
  if (!isObject(value) || !(value.owner === null || isId(value.owner))) return ctx.fail('INVALID_SESSION', '战斗会话返回无效所有者');
  return value.owner;
}
function changeSession(ctx: ExecutionContext, action: 'acquire' | 'release'): void {
  const before = sessionOwner(ctx), expected = action === 'acquire' ? ctx.self : null;
  if (action === 'acquire' ? before !== null : before !== ctx.self) ctx.fail('SESSION_BUSY', '战斗会话所有者不匹配');
  const returned = sessionOwner(ctx, ctx.call('battle-session', action, { owner: ctx.self }));
  if (returned !== expected || sessionOwner(ctx) !== expected) ctx.fail('INVALID_SESSION', '战斗会话变更结果不一致');
}
function checkLocation(ctx: ReadContext, id: string): void {
  const value = ctx.query('location', 'describe', { location: id });
  if (!isObject(value) || value.id !== id || typeof value.name !== 'string' || !value.name.length || typeof value.description !== 'string'
    || !Array.isArray(value.exits) || value.exits.some(exit => !isId(exit)) || new Set(value.exits).size !== value.exits.length) ctx.fail('INVALID_LOCATION', '地点能力没有返回有效地点描述');
}
function location(ctx: ReadContext): string {
  const value = ctx.query('location', 'current');
  if (!isObject(value) || !isId(value.id)) return ctx.fail('INVALID_LOCATION', '地点能力没有返回有效当前位置');
  checkLocation(ctx, value.id); return value.id;
}
function now(ctx: ReadContext, state: State): number {
  let baseline = state.battle?.startedAt ?? 0;
  for (const cooldown of Object.values(state.cooldowns)) baseline = Math.max(baseline, cooldown.startedAt);
  return readSimulationTime(ctx, baseline);
}
function references(ctx: ReadContext, terms: { location: string; loot: Record<string, number> }): void {
  checkLocation(ctx, terms.location);
  for (const item of Object.keys(terms.loot)) readAdventureInventory(ctx, container(ctx), item);
}
function get(ctx: ReadContext, encounter: string): SquadDefinition { return readSquad(ctx, ctx.query('squad-rule', 'get', { encounter }), encounter); }
function catalog(ctx: ReadContext): SquadDefinition[] {
  const value = ctx.query('squad-rule', 'list');
  if (!isObject(value) || !Array.isArray(value.encounters)) return ctx.fail('INVALID_SQUAD_RULE', '群敌目录没有返回有效列表');
  const ids = new Set<string>();
  return value.encounters.map(entry => {
    const found = readSquad(ctx, entry);
    if (ids.has(found.id)) ctx.fail('INVALID_SQUAD_RULE', '群敌目录包含重复 ID');
    ids.add(found.id);
    const detail = get(ctx, found.id);
    if (found.name !== detail.name || found.location !== detail.location || found.experience !== detail.experience || found.cooldownSeconds !== detail.cooldownSeconds
      || JSON.stringify(found.enemies) !== JSON.stringify(detail.enemies) || Object.keys(found.loot).length !== Object.keys(detail.loot).length
      || Object.entries(found.loot).some(([id, quantity]) => own(detail.loot, id) !== quantity)) ctx.fail('INVALID_SQUAD_RULE', '群敌目录与详情不一致');
    return found;
  });
}
function describe(ctx: ReadContext, encounter: string): SquadDefinition {
  const value = catalog(ctx).find(entry => entry.id === encounter);
  if (!value) return ctx.fail('UNKNOWN_ENCOUNTER', `未知遭遇：${encounter}`);
  return value;
}
function member(ctx: ReadContext, id: string): PartyMember {
  const value = readPartyMember(ctx, ctx.query('party', 'member', { member: id }), id);
  const status = readPartyStatus(ctx), listed = status.members.find(entry => entry.id === id);
  if (!listed || Object.keys(value).some(key => value[key as keyof PartyMember] !== listed[key as keyof PartyMember]) || !value.recruited) {
    return ctx.fail('INVALID_PARTY', '队员详情与队伍状态不一致');
  }
  return value;
}
function allies(ctx: ReadContext, battle: Battle): PartyMember[] { return battle.allies.map(id => member(ctx, id)); }
function actors(ctx: ReadContext, battle: Battle): InitiativeActor[] {
  return [...allies(ctx, battle).map(value => ({ side: 'party' as const, id: value.id, speed: value.speed })), ...battle.enemies.map(value => ({ side: 'enemy' as const, id: value.id, speed: value.speed }))];
}
/** Compare side and ID independently: an enemy may have the same ID as a party member. */
function permutation(ctx: ReadContext, value: unknown, expected: ActorRef[]): ActorRef[] {
  if (!Array.isArray(value) || value.length !== expected.length) return ctx.fail('INVALID_INITIATIVE', '行动顺序不是完整参与者排列');
  const seen = { party: new Set<string>(), enemy: new Set<string>() };
  return value.map(entry => {
    if (!isObject(entry) || Object.keys(entry).length !== 2 || (entry.side !== 'party' && entry.side !== 'enemy') || !isId(entry.id)
      || seen[entry.side].has(entry.id) || !expected.some(actor => actor.side === entry.side && actor.id === entry.id)) return ctx.fail('INVALID_INITIATIVE', '行动顺序包含重复或未知参与者');
    seen[entry.side].add(entry.id); return { side: entry.side, id: entry.id };
  });
}
function newQueue(ctx: ReadContext, battle: Battle): ActorRef[] {
  const participants = actors(ctx, battle), value = ctx.query('initiative', 'order', { actors: json(participants) });
  if (!isObject(value)) return ctx.fail('INVALID_INITIATIVE', '行动策略没有返回顺序');
  return permutation(ctx, value.order, participants);
}
function damage(ctx: ReadContext, attack: number, defense: number): number {
  const value = ctx.query('combat-rule', 'damage', { attack, defense });
  if (!isObject(value) || !isCount(value.damage, true)) return ctx.fail('INVALID_COMBAT_RULE', '战斗规则没有返回正安全整数伤害');
  return value.damage;
}
function terminal(ctx: ReadContext, battle: Battle): boolean {
  if (!allies(ctx, battle).some(value => value.hp > 0)) battle.phase = 'defeat';
  else if (!battle.enemies.some(value => value.hp > 0)) battle.phase = 'victory';
  return battle.phase !== 'active';
}
function enemyTurn(ctx: ExecutionContext, state: State, enemy: EnemyDefinition): void {
  const battle = state.battle!, candidates = allies(ctx, battle).filter(value => value.hp > 0);
  const selected = ctx.query('targeting', 'choose', { candidates: candidates.map(({ id, hp, maxHp }) => ({ id, hp, maxHp })) });
  if (!isObject(selected) || !isId(selected.target) || !candidates.some(value => value.id === selected.target)) ctx.fail('INVALID_TARGETING', '目标策略选择了无效队员');
  const before = member(ctx, selected.target), amount = damage(ctx, enemy.attack, before.defense);
  // Cross-capability queries see the transaction's last write, not the detached state above.
  ctx.write(json(state));
  const returned = ctx.call('party', 'damage', { member: before.id, amount });
  const after = member(ctx, before.id), expected = Math.max(0, before.hp - amount);
  if (!isObject(returned) || returned.id !== before.id || returned.hp !== expected || returned.maxHp !== before.maxHp
    || after.hp !== expected || after.maxHp !== before.maxHp) ctx.fail('INVALID_PARTY', '队员伤害返回与实际生命不一致');
}
function advance(ctx: ExecutionContext, state: State): void {
  const battle = state.battle!;
  // At most the rest of this round and the prefix of the next can precede a live ally.
  const limit = 2 * (battle.allies.length + battle.enemies.length) + 1;
  for (let steps = 0; steps < limit; steps++) {
    if (terminal(ctx, battle)) { ctx.write(json(state)); return; }
    if (battle.cursor === battle.queue.length) {
      battle.round = safeCount(ctx, battle.round + 1, '战斗回合');
      battle.queue = newQueue(ctx, battle); battle.cursor = 0;
    }
    const actor = battle.queue[battle.cursor]!;
    if (actor.side === 'party') {
      if (member(ctx, actor.id).hp > 0) { ctx.write(json(state)); return; }
    } else {
      const enemy = battle.enemies.find(value => value.id === actor.id)!;
      if (enemy.hp > 0) enemyTurn(ctx, state, enemy);
    }
    battle.cursor++;
  }
  ctx.fail('INVALID_INITIATIVE', '无法推进到存活队员回合');
}
function status(state: State): JsonObject {
  const battle = state.battle;
  return { phase: battle?.phase ?? 'idle', battle: json(battle), current: battle?.phase === 'active' ? json(battle.queue[battle.cursor]!) : null };
}
function actionStatus(ctx: ReadContext): JsonObject {
  const battle = ctx.state<State>().battle;
  const leader = readPartyStatus(ctx).leader;
  const current = battle?.phase === 'active' ? battle.queue[battle.cursor] : null;
  return {
    phase: battle?.phase ?? 'idle',
    canAct: !!(current?.side === 'party' && current.id === leader && member(ctx, leader).hp > 0),
    targets: battle ? battle.enemies.filter(value => value.hp > 0).map(({ id, name, hp, maxHp }) => ({ id, name, hp, maxHp })) : []
  };
}
function strike(ctx: ExecutionContext, actor: string, target: string, attackBonus: number): JsonObject {
  const state = ctx.state<State>(), battle = state.battle;
  if (!battle || battle.phase !== 'active') return ctx.fail('NO_ACTIVE_BATTLE', '没有进行中的队伍战斗');
  const current = battle.queue[battle.cursor];
  if (!current || current.side !== 'party' || current.id !== actor) ctx.fail('WRONG_ACTOR', '尚未轮到此队员行动');
  const acting = member(ctx, actor);
  if (!acting.hp) ctx.fail('MEMBER_DEAD', '倒下队员不能行动');
  const enemy = battle.enemies.find(value => value.id === target && value.hp > 0);
  if (!enemy) return ctx.fail('INVALID_TARGET', '请选择存活敌人');
  const attack = safeCount(ctx, acting.attack + attackBonus, '技能总攻击');
  enemy.hp = Math.max(0, enemy.hp - damage(ctx, attack, enemy.defense));
  battle.cursor++;
  ctx.write(json(state)); advance(ctx, state); return status(state);
}
function finish(ctx: ExecutionContext, state: State, battle: Battle): void {
  const startedAt = now(ctx, state), readyAt = safeNumber(ctx, startedAt + battle.cooldownSeconds, '遭遇冷却结束时间');
  if (battle.cooldownSeconds > 0 && !(readyAt > startedAt)) ctx.fail('TIME_PRECISION', '冷却秒数过小，结束时间无法表示');
  put(state.cooldowns, battle.encounter, { startedAt, readyAt });
  state.battle = null; ctx.write(json(state)); changeSession(ctx, 'release');
}

export const partyBattleModule: ModuleDefinition = {
  manifest: {
    id: 'battles.party', title: '队伍遭遇战斗', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'party-battle': '1.0.0', 'combat-action': '1.0.0', 'encounter-records': '1.0.0' },
    requires: Object.fromEntries(['party', 'squad-rule', 'initiative', 'targeting', 'combat-rule', 'location', 'inventory', 'progression', 'time', 'battle-session'].map(id => [id, { version: '^1.0.0' }]))
  },
  configSchema: objectSchema({ container: idSchema }),
  stateSchema: objectSchema({ battle: { anyOf: [{ type: 'null' }, battleSchema] }, cooldowns: recordSchema(objectSchema({ startedAt: numberSchema, readyAt: numberSchema })), wins: recordSchema(countSchema) }),
  initialState: () => ({ battle: null, cooldowns: {}, wins: {} }),
  validate(ctx) {
    const state = ctx.state<State>(), party = readPartyStatus(ctx), place = location(ctx);
    checkAdventureContainer(ctx, container(ctx)); readAdventureProgression(ctx); sessionOwner(ctx);
    for (const entry of catalog(ctx)) references(ctx, entry);
    for (const cooldown of Object.values(state.cooldowns)) if (cooldown.readyAt < cooldown.startedAt) ctx.fail('INVALID_COOLDOWN', '遭遇冷却结束早于开始');
    now(ctx, state); damage(ctx, 1, 0);
    const battle = state.battle;
    if (!battle) return;
    references(ctx, battle);
    if (sessionOwner(ctx) !== ctx.self) ctx.fail('INVALID_SESSION', '队伍战斗没有持有自己的会话');
    const members = allies(ctx, battle), enemyIds = new Set(battle.enemies.map(value => value.id));
    if (enemyIds.size !== battle.enemies.length || battle.enemies.some(value => value.hp > value.maxHp)) ctx.fail('INVALID_BATTLE', '敌人身份或生命无效');
    const participants: ActorRef[] = [...battle.allies.map(id => ({ side: 'party' as const, id })), ...battle.enemies.map(value => ({ side: 'enemy' as const, id: value.id }))];
    permutation(ctx, battle.queue, participants);
    if (battle.cursor > battle.queue.length) ctx.fail('INVALID_BATTLE', '行动游标超出队列');
    const enemiesAlive = battle.enemies.some(value => value.hp > 0);
    if ((battle.phase === 'victory' && enemiesAlive) || (battle.phase !== 'victory' && !enemiesAlive)) ctx.fail('INVALID_BATTLE', '战斗阶段与敌人生命不一致');
    if (battle.phase === 'active') {
      const current = battle.queue[battle.cursor];
      if (place !== battle.location || JSON.stringify(party.active) !== JSON.stringify(battle.allies) || !members.some(value => value.hp > 0)
        || !current || current.side !== 'party' || !members.some(value => value.id === current.id && value.hp > 0)) ctx.fail('INVALID_BATTLE', '进行中的战斗没有有效队伍行动回合');
    }
  },
  commands: {
    start: { schema: objectSchema({ encounter: idSchema }), execute(ctx, input) {
      const state = ctx.state<State>();
      if (state.battle) ctx.fail('BATTLE_BUSY', '请先结束当前遭遇');
      const value = describe(ctx, input.encounter as string), party = readPartyStatus(ctx);
      references(ctx, value);
      if (location(ctx) !== value.location) ctx.fail('WRONG_LOCATION', '请先前往遭遇地点');
      if (!party.active.some(id => member(ctx, id).hp > 0)) ctx.fail('PARTY_DEAD', '请先恢复队伍生命');
      const startedAt = now(ctx, state);
      if ((own(state.cooldowns, value.id)?.readyAt ?? 0) > startedAt) ctx.fail('ENCOUNTER_COOLDOWN', '遭遇尚未恢复');
      state.battle = { encounter: value.id, name: value.name, location: value.location, allies: [...party.active], enemies: value.enemies.map(enemy => ({ ...enemy, hp: enemy.maxHp })), loot: value.loot, experience: value.experience, cooldownSeconds: value.cooldownSeconds, startedAt, phase: 'active', round: 1, queue: [], cursor: 0 };
      state.battle.queue = newQueue(ctx, state.battle);
      ctx.write(json(state)); changeSession(ctx, 'acquire'); advance(ctx, state); return status(state);
    } },
    attack: { schema: objectSchema({ actor: idSchema, target: idSchema }), execute: (ctx, input) => strike(ctx, input.actor as string, input.target as string, 0) },
    strike: { schema: objectSchema({ actor: idSchema, target: idSchema, attackBonus: countSchema }), execute: (ctx, input) => strike(ctx, input.actor as string, input.target as string, input.attackBonus as number) },
    performStrike: { schema: objectSchema({ attackBonus: countSchema, target: idSchema }, ['attackBonus']), execute(ctx, input) {
      const action = actionStatus(ctx), targets = action.targets as JsonObject[];
      if (!action.canAct) ctx.fail('CANNOT_ACT', '当前不是存活领队的回合');
      const target = input.target ?? (targets.length === 1 ? targets[0]!.id : undefined);
      if (typeof target !== 'string') return ctx.fail('TARGET_REQUIRED', '多个目标时必须选择敌人');
      strike(ctx, readPartyStatus(ctx).leader, target, input.attackBonus as number); return actionStatus(ctx);
    } },
    claim: { schema: emptySchema, execute(ctx) {
      const state = ctx.state<State>(), battle = state.battle;
      if (!battle || battle.phase !== 'victory') return ctx.fail('NO_VICTORY', '没有待领取的胜利奖励');
      if (location(ctx) !== battle.location) ctx.fail('WRONG_LOCATION', '请返回遭遇地点领取奖励');
      grantAdventureRewards(ctx, { container: container(ctx), loot: battle.loot, experience: battle.experience });
      put(state.wins, battle.encounter, safeCount(ctx, (own(state.wins, battle.encounter) ?? 0) + 1, '遭遇胜利次数'));
      finish(ctx, state, battle); return status(state);
    } },
    retreat: { schema: emptySchema, execute(ctx) {
      const state = ctx.state<State>();
      if (!state.battle) return ctx.fail('NO_BATTLE', '没有可放弃的遭遇');
      finish(ctx, state, state.battle); return status(state);
    } }
  },
  events: { 'location.moved': (ctx, event) => { if (event.source === ctx.provider('location') && ctx.state<State>().battle?.phase === 'active') ctx.fail('BATTLE_ACTIVE', '战斗中不能移动'); } },
  queries: {
    status: { schema: emptySchema, execute: ctx => status(ctx.state<State>()) },
    actionStatus: { schema: emptySchema, execute: actionStatus },
    records: { schema: emptySchema, execute: ctx => ({ wins: ctx.state<State>().wins }) },
    describe: { schema: objectSchema({ encounter: idSchema }), execute: (ctx, input) => json(describe(ctx, input.encounter as string)) },
    list: { schema: emptySchema, execute(ctx) {
      const state = ctx.state<State>(), time = now(ctx, state), place = location(ctx), party = readPartyStatus(ctx);
      const ready = !state.battle && sessionOwner(ctx) === null && party.active.some(id => member(ctx, id).hp > 0);
      return { encounters: catalog(ctx).map(value => {
        const remainingSeconds = Math.max(0, (own(state.cooldowns, value.id)?.readyAt ?? 0) - time);
        return { ...value, available: ready && place === value.location && remainingSeconds === 0, remainingSeconds };
      }) };
    } }
  }
};
