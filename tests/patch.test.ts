import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorldPackage } from '../src/authoring/contracts.ts';
import { patchWorldPackage } from '../src/authoring/patch.ts';
const source = () => ({ format: 1, world: { id: 'world', title: 'World', version: '1.0.0', modules: [{ id: 'one', module: 'unknown', config: { items: ['a', 'b', 'c'], 'a/b': { '~key': 1 }, hasOwnProperty: 'data', '01': 'numeric object key' } }] }, demo: [] });
const config = '/world/modules/0/config';

test('patch supports all six operations, escaped keys, append and detached values', () => {
  const original = source();
  const value = { nested: ['value'] };
  const operations = [
    { op: 'test', path: `${config}/a~1b/~0key`, value: 1 },
    { op: 'add', path: `${config}/added`, value },
    { op: 'copy', from: `${config}/added`, path: `${config}/copied` },
    { op: 'replace', path: `${config}/01`, value: 'changed' },
    { op: 'move', from: `${config}/items/0`, path: `${config}/items/2` },
    { op: 'add', path: `${config}/items/-`, value: 'd' },
    { op: 'remove', path: `${config}/a~1b` },
  ];
  const result = patchWorldPackage(original, operations);
  const changed = result.world.modules[0]!.config;
  assert.deepEqual(changed.items, ['b', 'c', 'a', 'd']);
  assert.equal(changed['01'], 'changed');
  assert.deepEqual(changed.copied, value);
  value.nested.push('mutated');
  assert.deepEqual(changed.added, { nested: ['value'] });
  (changed.added as { nested: string[] }).nested.push('result mutation');
  assert.deepEqual(changed.copied, { nested: ['value'] });
  assert.deepEqual(original, source());
});

test('patch test compares JSON structurally including own hasOwnProperty data', () => {
  const pack = source();
  const reversed = { '01': 'numeric object key', hasOwnProperty: 'data', 'a/b': { '~key': 1 }, items: ['a', 'b', 'c'] };
  assert.deepEqual(patchWorldPackage(pack, [{ op: 'test', path: config, value: reversed }]), pack);
});

test('late test failure reports original index and leaves source and operations unchanged', () => {
  const pack = source();
  const operations = [{ op: 'replace', path: '/world/title', value: 'Changed' }, { op: 'test', path: '/world/id', value: 'incorrect' }];
  const before = structuredClone(operations);
  assert.throws(() => patchWorldPackage(pack, operations), /operation 1/i);
  assert.deepEqual(pack, source());
  assert.deepEqual(operations, before);
});

test('patch rejects audited operation, pointer, inherited traversal and integer-wrap defects', () => {
  const cases = [
    { op: 'toString', path: '/world/id' }, { op: '_get', path: '/world/id' },
    { op: 'remove', path: `${config}/bad~2escape` }, { op: 'test', path: '/toString', value: null },
    { op: 'add', path: '/toString/x', value: 1 },
    { op: 'add', path: `${config}/items/4294967296`, value: 'wrapped' },
    { op: 'add', path: `${config}/items/2147483648`, value: 'wrapped' },
    ...['__proto__', 'constructor', 'prototype'].map(key => ({ op: 'add', path: `${config}/${key}/x`, value: 1 })),
    ...['01', '-1', '1.0', '4'].map(index => ({ op: 'add', path: `${config}/items/${index}`, value: 'bad' })),
    { op: 'remove', path: `${config}/items/-` }, { op: 'replace', path: `${config}/items/3`, value: 'bad' },
    { op: 'copy', from: `${config}/items/-`, path: `${config}/copy` },
    { op: 'move', from: config, path: `${config}/child` },
    { op: 'move', from: `${config}/items/0`, path: `${config}/items/3` },
    { op: 'add', path: 'world/title', value: 'bad' }, { op: 'add', path: '/world/title' },
    { op: 'copy', path: '/world/title' },
  ];
  for (const operation of cases) assert.throws(() => patchWorldPackage(source(), [operation]), { code: 'INVALID_PATCH', message: /^Patch operation 0:/ }, JSON.stringify(operation));
  assert.throws(() => patchWorldPackage(source(), {}));
});

test('patch validates final structure separately from module semantics and supports root replacement', () => {
  const replacement = source(); replacement.world.id = 'replacement';
  assert.deepEqual(patchWorldPackage(source(), [{ op: 'replace', path: '', value: replacement }]), replacement);
  assert.throws(() => patchWorldPackage(source(), [{ op: 'remove', path: '/demo' }]));
  assert.throws(() => patchWorldPackage(source(), [{ op: 'add', path: '/extra', value: true }]));
  assert.equal(patchWorldPackage(source(), [{ op: 'replace', path: '/world/modules/0/module', value: 'still-unknown' }]).world.modules[0]!.module, 'still-unknown');
});


test('copy and move allow final append but validate destinations after source removal', () => {
  const result = patchWorldPackage(source(), [
    { op: 'copy', from: `${config}/items/0`, path: `${config}/items/-` },
    { op: 'move', from: `${config}/items/0`, path: `${config}/items/-` },
  ]);
  assert.deepEqual(result.world.modules[0]!.config.items, ['b', 'c', 'a', 'a']);
  assert.throws(() => patchWorldPackage(source(), [
    { op: 'test', path: '/format', value: 1 },
    { op: 'remove', path: `${config}/missing` },
  ]), { code: 'INVALID_PATCH', message: /^Patch operation 1:/ });
});

test('add-like final destinations may create own nonreserved names that shadow inherited methods', () => {
  const result = patchWorldPackage(source(), [
    { op: 'add', path: `${config}/toString`, value: 'own string' },
    { op: 'move', from: `${config}/hasOwnProperty`, path: `${config}/hasOwnProperty` },
    { op: 'copy', from: `${config}/toString`, path: `${config}/valueOf` },
  ]);
  assert.equal(result.world.modules[0]!.config.toString, 'own string');
  assert.equal(result.world.modules[0]!.config.hasOwnProperty, 'data');
  assert.equal(result.world.modules[0]!.config.valueOf, 'own string');
  assert.throws(() => patchWorldPackage(source(), [{ op: 'copy', from: `${config}/toString`, path: `${config}/copy` }]), { code: 'INVALID_PATCH' });
  assert.throws(() => patchWorldPackage(source(), [{ op: 'add', path: `${config}/toString/nested`, value: 1 }]), { code: 'INVALID_PATCH' });
});

test('move resolves a shifted destination container only after removal', () => {
  const pack = source() as WorldPackage;
  pack.world.modules[0]!.config.items = ['moved', null, { keep: true }];
  const before = structuredClone(pack);
  const operations = [{ op: 'move', from: `${config}/items/0`, path: `${config}/items/1/added` }];
  const result = patchWorldPackage(pack, operations);
  assert.deepEqual(result.world.modules[0]!.config.items, [null, { keep: true, added: 'moved' }]);
  assert.deepEqual(pack, before);
  assert.deepEqual(operations, [{ op: 'move', from: `${config}/items/0`, path: `${config}/items/1/added` }]);
  assert.throws(() => patchWorldPackage(pack, [
    ...operations,
    { op: 'move', from: `${config}/items/1/added`, path: `${config}/items/0/invalid` },
  ]), { code: 'INVALID_PATCH', message: /^Patch operation 1:/ });
  assert.deepEqual(pack, before);
});

test('dependency-executed move removal and addition retain root and same-path behavior', () => {
  const pack = source();
  assert.deepEqual(patchWorldPackage(pack, [{ op: 'move', from: '', path: '' }]), pack);
  assert.deepEqual(patchWorldPackage(pack, [{ op: 'move', from: `${config}/items/1`, path: `${config}/items/1` }]), pack);
  const wrapped = source() as WorldPackage;
  wrapped.world.modules[0]!.config.replacement = JSON.parse(JSON.stringify(pack));
  assert.deepEqual(patchWorldPackage(wrapped, [{ op: 'move', from: `${config}/replacement`, path: '' }]), pack);
});
