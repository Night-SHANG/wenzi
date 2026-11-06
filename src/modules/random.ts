import type { ModuleDefinition } from '../contracts.ts';

/** xorshift32: x ^= x << 13; x ^= x >>> 17; x ^= x << 5.
 * Seeds are reduced modulo 2^32. A resulting zero uses 0x6d2b79f5 so
 * xorshift's absorbing zero state cannot stall the stream. One next call
 * advances exactly once and returns unsigned state / 2^32.
 */
export const seededRandomModule: ModuleDefinition = {
  manifest: {
    id: 'random.seeded', title: '可保存的种子随机源', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { random: '1.0.0' },
    provenance: { origin: '独立实现的标准 xorshift32 算法', license: 'UNLICENSED' },
  },
  configSchema: { type: 'object', additionalProperties: false, required: ['seed'], properties: { seed: { type: 'integer', minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER } } },
  stateSchema: { type: 'object', additionalProperties: false, required: ['value'], properties: { value: { type: 'integer', minimum: 1, maximum: 0xffffffff } } },
  initialState: config => ({ value: ((config.seed as number) >>> 0) || 0x6d2b79f5 }),
  commands: {
    next: {
      schema: { type: 'object', additionalProperties: false },
      execute(context) {
        let value = context.state<{ value: number }>().value;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        value >>>= 0;
        context.write({ value });
        return { value: value / 0x100000000 };
      },
    },
  },
};
