import test from 'node:test';
import assert from 'node:assert/strict';
import { formatActionCommand, parseActionCommand } from '../src/presentation/actions.ts';

test('generic action text round-trips arbitrary IDs and remains compatible with legacy commands', () => {
  const command = { target: '地图 "nodes" 空格', action: '执行\t动作', input: { text: '引号 " 与 \\ 和换行\n' }, id: 'receipt 1' };
  assert.deepEqual(parseActionCommand(formatActionCommand(command).slice(3)), command);
  assert.deepEqual(parseActionCommand('location move {"to":"forest"}'), { target: 'location', action: 'move', input: { to: 'forest' } });
  assert.deepEqual(parseActionCommand('workshop collect'), { target: 'workshop', action: 'collect', input: {} });
});

test('generic command text rejects unknown fields, nonobjects, invalid identifiers and unsafe JSON', () => {
  for (const text of ['', 'only-one-token', '{bad', '[]', 'null', '{"target":"a","action":"x","extra":1}',
    '{"target":"","action":"x"}', '{"target":"a","action":""}', '{"target":"a","action":"x","id":null}',
    '{"target":"a","action":"x","input":[]}', '{"target":"a","action":"x","input":null}',
    '{"target":"a","action":"x","input":{"amount":1e999}}', '{"target":"a","action":"x","input":{"__proto__":{}}}',
    'a x []', 'a x null']) assert.throws(() => parseActionCommand(text), text);
});
