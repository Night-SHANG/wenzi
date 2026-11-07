import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, objectSchema, own, safeCount, safeNumber } from './capacity.ts';
import { isId, isObject } from './encounter-rules.ts';
import { readPartyStatus } from './party.ts';
import { boundActionCommand } from '../presentation/actions.ts';

function object(ctx: ReadContext, value: unknown, label: string): JsonObject {
  if (!isObject(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为对象`);
  return value;
}
function text(ctx: ReadContext, value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.length)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为文字`);
  return value;
}
function id(ctx: ReadContext, value: unknown): string {
  if (!isId(value)) return ctx.fail('INVALID_VIEW_DATA', 'ID必须为1到128码点的文字');
  return value;
}
function flag(ctx: ReadContext, value: unknown): boolean {
  if (typeof value !== 'boolean') return ctx.fail('INVALID_VIEW_DATA', '可用状态必须为布尔值');
  return value;
}
function positive(ctx: ReadContext, value: unknown, label: string): number {
  const count = safeCount(ctx, value as number, label);
  if (!count) ctx.fail('INVALID_VIEW_DATA', `${label}必须为正整数`);
  return count;
}
function rows(ctx: ReadContext, value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为列表`);
  const seen = new Set<string>();
  return value.map(entry => {
    const row = object(ctx, entry, label), key = id(ctx, row.id);
    if (seen.has(key)) ctx.fail('INVALID_VIEW_DATA', `${label}不能包含重复ID`);
    seen.add(key); return row;
  });
}
function ids(ctx: ReadContext, value: unknown): string[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', '地点必须为列表');
  const result = value.map(entry => id(ctx, entry));
  if (new Set(result).size !== result.length) ctx.fail('INVALID_VIEW_DATA', '地点不能重复');
  return result;
}
function counts(ctx: ReadContext, value: unknown, positiveOnly = false): string {
  return Object.entries(object(ctx, value, '数量')).map(([key, quantity]) => {
    id(ctx, key);
    const amount = positiveOnly ? positive(ctx, quantity, '数量') : safeCount(ctx, quantity as number, '数量');
    return amount ? `${key} × ${amount}` : '';
  }).filter(Boolean).join('，') || '无';
}
const requirement = { version: '^1.0.0' };
const phases: Record<string, string> = { active: '战斗中', victory: '已胜利，待领取奖励', defeat: '全队倒下；恢复后仍需结束本次遭遇' };
const questPhases: Record<string, string> = { available: '可接取', locked: '前置未完成', active: '进行中', ready: '可交付', completed: '已完成' };

/** Text composition only; every health, turn and reward value comes from a public provider. */
export const partyViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.party.text', title: '队伍冒险文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' }, requires: {
      'text-view': requirement, party: requirement, 'party-battle': requirement, progression: requirement,
      quests: requirement, recovery: requirement, 'vitals-selection': requirement,
      'battle-session': { ...requirement, optional: true },
    },
  },
  configSchema: objectSchema({ title: { type: 'string', minLength: 1 } }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: { render: { schema: emptySchema, execute(ctx) {
    const base = object(ctx, ctx.query('text-view', 'render'), '基础视图'); text(ctx, base.title, '基础标题');
    if (!Array.isArray(base.lines) || base.lines.some(line => typeof line !== 'string')) return ctx.fail('INVALID_VIEW_DATA', '基础视图缺少文字行');
    const lines = [...base.lines as string[]], party = readPartyStatus(ctx);
    const growth = object(ctx, ctx.query('progression', 'status'), '成长');
    lines.push(`领队成长：等级 ${positive(ctx, growth.level, '等级')}；经验 ${safeCount(ctx, growth.experience as number, '经验')}`);
    const status = object(ctx, ctx.query('party-battle', 'status'), '队伍战斗');
    const phase = text(ctx, status.phase, '战斗阶段');
    if (phase !== 'idle' && !own(phases, phase)) ctx.fail('INVALID_VIEW_DATA', '未知战斗阶段');
    let busy = phase !== 'idle';
    if (ctx.has('battle-session')) {
      const session = object(ctx, ctx.query('battle-session', 'status'), '会话');
      if (session.owner !== null) id(ctx, session.owner);
      busy = session.owner !== null;
    }
    const selected = party.active.filter(member => member !== party.leader);
    lines.push(`队伍：出战伙伴 ${selected.length}/${party.capacity}${busy ? '；当前会话结束后可调整名单' : ''}`);
    for (const member of party.members) {
      const position = member.isLeader ? '领队' : !member.recruited ? '尚未招募' : member.active ? '出战' : '后备';
      lines.push(`${member.name}（${member.id}）· ${position}；生命 ${member.hp}/${member.maxHp}；攻击 ${member.attack}；防御 ${member.defense}；速度 ${member.speed}${member.recruited && !member.hp ? '；已倒下' : ''}`);
      if (busy || member.isLeader) continue;
      if (!member.recruited) lines.push(`招募：${boundActionCommand(ctx, 'party', 'recruit', { member: member.id })}`);
      else if (member.active) lines.push(`转为后备：${boundActionCommand(ctx, 'party', 'setActive', { members: selected.filter(id => id !== member.id) })}`);
      else if (selected.length < party.capacity) lines.push(`加入出战：${boundActionCommand(ctx, 'party', 'setActive', { members: [...selected, member.id] })}`);
    }
    const selection = object(ctx, ctx.query('vitals-selection', 'selection'), '恢复对象');
    const selectedId = id(ctx, selection.member), patient = party.members.find(member => member.id === selectedId && member.recruited);
    if (!patient || text(ctx, selection.name, '恢复对象名称') !== patient.name) return ctx.fail('INVALID_VIEW_DATA', '恢复对象必须是已招募队员');
    lines.push(`恢复对象：${patient.name}；生命 ${patient.hp}/${patient.maxHp}`);
    for (const member of party.members.filter(member => member.recruited && member.hp < member.maxHp && member.id !== selectedId)) {
      lines.push(`选择${member.name}接受恢复：${boundActionCommand(ctx, 'vitals-selection', 'select', { member: member.id })}`);
    }
    const remedies = object(ctx, ctx.query('recovery', 'list'), '恢复用品');
    for (const remedy of rows(ctx, remedies.remedies, '恢复用品')) {
      const places = ids(ctx, remedy.locations).join('、') || '任意地点';
      lines.push(`恢复：${text(ctx, remedy.name, '恢复名称')}；消耗 ${id(ctx, remedy.item)} × 1；恢复 ${positive(ctx, remedy.healing, '恢复量')}；地点 ${places}`);
      if (patient.hp < patient.maxHp) lines.push(`为${patient.name}使用：${boundActionCommand(ctx, 'recovery', 'use', { remedy: remedy.id! })}`);
    }
    if (phase === 'idle') {
      if (status.battle !== null || status.current !== null) ctx.fail('INVALID_VIEW_DATA', '空闲阶段不能含战斗或行动者');
      lines.push('队伍遭遇：当前没有战斗。');
    } else {
      const battle = object(ctx, status.battle, '战斗');
      if (battle.phase !== phase) ctx.fail('INVALID_VIEW_DATA', '战斗阶段不一致');
      const enemies = rows(ctx, battle.enemies, '敌人');
      if (!enemies.length) ctx.fail('INVALID_VIEW_DATA', '战斗至少需要一个敌人');
      const alive = enemies.filter(enemy => {
        const hp = safeCount(ctx, enemy.hp as number, '敌人生命'), maxHp = positive(ctx, enemy.maxHp, '敌人生命上限');
        if (hp > maxHp) ctx.fail('INVALID_VIEW_DATA', '敌人生命超过上限');
        lines.push(`敌人：${text(ctx, enemy.name, '敌人名称')}（${enemy.id}）；生命 ${hp}/${maxHp}${hp ? '' : '；已倒下'}`);
        return hp > 0;
      });
      if ((phase === 'victory' && alive.length) || (phase !== 'victory' && !alive.length)) ctx.fail('INVALID_VIEW_DATA', '敌人生命与胜负不一致');
      lines.push(`遭遇：${text(ctx, battle.name, '遭遇名称')}；第 ${positive(ctx, battle.round, '回合')} 回合；${own(phases, phase)!}`);
      if (phase === 'active') {
        const current = object(ctx, status.current, '当前行动者'), actorId = id(ctx, current.id);
        const actor = party.members.find(member => member.id === actorId && member.active && member.hp > 0);
        if (current.side !== 'party' || !actor) ctx.fail('INVALID_VIEW_DATA', '当前必须轮到存活出战队员');
        lines.push(`轮到：${actor!.name}。一次行动后会自动推进敌方行动与倒下单位。`);
        for (const enemy of alive) lines.push(`攻击${enemy.name}：${boundActionCommand(ctx, 'party-battle', 'attack', { actor: actorId, target: enemy.id! })}`);
      } else if (status.current !== null) ctx.fail('INVALID_VIEW_DATA', '终局不能有当前行动者');
      if (phase === 'victory') {
        lines.push(`战利品：${counts(ctx, battle.loot, true)}；经验 ${safeCount(ctx, battle.experience as number, '奖励经验')}`);
        lines.push(`领取：${boundActionCommand(ctx, 'party-battle', 'claim')}`);
      }
      lines.push(`结束本次遭遇并放弃未领奖励：${boundActionCommand(ctx, 'party-battle', 'retreat')}`);
    }
    const encounters = object(ctx, ctx.query('party-battle', 'list'), '遭遇目录');
    for (const encounter of rows(ctx, encounters.encounters, '遭遇目录')) {
      const available = flag(ctx, encounter.available), remaining = safeNumber(ctx, encounter.remainingSeconds as number, '遭遇恢复秒数');
      if (available && remaining > 0) ctx.fail('INVALID_VIEW_DATA', '冷却未结束的遭遇不可开始');
      lines.push(`探索目标：${text(ctx, encounter.name, '遭遇名称')}（${id(ctx, encounter.location)}）；${available ? '可开始' : remaining ? `恢复还需 ${remaining} 秒` : '当前不可开始'}；${boundActionCommand(ctx, 'party-battle', 'start', { encounter: encounter.id! })}`);
    }
    const journal = object(ctx, ctx.query('quests', 'list'), '任务');
    for (const quest of rows(ctx, journal.quests, '任务')) {
      const state = text(ctx, quest.status, '任务状态'), label = own(questPhases, state), ready = flag(ctx, quest.ready);
      if (!label || ready !== (state === 'ready')) ctx.fail('INVALID_VIEW_DATA', '任务状态与可交付标记不一致');
      lines.push(`任务：${text(ctx, quest.name, '任务名称')} · ${label}；已交付 ${safeCount(ctx, quest.completed as number, '交付次数')} 次；地点 ${ids(ctx, quest.locations).join('、') || '任意地点'}`);
      lines.push(text(ctx, quest.description, '任务说明', true));
      lines.push(`还需交付：${counts(ctx, quest.remainingDelivery)}；还需遭遇胜场：${counts(ctx, quest.remainingVictories)}`);
      lines.push(`任务奖励：${counts(ctx, quest.rewards, true)}；经验 ${safeCount(ctx, quest.experience as number, '任务经验')}`);
      if (state === 'available') lines.push(`接取：${boundActionCommand(ctx, 'quests', 'accept', { quest: quest.id! })}`);
      if (ready) lines.push(`交付：${boundActionCommand(ctx, 'quests', 'turnIn', { quest: quest.id! })}`);
      if (state === 'active' || ready) lines.push(`放弃任务：${boundActionCommand(ctx, 'quests', 'abandon', { quest: quest.id! })}`);
    }
    return { title: ctx.config.title!, lines } as JsonValue;
  } } },
};
