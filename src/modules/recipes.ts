import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, MAX_NUMBER, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';

const countsSchema = { ...recordSchema(positiveCountSchema), minProperties: 1 };
const recipeSchema = objectSchema({
  name: { type: 'string', minLength: 1 }, inputs: countsSchema, outputs: countsSchema,
  durationSeconds: { type: 'number', exclusiveMinimum: 0, maximum: MAX_NUMBER }
});
function catalog(ctx: ReadContext): Record<string, JsonObject> { return ctx.config.recipes as Record<string, JsonObject>; }
export const recipesModule: ModuleDefinition = {
  manifest: { id: 'recipes.catalog', title: '配方目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { recipes: '1.0.0' } },
  configSchema: objectSchema({ recipes: recordSchema(recipeSchema) }),
  stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ recipe: idSchema }), execute(ctx, input) {
      const id = input.recipe as string, recipe = own(catalog(ctx), id);
      if (!recipe) return ctx.fail('UNKNOWN_RECIPE', `未知配方：${id}`);
      return { id, ...recipe };
    } },
    list: { schema: emptySchema, execute: ctx => ({ recipes: Object.entries(catalog(ctx)).map(([id, recipe]) => ({ id, ...recipe })) }) }
  }
};
