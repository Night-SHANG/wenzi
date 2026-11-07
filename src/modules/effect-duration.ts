import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, MAX_NUMBER, numberSchema, objectSchema, safeNumber } from './capacity.ts';

const ids = ['effect-duration.refresh', 'effect-duration.extend'];
function durationModule(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'effect-duration.refresh' ? '刷新效果时长' : '累加效果时长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'effect-duration': '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: { resolve: { schema: objectSchema({ now: numberSchema, durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER }, currentExpiresAt: { anyOf: [{ type: 'null' }, numberSchema] } }), execute(ctx, input) {
      const now = input.now as number, duration = input.durationSeconds as number, current = input.currentExpiresAt as number | null;
      const fresh = safeNumber(ctx, now + duration, '效果到期时间');
      if (!(fresh > now)) return ctx.fail('TIME_PRECISION', '效果时长过小，到期时间无法表示');
      if (id === 'effect-duration.refresh') return { expiresAt: Math.max(fresh, current ?? 0) };
      const start = Math.max(now, current ?? now), expiresAt = safeNumber(ctx, start + duration, '延长效果到期时间');
      if (!(expiresAt > start)) return ctx.fail('TIME_PRECISION', '效果时长过小，延长时间无法表示');
      return { expiresAt };
    } } },
    migrate(previous) {
      if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1
        || typeof previous.state !== 'object' || previous.state === null || Array.isArray(previous.state) || Object.keys(previous.state).length !== 0) throw new Error('不兼容的效果时长策略状态');
      return {};
    }
  };
}
export const effectRefreshModule = durationModule('effect-duration.refresh');
export const effectExtendModule = durationModule('effect-duration.extend');
