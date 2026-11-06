import type { JsonObject, ModuleDefinition, ReadContext } from '../contracts.ts';
import { emptySchema, idSchema, objectSchema, own, recordSchema } from './capacity.ts';

interface Node { name: string; description: string; exits: string[] }
interface Config { start: string; nodes: Record<string, Node> }
interface State { current: string; visited: string[] }
const idsSchema = { type: 'array', items: idSchema, uniqueItems: true };
function node(ctx: ReadContext, id: string): Node {
  const result = own((ctx.config as unknown as Config).nodes, id);
  if (!result) return ctx.fail('UNKNOWN_LOCATION', `未知地点：${id}`);
  return result;
}
function current(ctx: ReadContext, state = ctx.state<State>()): JsonObject {
  const value = node(ctx, state.current);
  return { id: state.current, name: value.name, description: value.description, exits: value.exits.map(id => ({ id, name: node(ctx, id).name })), visited: state.visited };
}
export const locationModule: ModuleDefinition = {
  manifest: { id: 'location.nodes', title: '节点地点', version: '1.0.0', apiVersion: 1, stateVersion: 1, provides: { location: '1.0.0' } },
  configSchema: objectSchema({ start: idSchema, nodes: recordSchema(objectSchema({ name: { type: 'string', minLength: 1 }, description: { type: 'string' }, exits: idsSchema })) }),
  stateSchema: objectSchema({ current: idSchema, visited: idsSchema }),
  initialState: config => ({ current: config.start!, visited: [config.start!] }),
  validate(ctx) {
    const config = ctx.config as unknown as Config, state = ctx.state<State>();
    node(ctx, config.start);
    for (const value of Object.values(config.nodes)) for (const exit of value.exits) node(ctx, exit);
    node(ctx, state.current);
    for (const id of state.visited) node(ctx, id);
    if (!state.visited.includes(state.current)) ctx.fail('INVALID_LOCATION_STATE', '已访问地点必须包含当前位置');
  },
  commands: { move: { schema: objectSchema({ to: idSchema }), execute(ctx, input) {
    const to = input.to as string, state = ctx.state<State>(); node(ctx, to);
    if (!node(ctx, state.current).exits.includes(to)) ctx.fail('UNLINKED_LOCATION', `当前位置没有通往此处的道路：${to}`);
    const from = state.current; state.current = to;
    if (!state.visited.includes(to)) state.visited.push(to);
    ctx.write({ current: state.current, visited: state.visited }); ctx.emit('location.moved', { from, to });
    return current(ctx, state);
  } } },
  queries: {
    current: { schema: emptySchema, execute: ctx => current(ctx) },
    describe: { schema: objectSchema({ location: idSchema }), execute(ctx, input) { const id = input.location as string; return { id, ...node(ctx, id) }; } }
  }
};
