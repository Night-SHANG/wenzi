import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, MAX_NUMBER, numberSchema, objectSchema } from './capacity.ts';
import { readCalendar } from './calendar.ts';

export interface AvailabilityStatus extends JsonObject {
  open: boolean;
  opensInSeconds: number;
  closesInSeconds: number | null;
}

function isObject(value: JsonValue): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isSeconds(value: JsonValue | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_NUMBER; }

/** Validate the public opening status, including consistency between its three fields. */
export function readAvailability(ctx: ReadContext, value: JsonValue): AvailabilityStatus {
  const keys = ['open', 'opensInSeconds', 'closesInSeconds'];
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || typeof value.open !== 'boolean' || !isSeconds(value.opensInSeconds)
    || (value.closesInSeconds !== null && (!isSeconds(value.closesInSeconds) || value.closesInSeconds <= 0))
    || (value.open ? value.opensInSeconds !== 0 : value.opensInSeconds <= 0 || value.closesInSeconds !== null)) {
    return ctx.fail('INVALID_AVAILABILITY', '营业能力返回了无效或相互矛盾的营业状态');
  }
  return { open: value.open, opensInSeconds: value.opensInSeconds, closesInSeconds: value.closesInSeconds };
}

interface Window { start: number; end: number }
function schedule(ctx: ReadContext) {
  const calendar = readCalendar(ctx, ctx.query('calendar', 'now'));
  // Configuration has passed the public schema; cross-calendar bounds are checked here.
  const days = ctx.config.days as number[];
  const windows = (ctx.config.windows as unknown as Window[]).map(window => ({ ...window })).sort((a, b) => a.start - b.start);
  if (new Set(days).size !== days.length || days.some(day => day >= calendar.daysPerWeek)) return ctx.fail('INVALID_SCHEDULE', '营业日期必须唯一且处于当前日历的周内范围');
  const merged: Window[] = [];
  for (const window of windows) {
    if (window.start >= window.end || window.end > calendar.secondsPerDay) return ctx.fail('INVALID_SCHEDULE', '营业窗口必须满足 0≤start<end≤每日秒数');
    const previous = merged.at(-1);
    if (previous && window.start < previous.end) return ctx.fail('INVALID_SCHEDULE', '营业窗口不能重叠');
    if (previous && window.start === previous.end) previous.end = window.end;
    else merged.push(window);
  }
  return { calendar, days, windows: merged };
}

function scheduledStatus(ctx: ReadContext): AvailabilityStatus {
  const { calendar, days, windows } = schedule(ctx);
  const { secondsPerDay, daysPerWeek, dayOfWeek, secondOfDay } = calendar;
  const daySet = new Set(days);
  const current = daySet.has(dayOfWeek) ? windows.find(window => window.start <= secondOfDay && secondOfDay < window.end) : undefined;
  if (current) {
    if (windows.length === 1 && current.start === 0 && current.end === secondsPerDay && days.length === daysPerWeek) {
      return { open: true, opensInSeconds: 0, closesInSeconds: null };
    }
    let closes = current.end - secondOfDay;
    if (current.end === secondsPerDay && windows[0]!.start === 0) {
      // Follow only configured consecutive days. Keeping day and seconds separate
      // preserves fractional windows even when the week offset is a huge integer.
      let nextDay = dayOfWeek === daysPerWeek - 1 ? 0 : dayOfWeek + 1;
      for (let visited = 0; visited < days.length && daySet.has(nextDay); visited++) {
        closes += windows[0]!.end;
        if (windows[0]!.end < secondsPerDay) break;
        nextDay = nextDay === daysPerWeek - 1 ? 0 : nextDay + 1;
      }
    }
    return readAvailability(ctx, { open: true, opensInSeconds: 0, closesInSeconds: closes });
  }
  let opens = Infinity;
  for (const day of days) {
    const distance = day >= dayOfWeek ? day - dayOfWeek : (daysPerWeek - dayOfWeek) + day;
    for (const window of windows) {
      if (distance === 0 && window.start > secondOfDay) opens = Math.min(opens, window.start - secondOfDay);
      else if (distance > 0 || window.start <= secondOfDay) {
        const futureDays = distance === 0 ? daysPerWeek : distance;
        opens = Math.min(opens, (futureDays * secondsPerDay - secondOfDay) + window.start);
      }
    }
  }
  return readAvailability(ctx, { open: false, opensInSeconds: opens, closesInSeconds: null });
}

const ids = ['availability.always', 'availability.schedule'];
function availabilityModule(id: string): ModuleDefinition {
  const scheduled = id === 'availability.schedule';
  return {
    manifest: { id, title: scheduled ? '周期营业表' : '始终营业', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { availability: '1.0.0' }, ...(scheduled ? { requires: { calendar: { version: '^1.0.0' } } } : {}) },
    configSchema: scheduled ? objectSchema({
      days: { type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: countSchema },
      windows: { type: 'array', minItems: 1, maxItems: 128, items: objectSchema({ start: numberSchema, end: numberSchema }) }
    }) : emptySchema,
    stateSchema: emptySchema, initialState: () => ({}),
    ...(scheduled ? { validate(ctx: ReadContext) { schedule(ctx); } } : {}),
    queries: { status: { schema: emptySchema, execute: scheduled ? scheduledStatus : () => ({ open: true, opensInSeconds: 0, closesInSeconds: null }) } },
    migrate(previous) {
      if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1
        || !isObject(previous.state) || Object.keys(previous.state).length) throw Error('不兼容的营业策略状态');
      return {};
    }
  };
}
export const availabilityAlwaysModule = availabilityModule('availability.always');
export const availabilityScheduleModule = availabilityModule('availability.schedule');
