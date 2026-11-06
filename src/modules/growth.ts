import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, MAX_NUMBER, numberSchema, objectSchema, safeNumber } from './capacity.ts';
const ids = ['growth.linear', 'growth.greenhouse'];
function growth(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'growth.linear' ? '线性生长' : '温室生长', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'growth-rule': '1.0.0' } },
    configSchema: objectSchema({ multiplier: numberSchema }, []), stateSchema: emptySchema, initialState: () => ({}),
    queries: { progress: { schema: objectSchema({ deltaSeconds: numberSchema, durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER } }), execute(ctx, input) { const amount = safeNumber(ctx, (input.deltaSeconds as number) / (input.durationSeconds as number) * ((ctx.config.multiplier as number | undefined) ?? 1), '生长增量'); return { amount }; } } },
    migrate(previous) { if (!ids.includes(previous.moduleId) || previous.stateVersion !== 1 || previous.version !== '1.0.0' || typeof previous.state !== 'object' || previous.state === null || Array.isArray(previous.state) || Object.keys(previous.state).length) throw new Error('不兼容的生长规则状态'); return {}; }
  };
}
export const growthModules = ids.map(growth);
