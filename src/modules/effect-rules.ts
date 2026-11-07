import type { ModuleDefinition } from '../contracts.ts';
import { emptySchema, idSchema, MAX_NUMBER, objectSchema, own, recordSchema } from './capacity.ts';

interface EffectDefinition { name: string; durationSeconds: number; modifiers: Record<string, number> }
const modifiersSchema = recordSchema({ type: 'integer', minimum: -MAX_NUMBER, maximum: MAX_NUMBER });
export const effectRulesModule: ModuleDefinition = {
  manifest: { id: 'effects.catalog', title: '效果目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'effect-rule': '1.0.0' } },
  configSchema: objectSchema({ effects: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER }, modifiers: modifiersSchema })) }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ effect: idSchema }), execute(ctx, input) {
      const effect = input.effect as string, definition = own(ctx.config.effects as unknown as Record<string, EffectDefinition>, effect);
      if (!definition) return ctx.fail('UNKNOWN_EFFECT', `未知效果：${effect}`);
      return { id: effect, ...definition };
    } },
    list: { schema: emptySchema, execute: ctx => ({ effects: Object.entries(ctx.config.effects as unknown as Record<string, EffectDefinition>).map(([id, definition]) => ({ id, ...definition })) }) }
  }
};
