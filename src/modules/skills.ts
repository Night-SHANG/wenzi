import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, numberSchema, objectSchema, own, recordSchema, safeNumber } from './capacity.ts';
import { isCount, isId, isObject, isSeconds } from './encounter-rules.ts';
import { readSkill } from './skill-rules.ts';
import type { SkillDefinition } from './skill-rules.ts';
import { readSimulationTime } from './simulation-time.ts';

interface State { cooldowns: Record<string, { startedAt: number; readyAt: number }> }
function json(value: unknown): JsonValue { return value as JsonValue; }
function container(ctx: ReadContext): string { return ctx.config.container as string; }
function known(ctx: ReadContext): string[] { return ctx.config.known as string[]; }
function quantity(ctx: ReadContext, value: JsonValue): number { if (!isObject(value) || !isCount(value.quantity)) return ctx.fail('INVALID_INVENTORY', '库存没有返回有效数量'); return value.quantity; }
function count(ctx: ReadContext, item: string): number { return quantity(ctx, ctx.query('inventory', 'count', { container: container(ctx), item })); }
function time(ctx: ReadContext, state: State): number { let baseline = 0; for (const value of Object.values(state.cooldowns)) { if (value.readyAt < value.startedAt) ctx.fail('INVALID_COOLDOWN', '技能冷却结束早于开始'); baseline = Math.max(baseline, value.startedAt); } return readSimulationTime(ctx, baseline); }
function level(ctx: ReadContext): number { const value = ctx.query('progression', 'status'); if (!isObject(value) || !isCount(value.level, true)) return ctx.fail('INVALID_PROGRESSION', '成长没有返回有效等级'); return value.level; }
function tags(ctx: ReadContext): string[] {
  if (!ctx.has('equipment')) return [];
  const value = ctx.query('equipment', 'status');
  if (!isObject(value) || !Array.isArray(value.tags) || value.tags.some(tag => !isId(tag)) || new Set(value.tags).size !== value.tags.length) return ctx.fail('INVALID_EQUIPMENT', '装备没有返回有效标签');
  return value.tags as string[];
}
function battle(ctx: ReadContext, value = ctx.query('encounters', 'status')): JsonObject {
  if (!isObject(value)) return ctx.fail('INVALID_ENCOUNTERS', '遭遇没有返回有效战斗状态');
  if (value.phase === 'idle' && value.battle === null) return value;
  if (!['active', 'victory', 'defeat'].includes(value.phase as string) || !isObject(value.battle) || value.battle.phase !== value.phase
    || !isCount(value.battle.enemyHp) || !isCount(value.battle.enemyMaxHp, true) || value.battle.enemyHp > value.battle.enemyMaxHp
    || (value.phase === 'victory' ? value.battle.enemyHp !== 0 : value.battle.enemyHp === 0)) return ctx.fail('INVALID_ENCOUNTERS', '遭遇阶段与敌人生命不一致');
  return value;
}
type CombatSource = 'encounters' | 'combat-action';
interface ActionTarget { id: string; name: string; hp: number; maxHp: number }
interface ActionStatus { phase: string; canAct: boolean; targets: ActionTarget[] }
function combatSource(ctx: ReadContext): CombatSource {
  const configured = ctx.config.battleSource ?? 'auto';
  if (configured !== 'auto') {
    if (!ctx.has(configured as CombatSource)) return ctx.fail('MISSING_COMBAT', '所选战斗来源没有绑定');
    return configured as CombatSource;
  }
  if (ctx.has('encounters') && ctx.has('combat-action')) return ctx.fail('AMBIGUOUS_COMBAT', '存在两种战斗来源，请配置 battleSource');
  if (ctx.has('combat-action')) return 'combat-action';
  if (ctx.has('encounters')) return 'encounters';
  return ctx.fail('MISSING_COMBAT', '技能需要战斗行动或旧遭遇能力');
}
function actionStatus(ctx: ReadContext, value = ctx.query('combat-action', 'actionStatus')): ActionStatus {
  if (!isObject(value) || !['idle', 'active', 'victory', 'defeat'].includes(value.phase as string)
    || typeof value.canAct !== 'boolean' || !Array.isArray(value.targets)) return ctx.fail('INVALID_COMBAT_ACTION', '战斗行动没有返回有效阶段和目标');
  const ids = new Set<string>();
  const targets = value.targets.map(row => {
    if (!isObject(row) || !isId(row.id) || ids.has(row.id) || typeof row.name !== 'string' || !row.name.length
      || !isCount(row.hp, true) || !isCount(row.maxHp, true) || row.hp > row.maxHp) return ctx.fail('INVALID_COMBAT_ACTION', '战斗目标身份或生命无效');
    ids.add(row.id);
    return { id: row.id, name: row.name, hp: row.hp, maxHp: row.maxHp };
  });
  if ((value.canAct && value.phase !== 'active') || (value.phase === 'active' && !targets.length)
    || (['idle', 'victory'].includes(value.phase as string) && targets.length)) ctx.fail('INVALID_COMBAT_ACTION', '战斗行动阶段与可操作目标不一致');
  return { phase: value.phase as string, canAct: value.canAct, targets };
}
function combat(ctx: ReadContext): { source: CombatSource; value: JsonObject; phase: string; canAct: boolean; targets?: ActionTarget[] } {
  const source = combatSource(ctx);
  if (source === 'encounters') {
    const value = battle(ctx);
    return { source, value, phase: value.phase as string, canAct: value.phase === 'active' };
  }
  const value = actionStatus(ctx);
  return { source, value: json(value) as JsonObject, ...value };
}
function get(ctx: ReadContext, id: string): SkillDefinition { return readSkill(ctx, ctx.query('skill-rule', 'get', { skill: id }), id); }
function catalog(ctx: ReadContext): SkillDefinition[] {
  const result = ctx.query('skill-rule', 'list'); if (!isObject(result) || !Array.isArray(result.skills)) return ctx.fail('INVALID_SKILL_RULE', '技能规则没有返回目录');
  const ids = new Set<string>();
  return result.skills.map(entry => {
    const value = readSkill(ctx, entry); if (ids.has(value.id)) ctx.fail('INVALID_SKILL_RULE', '技能目录包含重复ID'); ids.add(value.id);
    const found = get(ctx, value.id);
    if (value.name !== found.name || value.minLevel !== found.minLevel || value.cooldownSeconds !== found.cooldownSeconds || value.attackBonus !== found.attackBonus || value.effect !== found.effect
      || value.requiredTags.length !== found.requiredTags.length || value.requiredTags.some(tag => !found.requiredTags.includes(tag))
      || Object.keys(value.costs).length !== Object.keys(found.costs).length || Object.entries(value.costs).some(([id, n]) => own(found.costs, id) !== n)) ctx.fail('INVALID_SKILL_RULE', '技能目录与详情不一致');
    return value;
  });
}
function references(ctx: ReadContext, skill: SkillDefinition): void {
  for (const item of Object.keys(skill.costs)) count(ctx, item);
  if (skill.requiredTags.length && !ctx.has('equipment')) ctx.fail('MISSING_EQUIPMENT', '此技能需要装备能力');
  if (skill.effect !== null) {
    if (!ctx.has('effects') || !ctx.has('effect-rule')) ctx.fail('MISSING_EFFECTS', '此技能需要效果能力与效果目录');
    const value = ctx.query('effect-rule', 'get', { effect: skill.effect });
    if (!isObject(value) || value.id !== skill.effect || typeof value.name !== 'string' || !value.name.length || !isSeconds(value.durationSeconds) || value.durationSeconds <= 0
      || !isObject(value.modifiers) || Object.entries(value.modifiers).some(([id, n]) => !isId(id) || typeof n !== 'number' || !Number.isSafeInteger(n))) ctx.fail('INVALID_EFFECT_RULE', '效果目录没有返回有效效果');
  }
}
function availability(ctx: ReadContext, skill: SkillDefinition, state: State, now: number, currentLevel: number, currentTags: string[], phase: string, canAct: boolean): JsonObject {
  const isKnown = known(ctx).includes(skill.id), remainingSeconds = Math.max(0, (own(state.cooldowns, skill.id)?.readyAt ?? 0) - now), reasons: string[] = [];
  if (!isKnown) reasons.push('尚未学会此技能');
  if (currentLevel < skill.minLevel) reasons.push(`需要等级${skill.minLevel}`);
  if (skill.requiredTags.some(tag => !currentTags.includes(tag))) reasons.push('缺少所需装备标签');
  if (Object.entries(skill.costs).some(([id, n]) => count(ctx, id) < n)) reasons.push('技能材料不足');
  if (remainingSeconds > 0) reasons.push('技能尚在冷却');
  if (phase !== 'active') reasons.push('需要进行中的战斗');
  else if (!canAct) reasons.push('尚未轮到领队行动');
  return { known: isKnown, available: reasons.length === 0, remainingSeconds, reasons };
}
export const skillsModule: ModuleDefinition = {
  manifest: { id: 'skills.combat', title: '战斗技能', version: '1.1.0', apiVersion: 1, stateVersion: 1, provides: { skills: '1.1.0' }, requires: {
    'skill-rule': { version: '^1.0.0' }, inventory: { version: '^1.0.0' }, progression: { version: '^1.0.0' }, encounters: { version: '^1.1.0', optional: true }, time: { version: '^1.0.0' },
    'combat-action': { version: '^1.0.0', optional: true },
    equipment: { version: '^1.0.0', optional: true }, effects: { version: '^1.0.0', optional: true }, 'effect-rule': { version: '^1.0.0', optional: true }
  } },
  configSchema: objectSchema({ container: idSchema, known: { type: 'array', items: idSchema, uniqueItems: true }, battleSource: { enum: ['auto', 'encounters', 'combat-action'] } }, ['container', 'known']),
  stateSchema: objectSchema({ cooldowns: recordSchema(objectSchema({ startedAt: numberSchema, readyAt: numberSchema })) }), initialState: () => ({ cooldowns: {} }),
  migrate(previous) {
    if (previous.moduleId !== 'skills.combat' || previous.version !== '1.0.0' || previous.stateVersion !== 1) throw new Error('不兼容的技能状态');
    return previous.state;
  },
  validate(ctx) {
    const inventory = ctx.query('inventory', 'list', { container: container(ctx) }); if (!isObject(inventory) || !Array.isArray(inventory.items) || !isObject(inventory.limits)) ctx.fail('INVALID_INVENTORY', '库存没有返回有效容器');
    time(ctx, ctx.state<State>()); level(ctx); tags(ctx); combat(ctx);
    for (const skill of catalog(ctx)) references(ctx, skill);
  },
  commands: { use: { schema: objectSchema({ skill: idSchema, target: idSchema }, ['skill']), execute(ctx, input) {
    const id = input.skill as string;
    if (!known(ctx).includes(id)) return ctx.fail('SKILL_UNKNOWN', '尚未学会此技能');
    const skill = get(ctx, id);
    references(ctx, skill);
    const state = ctx.state<State>(), startedAt = time(ctx, state), current = combat(ctx);
    const eligibility = availability(ctx, skill, state, startedAt, level(ctx), tags(ctx), current.phase, current.canAct);
    if (!eligibility.available) return ctx.fail('SKILL_UNAVAILABLE', (eligibility.reasons as string[]).join('；'));
    let target = input.target as string | undefined;
    if (current.source === 'combat-action') {
      if (target === undefined) {
        if (current.targets!.length !== 1) return ctx.fail('MISSING_TARGET', '多个目标时请明确指定技能目标');
        target = current.targets![0]!.id;
      }
      if (!current.targets!.some(row => row.id === target)) return ctx.fail('INVALID_TARGET', '技能目标不存在或已经倒下');
    } else if (target !== undefined && (!isObject(current.value.battle) || current.value.battle.encounter !== target)) {
      return ctx.fail('INVALID_TARGET', '技能目标与当前遭遇不一致');
    }
    for (const [item, amount] of Object.entries(skill.costs)) {
      const expected = count(ctx, item) - amount;
      const result = quantity(ctx, ctx.call('inventory', 'remove', { container: container(ctx), item, quantity: amount }));
      if (result !== expected || count(ctx, item) !== expected) ctx.fail('INVALID_INVENTORY', '技能支付后库存数量不一致');
    }
    if (skill.effect !== null) ctx.call('effects', 'apply', { effect: skill.effect });
    let result: JsonObject;
    if (current.source === 'combat-action') {
      const returned = actionStatus(ctx, ctx.call('combat-action', 'performStrike', { target: target!, attackBonus: skill.attackBonus }));
      if (returned.phase === 'idle' || JSON.stringify(returned) !== JSON.stringify(actionStatus(ctx))) ctx.fail('INVALID_COMBAT_ACTION', '出招返回与真实战斗状态不一致');
      result = json(returned) as JsonObject;
    } else {
      result = battle(ctx, ctx.call('encounters', 'strike', { attackBonus: skill.attackBonus }));
      if (result.phase === 'idle') ctx.fail('INVALID_ENCOUNTERS', '出招不能丢失战斗终局');
    }
    const readyAt = safeNumber(ctx, startedAt + skill.cooldownSeconds, '技能冷却结束时间');
    if (skill.cooldownSeconds > 0 && !(readyAt > startedAt)) ctx.fail('TIME_PRECISION', '技能冷却秒数过小');
    Object.defineProperty(state.cooldowns, id, { value: { startedAt, readyAt }, enumerable: true, writable: true, configurable: true });
    ctx.write(json(state));
    return { skill: id, readyAt, battle: result };
  } } },
  queries: { list: { schema: emptySchema, execute(ctx) {
    const state = ctx.state<State>(), now = time(ctx, state), currentLevel = level(ctx), currentTags = tags(ctx), current = combat(ctx);
    return { skills: catalog(ctx).map(skill => {
      references(ctx, skill);
      return { ...skill, ...availability(ctx, skill, state, now, currentLevel, currentTags, current.phase, current.canAct),
        ...(current.targets ? { targets: json(current.targets) } : {}) };
    }) };
  } } }
};
