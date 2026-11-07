import type { ExecutionContext, JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema, safeCount, safeNumber } from './capacity.ts';
import { isCount, isId, isObject, readEncounter } from './encounter-rules.ts';
import type { EncounterDefinition } from './encounter-rules.ts';
import { readSimulationTime } from './simulation-time.ts';

interface FrozenBattle { encounter: string; name: string; location: string; enemyMaxHp: number; enemyHp: number; enemyAttack: number; enemyDefense: number; loot: Record<string, number>; experience: number; cooldownSeconds: number; startedAt: number; phase: 'active' | 'victory' | 'defeat' }
interface State { battle: FrozenBattle | null; cooldowns: Record<string, { startedAt: number; readyAt: number }>; wins: Record<string, number> }
const battleSchema = objectSchema({ encounter: idSchema, name: { type: 'string', minLength: 1 }, location: idSchema, enemyMaxHp: positiveCountSchema, enemyHp: countSchema, enemyAttack: positiveCountSchema, enemyDefense: countSchema, loot: recordSchema(positiveCountSchema), experience: countSchema, cooldownSeconds: numberSchema, startedAt: numberSchema, phase: { enum: ['active', 'victory', 'defeat'] } });
function json(value: unknown): JsonValue { return value as JsonValue; }
function container(ctx: ReadContext): string { return ctx.config.container as string; }
function put<T>(record: Record<string, T>, id: string, value: T): void { Object.defineProperty(record, id, { value, enumerable: true, writable: true, configurable: true }); }
function quantity(ctx: ReadContext, value: JsonValue): number { if (!isObject(value) || !isCount(value.quantity)) return ctx.fail('INVALID_INVENTORY', '库存能力没有返回有效数量'); return value.quantity; }
function count(ctx: ReadContext, item: string): number { return quantity(ctx, ctx.query('inventory', 'count', { container: container(ctx), item })); }
function checkContainer(ctx: ReadContext): void { const value = ctx.query('inventory', 'list', { container: container(ctx) }); if (!isObject(value) || !Array.isArray(value.items) || !isObject(value.limits)) ctx.fail('INVALID_INVENTORY', '库存能力没有返回有效容器'); }
function checkLocation(ctx: ReadContext, location: string): void {
  const value = ctx.query('location', 'describe', { location });
  if (!isObject(value) || value.id !== location || typeof value.name !== 'string' || !value.name.length || typeof value.description !== 'string' || !Array.isArray(value.exits) || value.exits.some(exit => !isId(exit)) || new Set(value.exits).size !== value.exits.length) ctx.fail('INVALID_LOCATION', '地点能力没有返回有效地点描述');
}
function location(ctx: ReadContext): string { const value = ctx.query('location', 'current'); if (!isObject(value) || !isId(value.id)) return ctx.fail('INVALID_LOCATION', '地点能力没有返回有效当前位置'); checkLocation(ctx, value.id); return value.id; }
function health(ctx: ReadContext, value = ctx.query('vitals', 'status')): { hp: number; maxHp: number } { if (!isObject(value) || !isCount(value.hp) || !isCount(value.maxHp, true) || value.hp > value.maxHp) return ctx.fail('INVALID_VITALS', '生命能力没有返回有效生命值'); return { hp: value.hp, maxHp: value.maxHp }; }
function progression(ctx: ReadContext, value = ctx.query('progression', 'status')): { experience: number; values: Record<string, number> } {
  if (!isObject(value) || !isCount(value.experience) || !isCount(value.level, true) || !isCount(value.floorExperience) || value.floorExperience > value.experience
    || !(value.nextExperience === null || (isCount(value.nextExperience) && value.nextExperience > value.experience)) || !isObject(value.values)
    || Object.entries(value.values).some(([id, n]) => !isId(id) || !isCount(n))) return ctx.fail('INVALID_PROGRESSION', '成长能力没有返回有效战斗属性');
  return { experience: value.experience, values: value.values as Record<string, number> };
}
function attributes(ctx: ReadContext): { attack: number; defense: number } {
  if (!ctx.has('attributes')) { const { values } = progression(ctx); if (!isCount(values.attack, true) || !isCount(values.defense)) return ctx.fail('INVALID_PROGRESSION', '成长能力没有返回有效战斗属性'); return { attack: values.attack, defense: values.defense }; }
  const result = ctx.query('attributes', 'status');
  if (!isObject(result) || !isObject(result.values) || !isCount(result.values.attack, true) || !isCount(result.values.defense)) return ctx.fail('INVALID_ATTRIBUTES', '属性能力没有返回有效战斗属性');
  return { attack: result.values.attack, defense: result.values.defense };
}
function strike(ctx: ExecutionContext, attackBonus: number): JsonObject {
  const state = ctx.state<State>(), battle = state.battle; if (!battle || battle.phase !== 'active') return ctx.fail('NO_ACTIVE_BATTLE', '没有进行中的战斗');
  const stats = attributes(ctx), before = health(ctx); if (!before.hp) ctx.fail('PLAYER_DEAD', '角色没有生命');
  const attack = safeCount(ctx, stats.attack + attackBonus, '技能总攻击');
  battle.enemyHp = Math.max(0, battle.enemyHp - damage(ctx, attack, battle.enemyDefense));
  if (!battle.enemyHp) battle.phase = 'victory';
  else { const amount = damage(ctx, battle.enemyAttack, stats.defense), after = health(ctx, ctx.call('vitals', 'damage', { amount })); if (after.maxHp !== before.maxHp || after.hp !== Math.max(0, before.hp - amount)) ctx.fail('INVALID_VITALS', '生命扣减结果不一致'); if (!after.hp) battle.phase = 'defeat'; }
  ctx.write(json(state)); return status(state);
}
function damage(ctx: ReadContext, attack: number, defense: number): number { const value = ctx.query('combat-rule', 'damage', { attack, defense }); if (!isObject(value) || !isCount(value.damage, true)) return ctx.fail('INVALID_COMBAT_RULE', '战斗规则没有返回正安全整数伤害'); return value.damage; }
function now(ctx: ReadContext, state: State): number { let baseline = state.battle?.startedAt ?? 0; for (const cooldown of Object.values(state.cooldowns)) baseline = Math.max(baseline, cooldown.startedAt); return readSimulationTime(ctx, baseline); }
function get(ctx: ReadContext, encounter: string): EncounterDefinition { return readEncounter(ctx, ctx.query('encounter-rule', 'get', { encounter }), encounter); }
function catalog(ctx: ReadContext): EncounterDefinition[] {
  const result = ctx.query('encounter-rule', 'list'); if (!isObject(result) || !Array.isArray(result.encounters)) return ctx.fail('INVALID_ENCOUNTER_RULE', '遭遇规则没有返回有效目录');
  const ids = new Set<string>();
  return result.encounters.map(entry => {
    const value = readEncounter(ctx, entry); if (ids.has(value.id)) ctx.fail('INVALID_ENCOUNTER_RULE', '遭遇目录包含重复 ID'); ids.add(value.id);
    const found = get(ctx, value.id);
    if (value.name !== found.name || value.location !== found.location || value.enemy.maxHp !== found.enemy.maxHp || value.enemy.attack !== found.enemy.attack || value.enemy.defense !== found.enemy.defense || value.experience !== found.experience || value.cooldownSeconds !== found.cooldownSeconds || Object.keys(value.loot).length !== Object.keys(found.loot).length || Object.entries(value.loot).some(([id, n]) => own(found.loot, id) !== n)) ctx.fail('INVALID_ENCOUNTER_RULE', '遭遇目录与详情不一致');
    return value;
  });
}
function references(ctx: ReadContext, value: { location: string; loot: Record<string, number> }): void { checkLocation(ctx, value.location); for (const item of Object.keys(value.loot)) count(ctx, item); }
function status(state: State): JsonObject { return { battle: json(state.battle), phase: state.battle?.phase ?? 'idle' }; }
function finish(ctx: ExecutionContext, state: State, battle: FrozenBattle): void {
  const startedAt = now(ctx, state), readyAt = safeNumber(ctx, startedAt + battle.cooldownSeconds, '遭遇冷却结束时间');
  if (battle.cooldownSeconds > 0 && !(readyAt > startedAt)) ctx.fail('TIME_PRECISION', '冷却秒数过小，结束时间无法表示');
  put(state.cooldowns, battle.encounter, { startedAt, readyAt }); state.battle = null; ctx.write(json(state));
}
export const encountersModule: ModuleDefinition = {
  manifest: { id: 'encounters.duel', title: '可重复决斗', version: '1.1.0', apiVersion: 1, stateVersion: 1, provides: { encounters: '1.1.0' }, requires: { attributes: { version: '^1.0.0', optional: true }, ...Object.fromEntries(['encounter-rule', 'combat-rule', 'location', 'inventory', 'progression', 'vitals', 'time'].map(id => [id, { version: '^1.0.0' }])) } },
  configSchema: objectSchema({ container: idSchema }), stateSchema: objectSchema({ battle: { anyOf: [{ type: 'null' }, battleSchema] }, cooldowns: recordSchema(objectSchema({ startedAt: numberSchema, readyAt: numberSchema })), wins: recordSchema(countSchema) }),
  initialState: () => ({ battle: null, cooldowns: {}, wins: {} }),
  migrate(previous) { if (previous.moduleId !== 'encounters.duel' || previous.version !== '1.0.0' || previous.stateVersion !== 1) throw new Error('不兼容的遭遇状态'); return previous.state; },
  validate(ctx) {
    const state = ctx.state<State>(); checkContainer(ctx); location(ctx); const hp = health(ctx), stats = attributes(ctx); progression(ctx);
    for (const entry of catalog(ctx)) references(ctx, entry);
    damage(ctx, stats.attack, 0);
    for (const cooldown of Object.values(state.cooldowns)) if (cooldown.readyAt < cooldown.startedAt) ctx.fail('INVALID_COOLDOWN', '遭遇冷却结束早于开始');
    now(ctx, state);
    const battle = state.battle;
    if (battle) {
      references(ctx, battle);
      if (battle.enemyHp > battle.enemyMaxHp || (battle.phase === 'victory' ? battle.enemyHp !== 0 : battle.enemyHp === 0) || (battle.phase === 'active' && hp.hp === 0)) ctx.fail('INVALID_BATTLE', '战斗阶段与生命值不一致');
    }
  },
  commands: {
    start: { schema: objectSchema({ encounter: idSchema }), execute(ctx, input) {
      const state = ctx.state<State>(); if (state.battle) ctx.fail('BATTLE_BUSY', '请先结束当前遭遇');
      const id = input.encounter as string, value = get(ctx, id); references(ctx, value);
      if (location(ctx) !== value.location) ctx.fail('WRONG_LOCATION', '请先前往遭遇地点'); if (!health(ctx).hp) ctx.fail('PLAYER_DEAD', '请先恢复生命');
      const startedAt = now(ctx, state); if ((own(state.cooldowns, id)?.readyAt ?? 0) > startedAt) ctx.fail('ENCOUNTER_COOLDOWN', '遭遇尚未恢复');
      state.battle = { encounter: id, name: value.name, location: value.location, enemyMaxHp: value.enemy.maxHp, enemyHp: value.enemy.maxHp, enemyAttack: value.enemy.attack, enemyDefense: value.enemy.defense, loot: value.loot, experience: value.experience, cooldownSeconds: value.cooldownSeconds, startedAt, phase: 'active' };
      ctx.write(json(state)); return status(state);
    } },
    attack: { schema: emptySchema, execute: ctx => strike(ctx, 0) },
    strike: { schema: objectSchema({ attackBonus: countSchema }), execute: (ctx, input) => strike(ctx, input.attackBonus as number) },
    claim: { schema: emptySchema, execute(ctx) {
      const state = ctx.state<State>(), battle = state.battle; if (!battle || battle.phase !== 'victory') return ctx.fail('NO_VICTORY', '没有待领取的胜利奖励');
      if (location(ctx) !== battle.location) ctx.fail('WRONG_LOCATION', '请返回遭遇地点领取奖励');
      for (const [item, amount] of Object.entries(battle.loot)) { const expected = safeCount(ctx, count(ctx, item) + amount, '奖励库存'); const result = quantity(ctx, ctx.call('inventory', 'add', { container: container(ctx), item, quantity: amount })); if (result !== expected) ctx.fail('INVALID_INVENTORY', '奖励库存返回数量不一致'); }
      if (battle.experience) { const expected = safeCount(ctx, progression(ctx).experience + battle.experience, '奖励经验'); const result = progression(ctx, ctx.call('progression', 'gain', { amount: battle.experience })); if (result.experience !== expected) ctx.fail('INVALID_PROGRESSION', '奖励经验返回数量不一致'); }
      put(state.wins, battle.encounter, safeCount(ctx, (own(state.wins, battle.encounter) ?? 0) + 1, '遭遇胜利次数')); finish(ctx, state, battle); return status(state);
    } },
    retreat: { schema: emptySchema, execute(ctx) { const state = ctx.state<State>(); if (!state.battle) return ctx.fail('NO_BATTLE', '没有可放弃的遭遇'); finish(ctx, state, state.battle); return status(state); } }
  },
  events: { 'location.moved': (ctx, event) => { if (event.source === ctx.provider('location') && ctx.state<State>().battle?.phase === 'active') ctx.fail('BATTLE_ACTIVE', '战斗中不能移动'); } },
  queries: {
    status: { schema: emptySchema, execute: ctx => status(ctx.state<State>()) },
    records: { schema: emptySchema, execute: ctx => ({ wins: ctx.state<State>().wins }) },
    describe: { schema: objectSchema({ encounter: idSchema }), execute: (ctx, input) => json(get(ctx, input.encounter as string)) },
    list: { schema: emptySchema, execute(ctx) { const state = ctx.state<State>(), time = now(ctx, state), place = location(ctx), hp = health(ctx).hp; return { encounters: catalog(ctx).map(value => { const remainingSeconds = Math.max(0, (own(state.cooldowns, value.id)?.readyAt ?? 0) - time); return { ...value, available: !state.battle && hp > 0 && place === value.location && remainingSeconds === 0, remainingSeconds }; }) }; } }
  }
};
