import type { ModuleDefinition } from '../contracts.ts';
import { countSchema, emptySchema, objectSchema } from './capacity.ts';
export const combatRulesModule: ModuleDefinition = {
  manifest: { id: 'combat.difference', title: '攻防差值战斗规则', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'combat-rule': '1.0.0' } },
  configSchema: emptySchema, stateSchema: emptySchema, initialState: () => ({}),
  queries: { damage: { schema: objectSchema({ attack: countSchema, defense: countSchema }), execute: (_ctx, input) => ({ damage: Math.max(1, (input.attack as number) - (input.defense as number)) }) } }
};
