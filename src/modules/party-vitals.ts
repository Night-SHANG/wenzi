import type { ExecutionContext, JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, positiveCountSchema } from './capacity.ts';
import { isCount, isObject } from './encounter-rules.ts';
import { readPartyMember, readPartyStatus, type PartyMember } from './party.ts';

interface State { member: string }
function selected(ctx: ReadContext, id = ctx.state<State>().member): PartyMember {
  const status = readPartyStatus(ctx), actual = readPartyMember(ctx, ctx.query('party', 'member', { member: id }), id);
  const listed = status.members.find(member => member.id === id);
  if (!listed || Object.keys(actual).some(key => actual[key as keyof PartyMember] !== listed[key as keyof PartyMember])) return ctx.fail('INVALID_PARTY', '队员查询与队伍列表不一致');
  if (!actual.recruited) return ctx.fail('PARTY_MEMBER_NOT_RECRUITED', '恢复对象必须已经招募');
  return actual;
}
function status(ctx: ReadContext): { hp: number; maxHp: number } { const member = selected(ctx); return { hp: member.hp, maxHp: member.maxHp }; }
function changeHealth(ctx: ExecutionContext, input: JsonObject, action: 'damage' | 'heal'): JsonObject {
  const before = selected(ctx), amount = input.amount as number;
  if (action === 'heal' && before.hp === before.maxHp) return ctx.fail('HP_FULL', '生命已满');
  const expected = action === 'heal' ? before.hp + Math.min(amount, before.maxHp - before.hp) : Math.max(0, before.hp - amount);
  const returned = ctx.call('party', action, { member: before.id, amount }), after = selected(ctx);
  if (!isObject(returned) || returned.id !== before.id || !isCount(returned.hp) || !isCount(returned.maxHp, true)
    || returned.hp !== expected || returned.maxHp !== before.maxHp || after.hp !== expected || after.maxHp !== before.maxHp) return ctx.fail('INVALID_VITALS', '队员生命变更返回值与实际生命不一致');
  return { hp: after.hp, maxHp: after.maxHp };
}
export const partyVitalsModule: ModuleDefinition = {
  manifest: { id: 'vitals.party-member', title: '选中队员生命适配', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { vitals: '1.0.0', 'vitals-selection': '1.0.0' }, requires: { party: { version: '^1.0.0' } } },
  configSchema: objectSchema({ initialMember: idSchema }), stateSchema: objectSchema({ member: idSchema }), initialState: config => ({ member: config.initialMember! }),
  validate(ctx) { selected(ctx); },
  commands: {
    select: { schema: objectSchema({ member: idSchema }), execute(ctx, input) { const member = selected(ctx, input.member as string); ctx.write({ member: member.id }); return { member: member.id, name: member.name }; } },
    damage: { schema: objectSchema({ amount: positiveCountSchema }), execute: (ctx, input) => changeHealth(ctx, input, 'damage') },
    heal: { schema: objectSchema({ amount: positiveCountSchema }), execute: (ctx, input) => changeHealth(ctx, input, 'heal') }
  },
  queries: {
    status: { schema: emptySchema, execute: status },
    selection: { schema: emptySchema, execute(ctx) { const member = selected(ctx); return { member: member.id, name: member.name }; } }
  }
};
