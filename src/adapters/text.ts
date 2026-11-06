import type { JsonObject } from '../contracts.ts';
import type { WorldRuntime } from '../engine/index.ts';

export interface TextView { title: string; lines: string[] }
export function readTextView(runtime: WorldRuntime): TextView {
  const definition = runtime.definition;
  if (!definition.entryView) return { title: definition.title, lines: [`已装配 ${definition.modules.length} 个模块；使用 actions 查看操作。`] };
  const view = runtime.query(definition.entryView.instance, definition.entryView.query, {}) as JsonObject;
  if (!view || typeof view !== 'object' || typeof view.title !== 'string' || !Array.isArray(view.lines) || !view.lines.every(line => typeof line === 'string')) {
    throw new Error('文字视图必须返回 {title:string, lines:string[]}');
  }
  return { title: view.title, lines: view.lines as string[] };
}
export function renderText(runtime: WorldRuntime): string {
  const view = readTextView(runtime);
  return `${view.title}\n${view.lines.join('\n')}`;
}
