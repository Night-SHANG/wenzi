import type { ExecutionContext, JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';
import { readCompanion, type CompanionDefinition } from './companion-rules.ts';
import { isCount, isId, isObject } from './encounter-rules.ts';

export type PartyMember = CompanionDefinition & { hp: number; isLeader: boolean; recruited: boolean; active: boolean };
export type PartyStatus = { leader: string; capacity: number; active: string[]; members: PartyMember[] };
type StoredMember = CompanionDefinition & { hp: number };
interface State { members: Record<string, StoredMember>; active: string[] }
interface Config { leader: { id: string; name: string; speed: number }; capacity: number }
function config(ctx: ReadContext): Config { return ctx.config as unknown as Config; }

export function readPartyMember(ctx: ReadContext, value: unknown, expectedId?: string): PartyMember {
  if (!isObject(value) || !isId(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || !isCount(value.maxHp, true)
    || !isCount(value.hp) || value.hp > value.maxHp || !isCount(value.attack) || !isCount(value.defense) || !isCount(value.speed)
    || typeof value.isLeader !== 'boolean' || typeof value.recruited !== 'boolean' || typeof value.active !== 'boolean'
    || (value.isLeader && (!value.recruited || !value.active)) || (!value.isLeader && value.attack === 0)
    || (!value.recruited && (value.hp !== 0 || value.active)) || (value.active && !value.recruited)) return ctx.fail('INVALID_PARTY_MEMBER', '队伍返回了无效成员');
  return { id: value.id, name: value.name, maxHp: value.maxHp, hp: value.hp, attack: value.attack, defense: value.defense, speed: value.speed, isLeader: value.isLeader, recruited: value.recruited, active: value.active };
}
export function readPartyStatus(ctx: ReadContext): PartyStatus {
  const value = ctx.query('party', 'status');
  if (!isObject(value) || !isId(value.leader) || !isCount(value.capacity) || !Array.isArray(value.active)
    || !value.active.every(isId) || !Array.isArray(value.members)) return ctx.fail('INVALID_PARTY', '队伍没有返回有效状态');
  const active = value.active as string[], members = value.members.map(member => readPartyMember(ctx, member));
  if (active[0] !== value.leader || new Set(active).size !== active.length || active.length - 1 > value.capacity
    || new Set(members.map(member => member.id)).size !== members.length || members[0]?.id !== value.leader
    || members.filter(member => member.isLeader).length !== 1 || !members[0]?.isLeader
    || active.some(id => !members.some(member => member.id === id))
    || members.some(member => member.isLeader !== (member.id === value.leader) || member.active !== active.includes(member.id))) return ctx.fail('INVALID_PARTY', '队伍成员、领队或出战名单不一致');
  return { leader: value.leader, capacity: value.capacity, active: [...active], members };
}
function health(ctx: ReadContext, value: unknown): { hp: number; maxHp: number } {
  if (!isObject(value) || !isCount(value.hp) || !isCount(value.maxHp, true) || value.hp > value.maxHp) return ctx.fail('INVALID_VITALS', '领队生命提供者返回了无效生命');
  return { hp: value.hp, maxHp: value.maxHp };
}
function catalog(ctx: ReadContext): CompanionDefinition[] {
  const value = ctx.query('companion-rule', 'list');
  if (!isObject(value) || !Array.isArray(value.companions)) return ctx.fail('INVALID_COMPANION_RULE', '伙伴目录没有返回列表');
  const entries = value.companions.map(entry => readCompanion(ctx, entry));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) return ctx.fail('INVALID_COMPANION_RULE', '伙伴目录含重复ID');
  for (const entry of entries) {
    const got = readCompanion(ctx, ctx.query('companion-rule', 'get', { member: entry.id }), entry.id);
    if (Object.keys(entry).some(key => entry[key as keyof CompanionDefinition] !== got[key as keyof CompanionDefinition])) ctx.fail('INVALID_COMPANION_RULE', '伙伴目录查询与列表不一致');
  }
  return entries;
}
function sessionOwner(ctx: ReadContext): string | null {
  const value = ctx.query('battle-session', 'status');
  if (!isObject(value) || (value.owner !== null && !isId(value.owner))) return ctx.fail('INVALID_BATTLE_SESSION', '会话没有返回有效拥有者');
  return value.owner;
}
function requireIdle(ctx: ReadContext): void { if (sessionOwner(ctx) !== null) ctx.fail('BATTLE_SESSION_BUSY', '战斗结束并释放会话后才能更改队伍名单'); }
function status(ctx: ReadContext): PartyStatus {
  const cfg = config(ctx), state = ctx.state<State>(), entries = catalog(ctx);
  if (own(state.members, cfg.leader.id) || entries.some(entry => entry.id === cfg.leader.id)) return ctx.fail('PARTY_LEADER_COLLISION', '领队ID不能与伙伴相同');
  if (state.active.length > cfg.capacity || new Set(state.active).size !== state.active.length || state.active.some(id => !own(state.members, id))) return ctx.fail('INVALID_PARTY', '已存出战名单无效');
  const frozen = Object.entries(state.members).map(([id, entry]) => {
    const terms = readCompanion(ctx, entry, id);
    if (!isCount(entry.hp) || entry.hp > terms.maxHp) return ctx.fail('INVALID_PARTY_MEMBER', '已招募伙伴生命无效');
    return { ...terms, hp: entry.hp };
  });
  const hp = health(ctx, ctx.query('vitals', 'status'));
  const source = ctx.has('attributes') ? 'attributes' : 'progression', result = ctx.query(source, 'status');
  if (!isObject(result) || !isObject(result.values)) return ctx.fail('INVALID_PARTY_ATTRIBUTES', '领队属性提供者没有返回属性映射');
  const attack = own(result.values, 'attack'), defense = own(result.values, 'defense');
  if (!isCount(attack) || !isCount(defense)) return ctx.fail('INVALID_PARTY_ATTRIBUTES', '领队攻防必须为非负安全整数');
  const leader: PartyMember = { ...cfg.leader, ...hp, attack, defense, isLeader: true, recruited: true, active: true };
  const members: PartyMember[] = [leader], seen = new Set([cfg.leader.id]);
  for (const entry of [...entries, ...frozen]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const recruited = own(state.members, entry.id);
    members.push({ ...(recruited ?? entry), hp: recruited ? recruited.hp : 0, isLeader: false, recruited: !!recruited, active: state.active.includes(entry.id) });
  }
  return { leader: cfg.leader.id, capacity: cfg.capacity, active: [cfg.leader.id, ...state.active], members };
}
function findMember(ctx: ReadContext, id: string): PartyMember {
  const member = status(ctx).members.find(entry => entry.id === id);
  if (!member) return ctx.fail('UNKNOWN_PARTY_MEMBER', `未知队员：${id}`);
  return member;
}
function changeHealth(ctx: ExecutionContext, input: JsonObject, action: 'damage' | 'heal'): JsonObject {
  const id = input.member as string, amount = input.amount as number, before = findMember(ctx, id);
  if (!before.recruited) return ctx.fail('PARTY_MEMBER_NOT_RECRUITED', '只能修改已招募队员的生命');
  if (action === 'heal' && before.hp === before.maxHp) return ctx.fail('HP_FULL', '生命已满');
  const hp = action === 'heal' ? before.hp + Math.min(amount, before.maxHp - before.hp) : Math.max(0, before.hp - amount);
  if (before.isLeader) {
    const returned = health(ctx, ctx.call('vitals', action, { amount })), actual = health(ctx, ctx.query('vitals', 'status'));
    if (returned.hp !== hp || actual.hp !== hp || returned.maxHp !== before.maxHp || actual.maxHp !== before.maxHp) return ctx.fail('INVALID_VITALS', '领队生命变更返回值与实际生命不一致');
  } else {
    const state = ctx.state<State>(); state.members[id] = { ...state.members[id]!, hp }; ctx.write(state as unknown as JsonObject);
  }
  const after = findMember(ctx, id);
  if (after.hp !== hp || after.maxHp !== before.maxHp) return ctx.fail('INVALID_VITALS', '队员实际生命与变更不一致');
  return { id, hp: after.hp, maxHp: after.maxHp };
}
const storedMemberSchema = objectSchema({ id: idSchema, name: { type: 'string', minLength: 1 }, maxHp: positiveCountSchema, attack: positiveCountSchema, defense: countSchema, speed: countSchema, hp: countSchema });
export const partyModule: ModuleDefinition = {
  manifest: { id: 'party.roster', title: '持久伙伴队伍', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { party: '1.0.0' }, requires: { 'companion-rule': { version: '^1.0.0' }, vitals: { version: '^1.0.0' }, progression: { version: '^1.0.0' }, 'battle-session': { version: '^1.0.0' }, attributes: { version: '^1.0.0', optional: true } } },
  configSchema: objectSchema({ leader: objectSchema({ id: idSchema, name: { type: 'string', minLength: 1 }, speed: countSchema }), capacity: countSchema }),
  stateSchema: objectSchema({ members: recordSchema(storedMemberSchema), active: { type: 'array', uniqueItems: true, items: idSchema } }),
  initialState: () => ({ members: {}, active: [] }),
  validate(ctx) { status(ctx); sessionOwner(ctx); },
  commands: {
    recruit: { schema: objectSchema({ member: idSchema }), execute(ctx, input) {
      requireIdle(ctx); const id = input.member as string, member = findMember(ctx, id);
      if (member.recruited) return ctx.fail('PARTY_ALREADY_RECRUITED', '队员已经招募');
      const terms = readCompanion(ctx, ctx.query('companion-rule', 'get', { member: id }), id), state = ctx.state<State>();
      state.members[id] = { ...terms, hp: terms.maxHp }; ctx.write(state as unknown as JsonObject); return status(ctx);
    } },
    setActive: { schema: objectSchema({ members: { type: 'array', uniqueItems: true, items: idSchema } }), execute(ctx, input) {
      requireIdle(ctx); const current = status(ctx), members = input.members as string[];
      if (members.length > current.capacity) return ctx.fail('PARTY_CAPACITY', '出战伙伴超过容量');
      for (const id of members) if (!current.members.some(member => member.id === id && member.recruited && !member.isLeader)) ctx.fail('PARTY_MEMBER_NOT_RECRUITED', `未招募伙伴：${id}`);
      const state = ctx.state<State>(); state.active = [...members]; ctx.write(state as unknown as JsonObject); return status(ctx);
    } },
    damage: { schema: objectSchema({ member: idSchema, amount: positiveCountSchema }), execute: (ctx, input) => changeHealth(ctx, input, 'damage') },
    heal: { schema: objectSchema({ member: idSchema, amount: positiveCountSchema }), execute: (ctx, input) => changeHealth(ctx, input, 'heal') }
  },
  queries: { status: { schema: emptySchema, execute: status }, member: { schema: objectSchema({ member: idSchema }), execute: (ctx, input) => findMember(ctx, input.member as string) } }
};
