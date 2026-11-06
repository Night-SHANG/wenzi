import type { JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, MAX_NUMBER, numberSchema, objectSchema, own, recordSchema, safeCount, safeNumber } from './capacity.ts';
import { readSimulationTime } from './simulation-time.ts';

interface Site { location: string; rule: string }
interface Config { container: string; sites: Record<string, Site> }
interface Cooldown { gatheredAt: number; readyAt: number }
interface State { cooldowns: Record<string, Cooldown> }
interface Rule { id: string; name: string; item: string; quantity: number; cooldownSeconds: number }
function site(ctx: ReadContext, id: string): Site {
  const result = own((ctx.config as unknown as Config).sites, id);
  if (!result) return ctx.fail('UNKNOWN_GATHER_SITE', `未知采集点：${id}`);
  return result;
}
function rule(ctx: ReadContext, id: string): Rule {
  const result = ctx.query('gather-rule', 'get', { rule: id });
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || result.id !== id || typeof result.name !== 'string' || !result.name.length
    || typeof result.item !== 'string' || !result.item.length || result.item.length > 128
    || typeof result.quantity !== 'number' || !Number.isSafeInteger(result.quantity) || result.quantity <= 0
    || typeof result.cooldownSeconds !== 'number' || !Number.isFinite(result.cooldownSeconds)
    || result.cooldownSeconds <= 0 || result.cooldownSeconds > MAX_NUMBER) {
    return ctx.fail('INVALID_GATHER_RULE', `采集规则返回了无效内容：${id}`);
  }
  safeCount(ctx, result.quantity, '采集数量'); safeNumber(ctx, result.cooldownSeconds, '采集冷却秒数');
  return result as unknown as Rule;
}
function clock(ctx: ReadContext, state: State): number {
  let notBefore = 0;
  for (const cooldown of Object.values(state.cooldowns)) notBefore = Math.max(notBefore, cooldown.gatheredAt);
  return readSimulationTime(ctx, notBefore);
}
function currentLocation(ctx: ReadContext): string {
  const result = ctx.query('location', 'current');
  if (typeof result !== 'object' || result === null || Array.isArray(result) || typeof result.id !== 'string' || !result.id.length) return ctx.fail('INVALID_LOCATION', '地点能力没有返回有效的当前位置');
  return result.id;
}
function checkLocation(ctx: ReadContext, id: string): void {
  const result = ctx.query('location', 'describe', { location: id });
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || result.id !== id || typeof result.name !== 'string' || !result.name.length
    || typeof result.description !== 'string' || !Array.isArray(result.exits)
    || result.exits.some(exit => typeof exit !== 'string' || !exit.length || exit.length > 128)
    || new Set(result.exits).size !== result.exits.length) {
    ctx.fail('INVALID_LOCATION', `地点能力没有返回有效的地点描述：${id}`);
  }
}
function checkContainer(ctx: ReadContext, container: string): void {
  const result = ctx.query('inventory', 'list', { container });
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || !Array.isArray(result.items) || typeof result.limits !== 'object'
    || result.limits === null || Array.isArray(result.limits)) {
    ctx.fail('INVALID_INVENTORY', `库存能力没有返回有效的容器信息：${container}`);
  }
}
function checkItem(ctx: ReadContext, item: string): void {
  const result = ctx.query('inventory', 'count', { container: (ctx.config as unknown as Config).container, item });
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || typeof result.quantity !== 'number' || !Number.isSafeInteger(result.quantity) || result.quantity < 0) {
    ctx.fail('INVALID_INVENTORY', `库存能力没有返回有效的物品数量：${item}`);
  }
}
export const gatheringModule: ModuleDefinition = {
  manifest: { id: 'gathering.cooldown', title: '可再生采集', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { gathering: '1.0.0' }, requires: { location: { version: '^1.0.0' }, 'gather-rule': { version: '^1.0.0' }, inventory: { version: '^1.0.0' }, time: { version: '^1.0.0' } } },
  configSchema: objectSchema({ container: idSchema, sites: recordSchema(objectSchema({ location: idSchema, rule: idSchema })) }),
  stateSchema: objectSchema({ cooldowns: recordSchema(objectSchema({ gatheredAt: numberSchema, readyAt: numberSchema })) }),
  initialState: () => ({ cooldowns: {} }),
  validate(ctx) {
    const config = ctx.config as unknown as Config, state = ctx.state<State>();
    checkContainer(ctx, config.container);
    for (const value of Object.values(config.sites)) {
      checkLocation(ctx, value.location);
      checkItem(ctx, rule(ctx, value.rule).item);
    }
    for (const [id, cooldown] of Object.entries(state.cooldowns)) {
      site(ctx, id);
      if (!(cooldown.readyAt > cooldown.gatheredAt)) ctx.fail('INVALID_COOLDOWN', `采集冷却结束时间必须晚于开始时间：${id}`);
    }
    clock(ctx, state);
  },
  commands: { gather: { schema: objectSchema({ site: idSchema }), execute(ctx, input) {
    const id = input.site as string, value = site(ctx, id), state = ctx.state<State>();
    if (currentLocation(ctx) !== value.location) ctx.fail('WRONG_LOCATION', '请先前往采集点所在的地点');
    const now = clock(ctx, state), previous = own(state.cooldowns, id);
    if (previous && now < previous.readyAt) ctx.fail('GATHER_COOLDOWN', '采集点尚未恢复');
    const policy = rule(ctx, value.rule); checkItem(ctx, policy.item);
    const readyAt = safeNumber(ctx, now + policy.cooldownSeconds, '采集冷却结束秒数');
    if (!(readyAt > now)) ctx.fail('TIME_PRECISION', '冷却秒数过小，结束时间无法表示');
    ctx.call('inventory', 'add', { container: (ctx.config as unknown as Config).container, item: policy.item, quantity: policy.quantity });
    Object.defineProperty(state.cooldowns, id, { value: { gatheredAt: now, readyAt }, enumerable: true, writable: true, configurable: true });
    ctx.write(state as unknown as JsonValue);
    const result = { site: id, item: policy.item, quantity: policy.quantity, readyAt };
    ctx.emit('gathering.gathered', result); return result;
  } } },
  queries: { sites: { schema: emptySchema, execute(ctx) {
    const state = ctx.state<State>(), now = clock(ctx, state), location = currentLocation(ctx);
    return { sites: Object.entries((ctx.config as unknown as Config).sites).map(([id, value]) => {
      const policy = rule(ctx, value.rule), readyAt = own(state.cooldowns, id)?.readyAt ?? 0;
      return { id, location: value.location, name: policy.name, item: policy.item, quantity: policy.quantity, cooldownSeconds: policy.cooldownSeconds, readyAt, remainingSeconds: Math.max(0, readyAt - now), available: location === value.location && now >= readyAt };
    }) };
  } } }
};
