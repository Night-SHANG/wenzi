import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own, positiveCountSchema, recordSchema } from './capacity.ts';

export interface OfferDefinition extends JsonObject { buy: number | null; sell: number | null; targetStock: number }
export interface ShopDefinition extends JsonObject { id: string; name: string; location: string | null; container: string; account: string; offers: Record<string, OfferDefinition> }
export const offerSchema = {
  ...objectSchema({ buy: { anyOf: [positiveCountSchema, { type: 'null' }] }, sell: { anyOf: [positiveCountSchema, { type: 'null' }] }, targetStock: positiveCountSchema }),
  anyOf: [{ properties: { buy: positiveCountSchema } }, { properties: { sell: positiveCountSchema } }]
};
const definitionSchema = objectSchema({ name: { type: 'string', minLength: 1 }, location: { anyOf: [idSchema, { type: 'null' }] }, container: idSchema, account: idSchema, offers: { ...recordSchema(offerSchema), minProperties: 1 } });
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).every(key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key)
      && (() => { const d = Object.getOwnPropertyDescriptor(value, key)!; return 'value' in d && d.enumerable; })());
}
function exact(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function id(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && [...value].length <= 128; }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
export function readOffer(ctx: ReadContext, value: unknown): OfferDefinition {
  if (!object(value) || !exact(value, ['buy', 'sell', 'targetStock'])
    || !(value.buy === null || positive(value.buy)) || !(value.sell === null || positive(value.sell))
    || (value.buy === null && value.sell === null) || !positive(value.targetStock)) return ctx.fail('INVALID_OFFER', '商店条款必须包含有效的交易方向、基础价格和目标库存');
  return { buy: value.buy, sell: value.sell, targetStock: value.targetStock };
}
export function readShop(ctx: ReadContext, value: unknown, expectedId?: string): ShopDefinition {
  if (!object(value) || !exact(value, ['id', 'name', 'location', 'container', 'account', 'offers'])
    || !id(value.id) || (expectedId !== undefined && value.id !== expectedId)
    || typeof value.name !== 'string' || value.name.length === 0 || !(value.location === null || id(value.location))
    || !id(value.container) || !id(value.account) || !object(value.offers) || !Object.keys(value.offers).length) return ctx.fail('INVALID_SHOP', '商店提供者返回了无效定义或不匹配的身份');
  const offers = Object.fromEntries(Object.entries(value.offers).map(([item, offer]) => {
    if (!id(item)) return ctx.fail('INVALID_SHOP', '商店物品 ID 无效');
    return [item, readOffer(ctx, offer)];
  }));
  return { id: value.id, name: value.name, location: value.location, container: value.container, account: value.account, offers };
}
export const shopRulesModule: ModuleDefinition = {
  manifest: { id: 'shops.catalog', title: '商店条款目录', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'shop-rule': '1.0.0' } },
  configSchema: objectSchema({ shops: recordSchema(definitionSchema) }), stateSchema: emptySchema, initialState: () => ({}),
  queries: {
    get: { schema: objectSchema({ shop: idSchema }), execute(ctx, input) {
      const id = input.shop as string, shop = own(ctx.config.shops as Record<string, JsonObject>, id);
      if (!shop) return ctx.fail('UNKNOWN_SHOP', `未知商店：${id}`);
      return readShop(ctx, { id, ...shop }, id);
    } },
    list: { schema: emptySchema, execute: ctx => ({ shops: Object.entries(ctx.config.shops as Record<string, JsonObject>).map(([id, shop]) => readShop(ctx, { id, ...shop }, id)) }) }
  }
};
