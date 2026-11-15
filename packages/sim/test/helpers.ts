import {
  DIAGONAL,
  FORWARD,
  FORWARD_LEFT,
  FORWARD_RIGHT,
  KNIGHT_JUMPS,
  LEFT,
  NONE,
  ORTHOGONAL,
  RIGHT,
  rays,
  steps,
} from '../src';
import type { BattleEvent, BattleResult, Side, UnitDef, UnitPlacement } from '../src';

/** Тестовая фигура: по умолчанию неподвижная мишень без атаки. */
export const def = (over: Partial<UnitDef> = {}): UnitDef => ({
  id: 'test',
  name: 'Тест',
  family: 'legion',
  hp: 10,
  atk: 0,
  initiative: 0,
  push: 0,
  move: NONE,
  attack: NONE,
  ...over,
});

export const dummy = (hp = 100): UnitDef => def({ id: 'dummy', hp });

/** Атакует клетку впереди, ходит только инициативно первым. */
export const striker = (over: Partial<UnitDef> = {}): UnitDef =>
  def({ id: 'striker', atk: 1, push: 1, initiative: 10, attack: steps([FORWARD]), ...over });

export const at = (d: UnitDef, side: Side, x: number, y: number): UnitPlacement => ({
  def: d,
  side,
  pos: { x, y },
});

/** События указанного такта (без самого события tick). */
export function eventsOfTick(result: BattleResult, tick: number): BattleEvent[] {
  const start = result.events.findIndex((e) => e.type === 'tick' && e.tick === tick);
  if (start < 0) return [];
  const out: BattleEvent[] = [];
  for (const e of result.events.slice(start + 1)) {
    if (e.type === 'tick' || e.type === 'end') break;
    out.push(e);
  }
  return out;
}

// Набор «шахматных» тестовых фигур — не зависит от баланса в packages/content.
export const pawn = def({
  id: 'pawn',
  family: 'legion',
  hp: 8,
  atk: 3,
  initiative: 3,
  push: 1,
  move: steps([FORWARD, LEFT, RIGHT]),
  attack: steps([FORWARD_LEFT, FORWARD_RIGHT]),
});
export const knight = def({
  id: 'knight',
  family: 'riders',
  hp: 8,
  atk: 3,
  initiative: 5,
  push: 2,
  move: steps(KNIGHT_JUMPS),
  attack: steps(KNIGHT_JUMPS),
});
export const bishop = def({
  id: 'bishop',
  family: 'mystics',
  hp: 6,
  atk: 2,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
});
export const rook = def({
  id: 'rook',
  family: 'guards',
  hp: 14,
  atk: 3,
  initiative: 1,
  push: 1,
  move: rays(ORTHOGONAL, 2),
  attack: steps(ORTHOGONAL),
});
