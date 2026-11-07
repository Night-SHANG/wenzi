import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, positiveCountSchema } from './capacity.ts';
import { isObject } from './encounter-rules.ts';

interface Candidate { id: string; hp: number; maxHp: number }
const ids = ['targeting.first', 'targeting.lowest-hp'];
const candidatesSchema = { type: 'array', minItems: 1, items: objectSchema({ id: idSchema, hp: positiveCountSchema, maxHp: positiveCountSchema }) };
function targetingModule(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'targeting.first' ? '首个目标策略' : '最低生命目标策略', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { targeting: '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: {
      choose: {
        schema: objectSchema({ candidates: candidatesSchema }),
        execute(ctx, input) {
          const candidates = input.candidates as unknown as Candidate[];
          const seen = new Set<string>();
          let target = candidates[0]!;
          for (const candidate of candidates) {
            if (seen.has(candidate.id) || candidate.hp > candidate.maxHp) return ctx.fail('INVALID_TARGET_CANDIDATE', '目标候选重复或生命超过上限');
            seen.add(candidate.id);
            if (id === 'targeting.lowest-hp' && candidate.hp < target.hp) target = candidate;
          }
          return { target: target.id };
        }
      }
    },
    migrate(previous) {
      if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1
        || !isObject(previous.state) || Object.keys(previous.state).length) throw new Error('不兼容的目标策略状态');
      return {};
    }
  };
}
export const targetFirstModule = targetingModule('targeting.first');
export const targetLowestHpModule = targetingModule('targeting.lowest-hp');
