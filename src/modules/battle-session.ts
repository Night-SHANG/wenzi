import type { ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema } from './capacity.ts';

interface State { owner: string | null }
function status(ctx: ReadContext): { owner: string | null } { return { owner: ctx.state<State>().owner }; }
export const sessionModule: ModuleDefinition = {
  manifest: { id: 'battle-session.exclusive', title: '独占战斗会话', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { 'battle-session': '1.0.0' } },
  configSchema: emptySchema,
  stateSchema: objectSchema({ owner: { anyOf: [{ type: 'null' }, idSchema] } }),
  initialState: () => ({ owner: null }),
  commands: {
    acquire: { schema: objectSchema({ owner: idSchema }), execute(ctx, input) {
      if (status(ctx).owner !== null) return ctx.fail('BATTLE_SESSION_BUSY', '战斗会话已被占用');
      const owner = input.owner as string; ctx.write({ owner }); return { owner };
    } },
    release: { schema: objectSchema({ owner: idSchema }), execute(ctx, input) {
      if (status(ctx).owner !== input.owner) return ctx.fail('BATTLE_SESSION_OWNER', '只有当前准确拥有者可以释放战斗会话');
      ctx.write({ owner: null }); return { owner: null };
    } }
  },
  queries: { status: { schema: emptySchema, execute: status } }
};
