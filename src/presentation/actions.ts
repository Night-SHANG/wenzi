import type { Command, JsonObject, ReadContext } from '../contracts.ts';
import { parseCommand } from '../engine/index.ts';
import { EngineError } from '../engine/json.ts';

function command(value: unknown): Command {
  const parsed = parseCommand(value);
  if (parsed.id === '') throw new EngineError('INVALID_COMMAND', 'id必须为非空文字');
  return { ...parsed, input: parsed.input ?? {} };
}

/** Generic text transport; quoted/whitespace identifiers need no game-specific parser. */
export function parseActionCommand(text: string): Command {
  const source = text.trim();
  if (source.startsWith('{')) return command(JSON.parse(source));
  const match = source.match(/^(\S+)\s+(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) throw new EngineError('INVALID_COMMAND', '用法：do {"target":"实例","action":"操作","input":{}}，或 do <实例> <操作> <JSON参数>');
  return command({ target: match[1]!, action: match[2]!, input: match[3] ? JSON.parse(match[3]) : {} });
}

export function formatActionCommand(value: Command): string { return `do ${JSON.stringify(command(value))}`; }

export function boundActionCommand(ctx: ReadContext, capability: string, action: string, input: JsonObject = {}): string {
  const target = ctx.provider(capability);
  if (!target) return ctx.fail('INVALID_VIEW_DATA', `未绑定操作能力：${capability}`);
  return formatActionCommand({ target, action, input });
}
