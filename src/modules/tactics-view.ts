import type { ModuleDefinition } from '../contracts.ts';
import type { TacticalBoard } from './tactics.ts';

export const tacticsTextViewModule: ModuleDefinition = {
  manifest: {
    id: 'view.tactics.text', title: '战棋文字视图', version: '1.0.0', apiVersion: 1, stateVersion: 1,
    provides: { 'text-view': '1.0.0' }, requires: { tactics: { version: '^1.0.0' } },
    provenance: { origin: '本项目独立实现', license: 'UNLICENSED' },
  },
  configSchema: { type: 'object', additionalProperties: false },
  stateSchema: { type: 'object', additionalProperties: false },
  initialState: () => ({}),
  queries: {
    render: {
      schema: { type: 'object', additionalProperties: false },
      execute(context) {
        const board = context.query('tactics', 'board') as unknown as TacticalBoard;
        const living = board.units.filter(unit => unit.hp > 0);
        const occupied = new Map(living.map(unit => [`${unit.x},${unit.y}`, unit.side === 'player' ? 'P' : 'E']));
        const lines = [`第 ${board.turn} 回合｜行动阵营：${board.side === 'player' ? '玩家' : '敌方'}`, '坐标从 (0,0) 起；P 玩家 / E 敌方 / . 空格'];
        for (let y = 0; y < board.height; y++) lines.push(`${y}: ${Array.from({ length: board.width }, (_, x) => occupied.get(`${x},${y}`) ?? '.').join(' ')}`);
        for (const unit of living) lines.push(`${unit.name} [${unit.id}] (${unit.x},${unit.y}) 生命 ${unit.hp}｜移动 ${unit.remainingMove}｜${unit.acted ? '已攻击' : '可攻击'}`);
        if (board.winner) lines.push(`胜方：${board.winner === 'player' ? '玩家' : '敌方'}`);
        return { title: '回合战棋', lines };
      },
    },
  },
};
