import type { ExecutionContext, JsonValue, ModuleDefinition, ReadContext } from '../contracts.ts';

export type Side = 'player' | 'enemy';
export interface Unit { id: string; name: string; side: Side; x: number; y: number; hp: number; damage: number; hitChance: number }
export interface TacticalUnit extends Unit { remainingMove: number; acted: boolean }
export interface TacticalState { turn: number; side: Side; units: TacticalUnit[] }
export interface TacticalConfig { width: number; height: number; movePoints: number; units: Unit[] }
export interface TacticalBoard extends TacticalState { width: number; height: number; winner: Side | null }
const integer = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const unitProperties = {
  id: { type: 'string', minLength: 1 }, name: { type: 'string', minLength: 1 }, side: { enum: ['player', 'enemy'] },
  x: integer, y: integer, hp: integer, damage: integer, hitChance: { type: 'number', minimum: 0, maximum: 1 },
};
const unitKeys = Object.keys(unitProperties);
const emptyInput = { type: 'object', additionalProperties: false };
function configOf(context: ReadContext): TacticalConfig { return context.config as unknown as TacticalConfig; }
function winnerOf(state: TacticalState): Side | null {
  const living = state.units.filter(unit => unit.hp > 0);
  if (living.every(unit => unit.side === 'player')) return 'player';
  if (living.every(unit => unit.side === 'enemy')) return 'enemy';
  return null;
}
function activeState(context: ReadContext): TacticalState {
  const state = context.state<TacticalState>();
  if (winnerOf(state)) context.fail('TACTICS_FINISHED', '战斗已经结束，不能继续行动。');
  return state;
}
function actingUnit(context: ReadContext, state: TacticalState, id: JsonValue | undefined): TacticalUnit {
  const unit = state.units.find(candidate => candidate.id === id);
  if (!unit) context.fail('TACTICS_UNIT', '找不到指定的单位。');
  if (unit.hp <= 0) context.fail('TACTICS_DEAD', '已倒下的单位不能行动。');
  if (unit.side !== state.side) context.fail('TACTICS_TURN', '现在不是这个单位所属阵营的回合。');
  return unit;
}
function commit(context: ExecutionContext, state: TacticalState): void { context.write(state as unknown as JsonValue); }

export const tacticsModule: ModuleDefinition = {
  manifest: {
    id: 'tactics.grid', title: '独立回合格战规则', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { tactics: '1.0.0' }, requires: { random: { version: '^1.0.0' } },
    provenance: { origin: '本项目独立设计的最小格战样例；未移植外部游戏源码', license: 'UNLICENSED' },
  },
  configSchema: {
    type: 'object', additionalProperties: false, required: ['width', 'height', 'movePoints', 'units'], properties: {
      width: { type: 'integer', minimum: 1, maximum: 1000 }, height: { type: 'integer', minimum: 1, maximum: 1000 }, movePoints: integer,
      units: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: unitKeys, properties: { ...unitProperties, hp: { ...integer, minimum: 1 } } } },
    },
  },
  stateSchema: {
    type: 'object', additionalProperties: false, required: ['turn', 'side', 'units'], properties: {
      turn: { ...integer, minimum: 1 }, side: { enum: ['player', 'enemy'] },
      units: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: [...unitKeys, 'remainingMove', 'acted'], properties: { ...unitProperties, remainingMove: integer, acted: { type: 'boolean' } } } },
    },
  },
  initialState(config) {
    const rules = config as unknown as TacticalConfig;
    return { turn: 1, side: 'player', units: rules.units.map(unit => ({ ...unit, remainingMove: rules.movePoints, acted: false })) } as unknown as JsonValue;
  },
  validate(context) {
    const config = configOf(context);
    const state = context.state<TacticalState>();
    const initial = new Map<string, Unit>();
    const initialCells = new Set<string>();
    for (const unit of config.units) {
      if (initial.has(unit.id)) context.fail('TACTICS_DUPLICATE_UNIT', '单位标识不能重复。');
      if (unit.x >= config.width || unit.y >= config.height) context.fail('TACTICS_POSITION', '初始单位坐标超出棋盘。');
      const cell = `${unit.x},${unit.y}`;
      if (initialCells.has(cell)) context.fail('TACTICS_OCCUPIED', '多个初始单位不能占用同一格。');
      initialCells.add(cell); initial.set(unit.id, unit);
    }
    if (state.units.length !== initial.size) context.fail('TACTICS_STATE', '单位状态与世界配置不匹配。');
    const seen = new Set<string>();
    const cells = new Set<string>();
    for (const unit of state.units) {
      const original = initial.get(unit.id);
      if (!original || seen.has(unit.id)) return context.fail('TACTICS_STATE', '单位状态缺失、重复或包含未知单位。');
      seen.add(unit.id);
      if (unit.name !== original.name || unit.side !== original.side || unit.damage !== original.damage || unit.hitChance !== original.hitChance || unit.hp > original.hp) context.fail('TACTICS_STATE', '单位固定属性或生命上限与配置不一致。');
      if (unit.x >= config.width || unit.y >= config.height || unit.remainingMove > config.movePoints) context.fail('TACTICS_STATE', '单位坐标或剩余移动力不合法。');
      if (unit.hp > 0) {
        const cell = `${unit.x},${unit.y}`;
        if (cells.has(cell)) context.fail('TACTICS_OCCUPIED', '存活单位不能占用同一格。');
        cells.add(cell);
      }
    }
  },
  commands: {
    move: {
      schema: { type: 'object', additionalProperties: false, required: ['unit', 'x', 'y'], properties: { unit: { type: 'string', minLength: 1 }, x: integer, y: integer } },
      execute(context, input) {
        const state = activeState(context);
        const unit = actingUnit(context, state, input.unit);
        const config = configOf(context);
        const x = input.x as number, y = input.y as number;
        if (x >= config.width || y >= config.height) context.fail('TACTICS_BOUNDS', '移动目标超出棋盘。');
        const distance = Math.abs(x - unit.x) + Math.abs(y - unit.y);
        if (!distance || distance > unit.remainingMove) context.fail('TACTICS_MOVE_RANGE', '目标必须是剩余移动力内的不同格子。');
        if (state.units.some(other => other.hp > 0 && other.x === x && other.y === y)) context.fail('TACTICS_OCCUPIED', '目标格已有存活单位。');
        unit.x = x; unit.y = y; unit.remainingMove -= distance;
        commit(context, state);
        context.emit('tactics.moved', { unit: unit.id, x, y, remainingMove: unit.remainingMove });
        return { unit: unit.id, x, y, remainingMove: unit.remainingMove };
      },
    },
    attack: {
      schema: { type: 'object', additionalProperties: false, required: ['unit', 'target'], properties: { unit: { type: 'string', minLength: 1 }, target: { type: 'string', minLength: 1 } } },
      execute(context, input) {
        const state = activeState(context);
        const unit = actingUnit(context, state, input.unit);
        if (unit.acted) context.fail('TACTICS_ACTED', '这个单位本回合已经攻击过。');
        const target = state.units.find(candidate => candidate.id === input.target);
        if (!target || target.hp <= 0) return context.fail('TACTICS_TARGET', '攻击目标不存在或已经倒下。');
        if (target.side === unit.side) context.fail('TACTICS_ALLY', '不能攻击同阵营单位。');
        if (Math.abs(target.x - unit.x) + Math.abs(target.y - unit.y) !== 1) context.fail('TACTICS_ATTACK_RANGE', '只能攻击上下左右相邻的敌人。');
        const drawn = context.call('random', 'next');
        if (!drawn || typeof drawn !== 'object' || Array.isArray(drawn)) return context.fail('TACTICS_RANDOM', '随机能力应返回包含 value 的对象。');
        const roll = drawn.value;
        if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) return context.fail('TACTICS_RANDOM', '随机能力返回值必须位于 [0,1)。');
        const hit = roll < unit.hitChance;
        const damage = hit ? Math.min(unit.damage, target.hp) : 0;
        target.hp -= damage; unit.acted = true;
        commit(context, state);
        const result = { unit: unit.id, target: target.id, hit, roll, damage, hp: target.hp, winner: winnerOf(state) };
        context.emit('tactics.attacked', result);
        return result;
      },
    },
    endTurn: {
      schema: emptyInput,
      execute(context) {
        const state = activeState(context);
        state.side = state.side === 'player' ? 'enemy' : 'player'; state.turn++;
        for (const unit of state.units) if (unit.side === state.side) { unit.remainingMove = configOf(context).movePoints; unit.acted = false; }
        commit(context, state);
        const result = { turn: state.turn, side: state.side };
        context.emit('tactics.turnChanged', result);
        return result;
      },
    },
  },
  queries: {
    board: {
      schema: emptyInput,
      execute(context) {
        const state = context.state<TacticalState>();
        const config = configOf(context);
        return { width: config.width, height: config.height, ...state, winner: winnerOf(state) } as unknown as JsonValue;
      },
    },
  },
};
