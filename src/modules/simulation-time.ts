import type { ReadContext } from '../contracts.ts';
import { MAX_NUMBER } from './capacity.ts';

/** Read cumulative simulation seconds from this consumer's bound time provider. */
export function readSimulationTime(context: ReadContext, notBefore = 0): number {
  const result = context.query('time', 'now');
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || typeof result.elapsedSeconds !== 'number' || !Number.isFinite(result.elapsedSeconds)
    || result.elapsedSeconds < 0 || result.elapsedSeconds > MAX_NUMBER) {
    return context.fail('INVALID_CLOCK', '绑定时钟没有返回有效的累计模拟秒数');
  }
  if (result.elapsedSeconds < notBefore) return context.fail('CLOCK_BACKWARD', '绑定时钟早于已记录的时间基线');
  return result.elapsedSeconds;
}
