import type { ModuleDefinition } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, objectSchema } from './capacity.ts';
import { isObject } from './encounter-rules.ts';

export interface ActorRef { side: 'party' | 'enemy'; id: string }
export interface InitiativeActor extends ActorRef { speed: number }

const ids = ['initiative.listed', 'initiative.speed'];
const actorsSchema = { type: 'array', minItems: 1, items: objectSchema({ side: { enum: ['party', 'enemy'] }, id: idSchema, speed: countSchema }) };
function initiativeModule(id: string): ModuleDefinition {
  return {
    manifest: { id, title: id === 'initiative.listed' ? '名单行动顺序' : '速度行动顺序', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { initiative: '1.0.0' } },
    configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
    queries: {
      order: {
        schema: objectSchema({ actors: actorsSchema }),
        execute(ctx, input) {
          const actors = input.actors as unknown as InitiativeActor[];
          const seen = { party: new Set<string>(), enemy: new Set<string>() };
          for (const actor of actors) {
            if (seen[actor.side].has(actor.id)) return ctx.fail('DUPLICATE_ACTOR', '同一阵营中行动者 ID 重复');
            seen[actor.side].add(actor.id);
          }
          const ordered = actors.map((actor, index) => ({ actor, index }));
          if (id === 'initiative.speed') ordered.sort((a, b) => b.actor.speed - a.actor.speed || a.index - b.index);
          return { order: ordered.map(({ actor }) => ({ side: actor.side, id: actor.id })) };
        }
      }
    },
    migrate(previous) {
      if (!ids.includes(previous.moduleId) || previous.version !== '1.0.0' || previous.stateVersion !== 1
        || !isObject(previous.state) || Object.keys(previous.state).length) throw new Error('不兼容的行动顺序策略状态');
      return {};
    }
  };
}
export const initiativeListedModule = initiativeModule('initiative.listed');
export const initiativeSpeedModule = initiativeModule('initiative.speed');
