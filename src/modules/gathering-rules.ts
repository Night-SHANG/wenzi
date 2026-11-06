import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, idSchema, MAX_NUMBER, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';

interface Rule { name: string; item: string; quantity: number; cooldownSeconds: number }
interface Config { rules: Record<string, Rule> }
export const gatheringRulesModule: ModuleDefinition = {
  manifest: { id: 'gathering.rules', title: '采集规则目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'gather-rule': '1.0.0' } },
  configSchema: objectSchema({ rules: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, item: idSchema, quantity: positiveCountSchema, cooldownSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER } })) }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ rule: idSchema }), execute(ctx, input) {
      const id = input.rule as string, rule = own((ctx.config as unknown as Config).rules, id);
      if (!rule) return ctx.fail('UNKNOWN_GATHER_RULE', `未知采集规则：${id}`);
      return { id, ...rule };
    } },
    list: { schema: emptySchema, execute: ctx => ({ rules: Object.entries((ctx.config as unknown as Config).rules).map(([id, rule]) => ({ id, ...rule })) }) }
  }
};
