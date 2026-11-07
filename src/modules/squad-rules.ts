import type { JsonObject, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';
import { countSchema, emptySchema, idSchema, numberSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';
import { isCount, isId, isObject, isSeconds } from './encounter-rules.ts';

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}
export interface SquadDefinition {
  id: string;
  name: string;
  location: string;
  enemies: EnemyDefinition[];
  loot: Record<string, number>;
  experience: number;
  cooldownSeconds: number;
}

const enemySchema = objectSchema({ id: idSchema, name: { type: 'string', minLength: 1 }, maxHp: positiveCountSchema, attack: positiveCountSchema, defense: countSchema, speed: countSchema });
const squadSchema = objectSchema({ name: { type: 'string', minLength: 1 }, location: idSchema, enemies: { type: 'array', minItems: 1, items: enemySchema }, loot: recordSchema(positiveCountSchema), experience: countSchema, cooldownSeconds: numberSchema });
const squadKeys = ['id', 'name', 'location', 'enemies', 'loot', 'experience', 'cooldownSeconds'];
const enemyKeys = ['id', 'name', 'maxHp', 'attack', 'defense', 'speed'];
function exactKeys(value: JsonObject, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

/** Validate the public catalog contract independently of the provider implementation. */
export function readSquad(ctx: ReadContext, value: JsonValue, expectedId?: string): SquadDefinition {
  if (!isObject(value) || !exactKeys(value, squadKeys) || !isId(value.id)
    || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || !value.name.length || !isId(value.location)
    || !Array.isArray(value.enemies) || !value.enemies.length
    || !isObject(value.loot) || Object.entries(value.loot).some(([id, quantity]) => !isId(id) || !isCount(quantity, true))
    || !isCount(value.experience) || !isSeconds(value.cooldownSeconds)) {
    return ctx.fail('INVALID_SQUAD_RULE', '群敌遭遇规则返回了无效内容');
  }
  const ids = new Set<string>();
  const enemies = value.enemies.map(enemy => {
    if (!isObject(enemy) || !exactKeys(enemy, enemyKeys) || !isId(enemy.id) || ids.has(enemy.id)
      || typeof enemy.name !== 'string' || !enemy.name.length || !isCount(enemy.maxHp, true)
      || !isCount(enemy.attack, true) || !isCount(enemy.defense) || !isCount(enemy.speed)) {
      return ctx.fail('INVALID_SQUAD_RULE', '群敌遭遇包含无效或重复的敌人');
    }
    ids.add(enemy.id);
    return { id: enemy.id, name: enemy.name, maxHp: enemy.maxHp, attack: enemy.attack, defense: enemy.defense, speed: enemy.speed };
  });
  return {
    id: value.id, name: value.name, location: value.location, enemies,
    loot: { ...value.loot } as Record<string, number>, experience: value.experience, cooldownSeconds: value.cooldownSeconds
  };
}

export const squadRulesModule: ModuleDefinition = {
  manifest: { id: 'squads.catalog', title: '群敌遭遇目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'squad-rule': '1.0.0' } },
  configSchema: objectSchema({ encounters: recordSchema(squadSchema) }),
  stateSchema: emptySchema,
  initialState: () => ({}),
  validate(ctx) {
    for (const [id, terms] of Object.entries(ctx.config.encounters as JsonObject)) {
      readSquad(ctx, { id, ...(terms as JsonObject) }, id);
    }
  },
  queries: {
    get: {
      schema: objectSchema({ encounter: idSchema }),
      execute(ctx, input) {
        const id = input.encounter as string;
        const terms = own(ctx.config.encounters as Record<string, JsonObject>, id);
        if (!terms) return ctx.fail('UNKNOWN_ENCOUNTER', `未知遭遇：${id}`);
        return { id, ...terms };
      }
    },
    list: {
      schema: emptySchema,
      execute: ctx => ({ encounters: Object.entries(ctx.config.encounters as JsonObject).map(([id, terms]) => ({ id, ...(terms as JsonObject) })) })
    }
  }
};
