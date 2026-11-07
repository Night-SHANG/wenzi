import type { JsonObject, ReadContext } from '../contracts.ts';

/** Small public-data readers shared by the settlement and workshop text compositions. */
export function viewObject(ctx: ReadContext, value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为对象`);
  return value as JsonObject;
}
export function viewText(ctx: ReadContext, value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.length)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为文字`);
  return value;
}
export function viewId(ctx: ReadContext, value: unknown): string {
  const id = viewText(ctx, value, 'ID');
  if ([...id].length > 128) ctx.fail('INVALID_VIEW_DATA', 'ID不能超过128码点');
  return id;
}
export function viewFlag(ctx: ReadContext, value: unknown): boolean {
  if (typeof value !== 'boolean') return ctx.fail('INVALID_VIEW_DATA', '状态必须为布尔值');
  return value;
}
export function viewNumber(ctx: ReadContext, value: unknown, label: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (positive && value === 0)) return ctx.fail('INVALID_VIEW_DATA', `${label}超出有效范围`);
  return value;
}
export function viewCount(ctx: ReadContext, value: unknown, label: string, positive = false): number {
  const count = viewNumber(ctx, value, label, positive);
  if (!Number.isSafeInteger(count)) ctx.fail('INVALID_VIEW_DATA', `${label}必须为安全整数`);
  return count;
}
export function viewRows(ctx: ReadContext, value: unknown, label: string, key = 'id'): JsonObject[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', `${label}必须为列表`);
  const seen = new Set<string>();
  return value.map(entry => {
    const row = viewObject(ctx, entry, label), id = viewId(ctx, row[key]);
    if (seen.has(id)) ctx.fail('INVALID_VIEW_DATA', `${label}不能含重复ID`);
    seen.add(id);
    return row;
  });
}
export function viewIds(ctx: ReadContext, value: unknown): string[] {
  if (!Array.isArray(value)) return ctx.fail('INVALID_VIEW_DATA', 'ID列表必须为数组');
  const ids = value.map(entry => viewId(ctx, entry));
  if (new Set(ids).size !== ids.length) ctx.fail('INVALID_VIEW_DATA', 'ID列表不能重复');
  return ids;
}
export function viewCounts(ctx: ReadContext, value: unknown, positive = false, nonempty = false): Record<string, number> {
  const entries = Object.entries(viewObject(ctx, value, '物品计数'));
  if (nonempty && !entries.length) ctx.fail('INVALID_VIEW_DATA', '物品计数不能为空');
  return Object.fromEntries(entries.map(([id, amount]) => [viewId(ctx, id), viewCount(ctx, amount, '物品数量', positive)]));
}
export function countsText(counts: Record<string, number>): string {
  return Object.entries(counts).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => `${id} × ${quantity}`).join('，') || '无';
}
