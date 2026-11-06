import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, objectSchema, safeCount, safeNumber } from './capacity.ts';
import { boundActionCommand } from '../presentation/actions.ts';

function object(ctx: ReadContext, value: JsonValue | undefined, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为对象`);
  return value;
}
function text(ctx: ReadContext, value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string') return ctx.fail('INVALID_VIEW_DATA', `${label}必须为文字`);
  return value;
}
function id(ctx: ReadContext, value: JsonValue | undefined): string {
  const result = text(ctx, value, 'ID');
  if (!result.length || [...result].length > 128) ctx.fail('INVALID_VIEW_DATA', 'ID长度无效');
  return result;
}
function boolean(ctx: ReadContext, value: JsonValue | undefined, label: string): boolean {
  if (typeof value !== 'boolean') return ctx.fail('INVALID_VIEW_DATA', `${label}必须为布尔值`);
  return value;
}
function positive(ctx: ReadContext, value: JsonValue | undefined, label: string): number {
  const result = safeCount(ctx, value as number, label);
  if (!result) ctx.fail('INVALID_VIEW_DATA', `${label}必须为正整数`);
  return result;
}
function rows(ctx: ReadContext, value: JsonValue, key: string): JsonObject[] {
  const array = object(ctx, value, key)[key];
  if (!Array.isArray(array)) return ctx.fail('INVALID_VIEW_DATA', `${key}必须为列表`);
  const ids = new Set<string>();
  return array.map(value => {
    const row = object(ctx, value, key), keyId = id(ctx, row.id);
    if (ids.has(keyId)) ctx.fail('INVALID_VIEW_DATA', `${key}包含重复ID`);
    ids.add(keyId); return row;
  });
}
function quantities(ctx: ReadContext, value: JsonValue | undefined, positiveOnly = false): string {
  return Object.entries(object(ctx, value, '数量')).map(([key, value]) => {
    id(ctx, key);
    const count = positiveOnly ? positive(ctx, value, '数量') : safeCount(ctx, value as number, '数量');
    return count ? `${key} × ${count}` : '';
  }).filter(Boolean).join('，') || '无';
}
function places(ctx: ReadContext, value: JsonValue | undefined): string {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', '地点必须为列表');
  return value.map(value => id(ctx, value)).join('、') || '任意地点';
}
const requirement = { version: '^1.0.0' };
const phaseNames: Record<string, string> = { active: '战斗中', victory: '已胜利，战利品待领取', defeat: '已落败，可回镇恢复后放弃本次遭遇' };
const questNames: Record<string, string> = { available: '已解锁', locked: '前置未完成', active: '进行中', ready: '可交付', completed: '已完成' };

/** Composes another text view through its public capability; owns no gameplay state. */
export const campaignViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.campaign.text', title: '小镇冒险文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' },
    requires: { 'text-view': requirement, progression: requirement, vitals: requirement, recovery: requirement, encounters: requirement, quests: requirement },
  },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 } }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: { render: { schema: emptySchema, execute(ctx) {
    const base = object(ctx, ctx.query('text-view', 'render'), '基础视图');
    text(ctx, base.title, '基础视图标题');
    if (!Array.isArray(base.lines)) return ctx.fail('INVALID_VIEW_DATA', '基础视图缺少文字行');
    const baseLines = base.lines.map(value => text(ctx, value, '基础视图行'));
    const progression = object(ctx, ctx.query('progression', 'status'), '成长');
    const experience = safeCount(ctx, progression.experience as number, '经验'), level = positive(ctx, progression.level, '等级');
    const values = object(ctx, progression.values, '属性');
    const attack = positive(ctx, values.attack, '攻击'), defense = safeCount(ctx, values.defense as number, '防御');
    let next = '已达当前最高等级';
    if (progression.nextExperience !== null) {
      const threshold = safeCount(ctx, progression.nextExperience as number, '下级经验');
      if (threshold <= experience) ctx.fail('INVALID_VIEW_DATA', '下级经验必须高于当前经验');
      next = `距下级还需 ${threshold - experience} 经验`;
    }
    const vitals = object(ctx, ctx.query('vitals', 'status'), '生命');
    const hp = safeCount(ctx, vitals.hp as number, '生命'), maxHp = positive(ctx, vitals.maxHp, '生命上限');
    if (hp > maxHp) ctx.fail('INVALID_VIEW_DATA', '当前生命超过上限');
    const lines = [`角色：等级 ${level}；经验 ${experience}；${next}`, `生命：${hp}/${maxHp}；攻击 ${attack}；防御 ${defense}`, ...baseLines];
    for (const remedy of rows(ctx, ctx.query('recovery', 'list'), 'remedies')) {
      lines.push(`恢复：${text(ctx, remedy.name, '恢复名称')}，消耗 ${id(ctx, remedy.item)} × 1，恢复 ${positive(ctx, remedy.healing, '恢复量')}；地点 ${places(ctx, remedy.locations)}；${boundActionCommand(ctx, 'recovery', 'use', { remedy: remedy.id! })}`);
    }
    const status = object(ctx, ctx.query('encounters', 'status'), '遭遇');
    const phase = text(ctx, status.phase, '战斗阶段');
    if (phase === 'idle') {
      if (status.battle !== null) ctx.fail('INVALID_VIEW_DATA', '空闲遭遇不能包含战斗');
      lines.push('遭遇：当前没有战斗。');
    } else {
      if (!Object.hasOwn(phaseNames, phase)) ctx.fail('INVALID_VIEW_DATA', '未知战斗阶段');
      const battle = object(ctx, status.battle, '战斗');
      if (battle.phase !== phase) ctx.fail('INVALID_VIEW_DATA', '战斗阶段不一致');
      const enemyHp = safeCount(ctx, battle.enemyHp as number, '敌人生命'), enemyMaxHp = positive(ctx, battle.enemyMaxHp, '敌人生命上限');
      if (enemyHp > enemyMaxHp) ctx.fail('INVALID_VIEW_DATA', '敌人生命超过上限');
      if ((phase === 'victory' ? enemyHp !== 0 : enemyHp === 0) || (phase === 'active' && hp === 0)) ctx.fail('INVALID_VIEW_DATA', '战斗阶段与生命不一致');
      lines.push(`遭遇：${text(ctx, battle.name, '敌人名称')}；${phaseNames[phase]}；敌人生命 ${enemyHp}/${enemyMaxHp}`);
      if (phase === 'active') lines.push(`攻击：${boundActionCommand(ctx, 'encounters', 'attack')}`);
      if (phase === 'victory') {
        lines.push(`战利品：${quantities(ctx, battle.loot, true)}；经验 ${safeCount(ctx, battle.experience as number, '战斗经验')}`);
        lines.push(`领取：${boundActionCommand(ctx, 'encounters', 'claim')}`);
      }
      lines.push(`放弃本次遭遇：${boundActionCommand(ctx, 'encounters', 'retreat')}`);
    }
    for (const encounter of rows(ctx, ctx.query('encounters', 'list'), 'encounters')) {
      const available = boolean(ctx, encounter.available, '遭遇可用状态');
      const remaining = safeNumber(ctx, encounter.remainingSeconds as number, '遭遇恢复秒数');
      lines.push(`探索目标：${text(ctx, encounter.name, '遭遇名称')}（${id(ctx, encounter.location)}）；${available ? '可以开始' : remaining ? `恢复还需 ${remaining} 秒` : '当前不可开始'}；${boundActionCommand(ctx, 'encounters', 'start', { encounter: encounter.id! })}`);
    }
    for (const quest of rows(ctx, ctx.query('quests', 'list'), 'quests')) {
      const state = text(ctx, quest.status, '任务状态'), ready = boolean(ctx, quest.ready, '任务交付状态');
      if (!Object.hasOwn(questNames, state) || ready !== (state === 'ready')) ctx.fail('INVALID_VIEW_DATA', '任务状态不一致');
      const completed = safeCount(ctx, quest.completed as number, '任务完成次数');
      lines.push(`任务：${text(ctx, quest.name, '任务名称')} · ${questNames[state]}（已交付 ${completed} 次）；地点 ${places(ctx, quest.locations)}`);
      lines.push(text(ctx, quest.description, '任务说明'));
      lines.push(`还需交付：${quantities(ctx, quest.remainingDelivery)}；还需完成遭遇：${quantities(ctx, quest.remainingVictories)}`);
      lines.push(`奖励：${quantities(ctx, quest.rewards, true)}；经验 ${safeCount(ctx, quest.experience as number, '任务经验')}`);
      if (state === 'available') lines.push(`接取：${boundActionCommand(ctx, 'quests', 'accept', { quest: quest.id! })}`);
      if (ready) lines.push(`交付：${boundActionCommand(ctx, 'quests', 'turnIn', { quest: quest.id! })}`);
      if (state === 'active' || ready) lines.push(`放弃任务：${boundActionCommand(ctx, 'quests', 'abandon', { quest: quest.id! })}`);
    }
    return { title: ctx.config.title!, lines };
  } } },
};
