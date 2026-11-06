import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, MAX_NUMBER, numberSchema, objectSchema, positiveCountSchema, safeNumber } from './capacity.ts';
const ids = ['time.step', 'time.continuous'];
function clock(id: string): ModuleDefinition {
  const step = id === 'time.step';
  return {
    manifest: { id, title: step ? '阶段时间' : '连续时间', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { time: '1.0.0' } },
    configSchema: step ? objectSchema({ secondsPerStep: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER } }) : emptySchema,
    stateSchema: objectSchema({ elapsedSeconds: numberSchema }), initialState: () => ({ elapsedSeconds: 0 }),
    commands: { advance: { schema: step ? objectSchema({ steps: positiveCountSchema }) : objectSchema({ seconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER } }), execute(ctx, input) {
      const state = ctx.state<{ elapsedSeconds: number }>(); const deltaSeconds = safeNumber(ctx, step ? (input.steps as number) * (ctx.config.secondsPerStep as number) : input.seconds as number, '推进秒数');
      const elapsedSeconds = safeNumber(ctx, state.elapsedSeconds + deltaSeconds, '累计秒数');
      if (!(elapsedSeconds > state.elapsedSeconds)) ctx.fail('TIME_PRECISION', '推进秒数过小，累计时间无法表示');
      ctx.write({ elapsedSeconds }); ctx.emit('time.advanced', { deltaSeconds, elapsedSeconds }); return { elapsedSeconds };
    } } },
    queries: { now: { schema: emptySchema, execute: ctx => ctx.state<{ elapsedSeconds: number }>() } },
    migrate(previous) { if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1) throw new Error('不兼容的时间状态'); return previous.state; }
  };
}
export const timeModules = ids.map(clock);
