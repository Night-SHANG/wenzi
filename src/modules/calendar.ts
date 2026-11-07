import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, MAX_NUMBER, objectSchema, positiveCountSchema } from './capacity.ts';

export interface CalendarStatus extends JsonObject {
  elapsedSeconds: number;
  dayIndex: number;
  dayOfWeek: number;
  secondOfDay: number;
  secondsPerDay: number;
  daysPerWeek: number;
}

function isObject(value: JsonValue): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSeconds(value: JsonValue | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER; }
function isCount(value: JsonValue | undefined, positive = false): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= (positive ? 1 : 0); }
function dimensions(ctx: ReadContext, secondsPerDay: JsonValue | undefined, daysPerWeek: JsonValue | undefined): { secondsPerDay: number; daysPerWeek: number } {
  if (!isCount(secondsPerDay, true) || !isCount(daysPerWeek, true)
    || BigInt(secondsPerDay) * BigInt(daysPerWeek) > BigInt(MAX_NUMBER)) return ctx.fail('INVALID_CALENDAR', '日历天长、周长与周期总秒数必须为正安全整数');
  return { secondsPerDay, daysPerWeek };
}

/** Validate a calendar projection independently of the provider and its saved state. */
export function readCalendar(ctx: ReadContext, value: JsonValue): CalendarStatus {
  const keys = ['elapsedSeconds', 'dayIndex', 'dayOfWeek', 'secondOfDay', 'secondsPerDay', 'daysPerWeek'];
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || !isSeconds(value.elapsedSeconds) || !isCount(value.dayIndex) || !isCount(value.dayOfWeek) || !isSeconds(value.secondOfDay)) {
    return ctx.fail('INVALID_CALENDAR', '日历能力返回了无效的时间或日期');
  }
  const { secondsPerDay, daysPerWeek } = dimensions(ctx, value.secondsPerDay, value.daysPerWeek);
  if (value.dayIndex !== Math.floor(value.elapsedSeconds / secondsPerDay)
    || value.dayOfWeek !== value.dayIndex % daysPerWeek || value.secondOfDay !== value.elapsedSeconds % secondsPerDay) {
    return ctx.fail('INVALID_CALENDAR', '日历日期、周内日期或日内秒数与累计时间不一致');
  }
  return { elapsedSeconds: value.elapsedSeconds, dayIndex: value.dayIndex, dayOfWeek: value.dayOfWeek, secondOfDay: value.secondOfDay, secondsPerDay, daysPerWeek };
}

function now(ctx: ReadContext): CalendarStatus {
  const { secondsPerDay, daysPerWeek } = dimensions(ctx, ctx.config.secondsPerDay, ctx.config.daysPerWeek);
  const time = ctx.query('time', 'now');
  if (!isObject(time) || Object.keys(time).length !== 1 || !Object.hasOwn(time, 'elapsedSeconds') || !isSeconds(time.elapsedSeconds)) {
    return ctx.fail('INVALID_TIME', '时间能力必须返回有限非负的安全范围累计秒数');
  }
  const elapsedSeconds = time.elapsedSeconds, dayIndex = Math.floor(elapsedSeconds / secondsPerDay);
  return readCalendar(ctx, { elapsedSeconds, dayIndex, dayOfWeek: dayIndex % daysPerWeek, secondOfDay: elapsedSeconds % secondsPerDay, secondsPerDay, daysPerWeek });
}

export const calendarModule: ModuleDefinition = {
  manifest: { id: 'calendar.cyclic', title: '周期日历', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { calendar: '1.0.0' }, requires: { time: { version: '^1.0.0' } } },
  configSchema: objectSchema({ secondsPerDay: positiveCountSchema, daysPerWeek: positiveCountSchema }),
  stateSchema: emptySchema, initialState: () => ({}),
  validate(ctx) { now(ctx); },
  queries: { now: { schema: emptySchema, execute: now } },
  migrate(previous) {
    if (previous.moduleId !== 'calendar.cyclic' || previous.version !== '1.0.0' || previous.stateVersion !== 1
      || !isObject(previous.state) || Object.keys(previous.state).length) throw Error('不兼容的日历状态');
    return {};
  }
};
