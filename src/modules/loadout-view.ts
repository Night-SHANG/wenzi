import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, objectSchema, own, safeCount, safeNumber } from './capacity.ts';
import { boundActionCommand } from '../presentation/actions.ts';

function object(ctx: ReadContext, value: JsonValue | undefined, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为对象`);
  return value;
}
function text(ctx: ReadContext, value: JsonValue | undefined, label: string): string {
  if (typeof value !== 'string' || !value.length) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为非空文字`);
  return value;
}
function id(ctx: ReadContext, value: JsonValue | undefined): string {
  const result = text(ctx, value, 'ID');
  if ([...result].length > 128) ctx.fail('INVALID_VIEW_DATA', 'ID长度无效');
  return result;
}
function flag(ctx: ReadContext, value: JsonValue | undefined): boolean {
  if (typeof value !== 'boolean') return ctx.fail('INVALID_VIEW_DATA', '可用状态必须为布尔值');
  return value;
}
function strings(ctx: ReadContext, value: JsonValue | undefined, label: string, identifiers = false): string[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为列表`);
  const result = value.map(value => identifiers ? id(ctx, value) : text(ctx, value, label));
  if (identifiers && new Set(result).size !== result.length) ctx.fail('INVALID_VIEW_DATA', `${label}包含重复ID`);
  return result;
}
function rows(ctx: ReadContext, value: JsonValue | undefined, label: string, key = 'id'): JsonObject[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为列表`);
  const seen = new Set<string>();
  return value.map(value => {
    const row = object(ctx, value, label), identity = id(ctx, row[key]);
    if (seen.has(identity)) ctx.fail('INVALID_VIEW_DATA', `${label}包含重复ID`);
    seen.add(identity); return row;
  });
}
function amounts(ctx: ReadContext, value: JsonValue | undefined, signed = false): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, n] of Object.entries(object(ctx, value, '属性或数量'))) {
    id(ctx, key);
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || (!signed && n < 0)) ctx.fail('INVALID_VIEW_DATA', '属性或数量必须为安全整数');
    Object.defineProperty(result, key, { value: n, enumerable: true });
  }
  return result;
}
function plus(value: number): string { return value < 0 ? String(value) : `+${value}`; }
const labels: Record<string, string> = { attack: '攻击', defense: '防御', maxHp: '生命上限' };
const requirement = { version: '^1.0.0' };

/** Presentation only: providers retain equipment, effect, attribute and skill authority. */
export const loadoutViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.loadout.text', title: '装备与技艺文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' },
    requires: { 'text-view': requirement, equipment: requirement, effects: requirement, attributes: requirement, skills: requirement },
  },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 } }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: { render: { schema: emptySchema, execute(ctx) {
    const baseView = object(ctx, ctx.query('text-view', 'render'), '基础视图');
    text(ctx, baseView.title, '基础视图标题');
    if (!Array.isArray(baseView.lines) || baseView.lines.some(line => typeof line !== 'string')) return ctx.fail('INVALID_VIEW_DATA', '基础视图缺少文字行');
    const lines = [...baseView.lines as string[]];
    const attributes = object(ctx, ctx.query('attributes', 'status'), '属性');
    const base = amounts(ctx, attributes.base), gear = amounts(ctx, attributes.equipment, true);
    const modifiers = amounts(ctx, attributes.effects, true), values = amounts(ctx, attributes.values);
    for (const [key, value] of Object.entries(values)) {
      lines.push(`${own(labels, key) ?? key} ${value}：基础 ${own(base, key) ?? 0}；装备 ${plus(own(gear, key) ?? 0)}；效果 ${plus(own(modifiers, key) ?? 0)}`);
    }
    const equipment = object(ctx, ctx.query('equipment', 'status'), '装备');
    for (const row of rows(ctx, equipment.slots, '装备槽', 'slot')) {
      const slot = id(ctx, row.slot);
      if (row.item === null) { lines.push(`装备：${slot} · 空槽`); continue; }
      const item = object(ctx, row.item, '已装备物品');
      id(ctx, item.id);
      if (id(ctx, item.slot) !== slot) ctx.fail('INVALID_VIEW_DATA', '装备与槽位不一致');
      lines.push(`装备：${slot} · ${text(ctx, item.name, '装备名称')}；卸下：${boundActionCommand(ctx, 'equipment', 'unequip', { slot })}`);
    }
    const candidates = object(ctx, ctx.query('equipment', 'list'), '可选装备');
    for (const item of rows(ctx, candidates.items, '可选装备')) {
      const quantity = safeCount(ctx, item.quantity as number, '背包数量'), available = flag(ctx, item.equippable), slot = id(ctx, item.slot);
      if (available && !quantity) ctx.fail('INVALID_VIEW_DATA', '没有物品却可以装备');
      if (quantity) lines.push(`背包装备：${text(ctx, item.name, '装备名称')} × ${quantity}（${slot}）${available ? `；装备：${boundActionCommand(ctx, 'equipment', 'equip', { item: item.id!, slot })}` : '；当前不可装备'}`);
    }
    const effects = object(ctx, ctx.query('effects', 'status'), '效果');
    const now = safeNumber(ctx, effects.now as number, '模拟秒数'), active = rows(ctx, effects.effects, '活动效果');
    if (!active.length) lines.push('状态效果：无');
    for (const effect of active) {
      const startedAt = safeNumber(ctx, effect.startedAt as number, '效果开始时间');
      const expiresAt = safeNumber(ctx, effect.expiresAt as number, '效果到期时间');
      const remaining = safeNumber(ctx, effect.remainingSeconds as number, '效果剩余秒数');
      if (startedAt > now || expiresAt <= now || remaining !== expiresAt - now) ctx.fail('INVALID_VIEW_DATA', '效果时间不一致');
      const contribution = Object.entries(amounts(ctx, effect.modifiers, true)).map(([key, value]) => `${own(labels, key) ?? key} ${plus(value)}`).join('，') || '无属性修改';
      lines.push(`状态效果：${text(ctx, effect.name, '效果名称')}；${contribution}；剩余 ${remaining} 秒`);
    }
    const skills = object(ctx, ctx.query('skills', 'list'), '技能');
    for (const skill of rows(ctx, skills.skills, '技能')) {
      const known = flag(ctx, skill.known), available = flag(ctx, skill.available);
      const reasons = strings(ctx, skill.reasons, '技能条件'), tags = strings(ctx, skill.requiredTags, '装备标签', true);
      const remaining = safeNumber(ctx, skill.remainingSeconds as number, '技能冷却秒数');
      const level = safeCount(ctx, skill.minLevel as number, '技能等级'), bonus = safeCount(ctx, skill.attackBonus as number, '技能攻击加成');
      if (!level || (available && (!known || remaining > 0 || reasons.length)) || (!available && !reasons.length)) ctx.fail('INVALID_VIEW_DATA', '技能可用状态与条件不一致');
      const costs = amounts(ctx, skill.costs);
      if (Object.values(costs).some(value => !value)) ctx.fail('INVALID_VIEW_DATA', '技能消耗必须为正整数');
      const cost = Object.entries(costs).map(([item, quantity]) => `${item} × ${quantity}`).join('，') || '无';
      const cooldown = safeNumber(ctx, skill.cooldownSeconds as number, '技能冷却');
      const effect = skill.effect === null ? '无' : id(ctx, skill.effect);
      lines.push(`技能：${text(ctx, skill.name, '技能名称')}；等级 ${level}；装备标签 ${tags.join('、') || '无'}；消耗 ${cost}；攻击 +${bonus}；状态 ${effect}；冷却 ${cooldown} 秒（剩余 ${remaining} 秒）`);
      lines.push(`${available ? '可以施展' : reasons.join('；')}；${boundActionCommand(ctx, 'skills', 'use', { skill: skill.id! })}`);
    }
    lines.push('时间规则：技能与普通攻击不自动推进时间；通过基础视图的时钟操作推进模拟秒，冷却和效果随之变化。');
    return { title: ctx.config.title!, lines };
  } } },
};
