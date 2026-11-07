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
function availability(ctx: ReadContext, skill: SkillDefinition, state: State, now: number, currentLevel: number, currentTags: string[], phase: JsonValue): JsonObject {
  const isKnown = known(ctx).includes(skill.id), remainingSeconds = Math.max(0, (own(state.cooldowns, skill.id)?.readyAt ?? 0) - now), reasons: string[] = [];
  if (!isKnown) reasons.push('尚未学会此技能');
  if (currentLevel < skill.minLevel) reasons.push(`需要等级${skill.minLevel}`);
  if (skill.requiredTags.some(tag => !currentTags.includes(tag))) reasons.push('缺少所需装备标签');
  if (Object.entries(skill.costs).some(([id, n]) => count(ctx, id) < n)) reasons.push('技能材料不足');
  if (remainingSeconds > 0) reasons.push('技能尚在冷却');
  if (phase !== 'active') reasons.push('需要进行中的战斗');
  return { known: isKnown, available: reasons.length === 0, remainingSeconds, reasons };
}
export const skillsModule: ModuleDefinition = {
  manifest: { id: 'skills.combat', title: '战斗技能', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { skills: '1.0.0' }, requires: {
    'skill-rule': { version: '^1.0.0' }, inventory: { version: '^1.0.0' }, progression: { version: '^1.0.0' }, encounters: { version: '^1.1.0' }, time: { version: '^1.0.0' },
    equipment: { version: '^1.0.0', optional: true }, effects: { version: '^1.0.0', optional: true }, 'effect-rule': { version: '^1.0.0', optional: true }
  } },
  configSchema: objectSchema({ container: idSchema, known: { type: 'array', items: idSchema, uniqueItems: true } }),
  stateSchema: objectSchema({ cooldowns: recordSchema(objectSchema({ startedAt: numberSchema, readyAt: numberSchema })) }), initialState: () => ({ cooldowns: {} }),
  validate(ctx) {
    const inventory = ctx.query('inventory', 'list', { container: container(ctx) }); if (!isObject(inventory) || !Array.isArray(inventory.items) || !isObject(inventory.limits)) ctx.fail('INVALID_INVENTORY', '库存没有返回有效容器');
    time(ctx, ctx.state<State>()); level(ctx); tags(ctx); battle(ctx);
    for (const skill of catalog(ctx)) references(ctx, skill);
  },
  commands: { use: { schema: objectSchema({ skill: idSchema }), execute(ctx, input) {
    const id = input.skill as string;
    if (!known(ctx).includes(id)) return ctx.fail('SKILL_UNKNOWN', '尚未学会此技能');
    const skill = get(ctx, id); references(ctx, skill);
    const state = ctx.state<State>(), startedAt = time(ctx, state), eligibility = availability(ctx, skill, state, startedAt, level(ctx), tags(ctx), battle(ctx).phase!);
    if (!eligibility.available) return ctx.fail('SKILL_UNAVAILABLE', (eligibility.reasons as string[]).join('；'));
    for (const [item, amount] of Object.entries(skill.costs)) { const expected = count(ctx, item) - amount, result = quantity(ctx, ctx.call('inventory', 'remove', { container: container(ctx), item, quantity: amount })); if (result !== expected) ctx.fail('INVALID_INVENTORY', '技能支付后库存数量不一致'); }
    if (skill.effect !== null) ctx.call('effects', 'apply', { effect: skill.effect });
    const result = battle(ctx, ctx.call('encounters', 'strike', { attackBonus: skill.attackBonus }));
    if (result.phase === 'idle') ctx.fail('INVALID_ENCOUNTERS', '出招不能丢失战斗终局');
    const readyAt = safeNumber(ctx, startedAt + skill.cooldownSeconds, '技能冷却结束时间');
    if (skill.cooldownSeconds > 0 && !(readyAt > startedAt)) ctx.fail('TIME_PRECISION', '技能冷却秒数过小');
    Object.defineProperty(state.cooldowns, id, { value: { startedAt, readyAt }, enumerable: true, writable: true, configurable: true }); ctx.write(json(state));
    return { skill: id, readyAt, battle: result };
  } } },
  queries: { list: { schema: emptySchema, execute(ctx) {
    const state = ctx.state<State>(), now = time(ctx, state), currentLevel = level(ctx), currentTags = tags(ctx), phase = battle(ctx).phase!;
    return { skills: catalog(ctx).map(skill => { references(ctx, skill); return { ...skill, ...availability(ctx, skill, state, now, currentLevel, currentTags, phase) }; }) };
  } } }
};
