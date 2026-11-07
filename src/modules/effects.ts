import type { ExecutionContext, JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, MAX_NUMBER, numberSchema, objectSchema, own, recordSchema } from './capacity.ts';
import { readSimulationTime } from './simulation-time.ts';

interface Rule { id: string; name: string; durationSeconds: number; modifiers: Record<string, number> }
interface ActiveEffect { id: string; name: string; modifiers: Record<string, number>; startedAt: number; expiresAt: number }
interface State { observedAt: number; active: Record<string, ActiveEffect> }
const modifiersSchema = recordSchema({ type: 'integer', minimum: -MAX_NUMBER, maximum: MAX_NUMBER });
const frozenSchema = objectSchema({ id: idSchema, name: { type: 'string', minLength: 1 }, modifiers: modifiersSchema, startedAt: numberSchema, expiresAt: numberSchema });
function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && [...value].length <= 128; }
function seconds(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER; }
function modifiers(ctx: ReadContext, value: unknown): Record<string, number> {
  if (!object(value)) return ctx.fail('INVALID_EFFECT', '效果属性必须是带符号安全整数映射');
  for (const [key, amount] of Object.entries(value)) if (!id(key) || typeof amount !== 'number' || !Number.isSafeInteger(amount)) ctx.fail('INVALID_EFFECT', '效果属性必须是有效ID与带符号安全整数映射');
  return value as Record<string, number>;
}
function rule(ctx: ReadContext, value: unknown, expectedId?: string): Rule {
  if (!object(value) || !id(value.id) || (expectedId !== undefined && value.id !== expectedId) || typeof value.name !== 'string' || value.name.length === 0
    || !seconds(value.durationSeconds) || value.durationSeconds === 0) return ctx.fail('INVALID_EFFECT', '效果目录返回了无效条款');
  return { id: value.id, name: value.name, durationSeconds: value.durationSeconds, modifiers: modifiers(ctx, value.modifiers) };
}
function sameRule(a: Rule, b: Rule): boolean {
  return a.id === b.id && a.name === b.name && a.durationSeconds === b.durationSeconds
    && Object.keys(a.modifiers).length === Object.keys(b.modifiers).length
    && Object.entries(a.modifiers).every(([key, amount]) => own(b.modifiers, key) === amount);
}
/** Validate the current catalog independently from already frozen active effects. */
function catalog(ctx: ReadContext): Map<string, Rule> {
  const result = ctx.query('effect-rule', 'list');
  if (!object(result) || !Array.isArray(result.effects)) return ctx.fail('INVALID_EFFECT', '效果目录没有返回有效列表');
  const rules = new Map<string, Rule>();
  for (const entry of result.effects) {
    const value = rule(ctx, entry);
    if (rules.has(value.id)) ctx.fail('INVALID_EFFECT', `重复效果：${value.id}`);
    const described = rule(ctx, ctx.query('effect-rule', 'get', { effect: value.id }), value.id);
    if (!sameRule(value, described)) ctx.fail('INVALID_EFFECT', '效果目录的列表与详情不一致');
    rules.set(value.id, value);
  }
  return rules;
}
function observe(ctx: ReadContext): { state: State; now: number } {
  const state = ctx.state<State>(); let notBefore = state.observedAt;
  for (const [key, effect] of Object.entries(state.active)) {
    if (effect.id !== key || !id(effect.id) || typeof effect.name !== 'string' || !effect.name.length
      || !seconds(effect.startedAt) || !seconds(effect.expiresAt) || !(effect.expiresAt > effect.startedAt)) ctx.fail('INVALID_EFFECT_STATE', '已施加效果的ID或时间记录无效');
    modifiers(ctx, effect.modifiers); notBefore = Math.max(notBefore, effect.startedAt);
  }
  return { state, now: readSimulationTime(ctx, notBefore) };
}
function summarize(ctx: ReadContext, state: State, now: number): JsonObject {
  const effects = [], totals: Record<string, number> = {};
  for (const effect of Object.values(state.active)) {
    if (now >= effect.expiresAt) continue;
    for (const [key, amount] of Object.entries(effect.modifiers)) {
      const total = (own(totals, key) ?? 0) + amount;
      if (!Number.isSafeInteger(total)) ctx.fail('INVALID_EFFECT_MODIFIER', '效果属性汇总超出带符号安全整数范围');
      totals[key] = total;
    }
    effects.push({ ...effect, remainingSeconds: effect.expiresAt - now });
  }
  return { now, effects, modifiers: totals };
}
function status(ctx: ReadContext): JsonObject {
  catalog(ctx); const { state, now } = observe(ctx); return summarize(ctx, state, now);
}
function prune(state: State, now: number): State {
  return { observedAt: now, active: Object.fromEntries(Object.entries(state.active).filter(([, effect]) => now < effect.expiresAt)) };
}
function write(ctx: ExecutionContext, state: State): void { ctx.write(state as unknown as JsonValue); }
export const effectsModule: ModuleDefinition = {
  manifest: { id: 'effects.timed', title: '限时效果', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { effects: '1.0.0' }, requires: { 'effect-rule': { version: '^1.0.0' }, 'effect-duration': { version: '^1.0.0' }, time: { version: '^1.0.0' } } },
  configSchema: emptySchema, stateSchema: objectSchema({ observedAt: numberSchema, active: recordSchema(frozenSchema) }), initialState: () => ({ observedAt: 0, active: {} }),
  validate(ctx) { status(ctx); },
  commands: {
    apply: { schema: objectSchema({ effect: idSchema }), execute(ctx, input) {
      const rules = catalog(ctx), definition = rules.get(input.effect as string);
      if (!definition) return ctx.fail('UNKNOWN_EFFECT', `未知效果：${input.effect}`);
      const { state, now } = observe(ctx), next = prune(state, now), current = own(next.active, definition.id);
      const result = ctx.query('effect-duration', 'resolve', { now, durationSeconds: definition.durationSeconds, currentExpiresAt: current?.expiresAt ?? null });
      if (!object(result) || !seconds(result.expiresAt) || !(result.expiresAt > now) || (current !== undefined && result.expiresAt < current.expiresAt)) return ctx.fail('INVALID_EFFECT_DURATION', '效果时长策略返回了无效或缩短的到期时间');
      next.active[definition.id] = { id: definition.id, name: definition.name, modifiers: definition.modifiers, startedAt: now, expiresAt: result.expiresAt };
      const resultStatus = summarize(ctx, next, now); write(ctx, next); return resultStatus;
    } },
    remove: { schema: objectSchema({ effect: idSchema }), execute(ctx, input) {
      catalog(ctx); const { state, now } = observe(ctx), next = prune(state, now), effect = input.effect as string;
      if (!own(next.active, effect)) return ctx.fail('NO_ACTIVE_EFFECT', `没有仍有效的效果：${effect}`);
      delete next.active[effect]; const result = summarize(ctx, next, now); write(ctx, next); return result;
    } }
  },
  queries: { status: { schema: emptySchema, execute: status } },
  events: { 'time.advanced': (ctx, event) => {
    if (event.source !== ctx.provider('time')) return;
    const { state, now } = observe(ctx); write(ctx, prune(state, now));
  } }
};
