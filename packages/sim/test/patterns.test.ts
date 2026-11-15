import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES as R,
  DIAGONAL,
  FORWARD,
  KNIGHT_JUMPS,
  ORTHOGONAL,
  attackTargets,
  moveTargets,
  pushDirection,
  rays,
  steps,
  toBoard,
} from '../src';
import type { Vec } from '../src';

const occupiedBy =
  (...cells: Vec[]) =>
  (p: Vec) =>
    cells.some((c) => c.x === p.x && c.y === p.y);
const empty = occupiedBy();
const sortCells = (cells: Vec[]) => [...cells].sort((a, b) => a.y - b.y || a.x - b.x);

describe('шаблоны', () => {
  it('конь прыгает на 8 клеток из центра и на 2 из угла', () => {
    expect(moveTargets(steps(KNIGHT_JUMPS), { x: 2, y: 2 }, 'A', R, empty)).toHaveLength(8);
    expect(sortCells(moveTargets(steps(KNIGHT_JUMPS), { x: 0, y: 0 }, 'A', R, empty))).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('конь перепрыгивает через фигуры', () => {
    const around = ORTHOGONAL.concat(DIAGONAL).map((d) => ({ x: 2 + d.x, y: 2 + d.y }));
    expect(
      moveTargets(steps(KNIGHT_JUMPS), { x: 2, y: 2 }, 'A', R, occupiedBy(...around)),
    ).toHaveLength(8);
  });

  it('ладья скользит до первой фигуры и не входит в занятую клетку', () => {
    const cells = moveTargets(rays([FORWARD]), { x: 1, y: 0 }, 'A', R, occupiedBy({ x: 1, y: 3 }));
    expect(cells).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('range ограничивает длину луча', () => {
    expect(moveTargets(rays([FORWARD], 2), { x: 0, y: 0 }, 'A', R, empty)).toHaveLength(2);
  });

  it('атака по лучу видит только первую фигуру', () => {
    const cells = attackTargets(
      rays([FORWARD]),
      { x: 0, y: 0 },
      'A',
      R,
      occupiedBy({ x: 0, y: 2 }, { x: 0, y: 4 }),
    );
    expect(cells).toEqual([{ x: 0, y: 2 }]);
  });

  it('«вперёд» зеркалится для стороны B', () => {
    expect(moveTargets(steps([FORWARD]), { x: 2, y: 3 }, 'A', R, empty)).toEqual([{ x: 2, y: 4 }]);
    expect(moveTargets(steps([FORWARD]), { x: 2, y: 3 }, 'B', R, empty)).toEqual([{ x: 2, y: 2 }]);
  });

  it('армия B ставится поворотом на 180°', () => {
    expect(toBoard('A', { x: 0, y: 0 }, R)).toEqual({ x: 0, y: 0 });
    expect(toBoard('B', { x: 0, y: 0 }, R)).toEqual({ x: 4, y: 5 });
    expect(toBoard('B', { x: 1, y: 2 }, R)).toEqual({ x: 3, y: 3 });
  });

  it('направление толчка — доминирующая ось, для диагонали — диагональ', () => {
    expect(pushDirection({ x: 2, y: 2 }, { x: 2, y: 5 })).toEqual({ x: 0, y: 1 });
    expect(pushDirection({ x: 2, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 0, y: 1 }); // конь
    expect(pushDirection({ x: 2, y: 2 }, { x: 0, y: 1 })).toEqual({ x: -1, y: 0 }); // конь
    expect(pushDirection({ x: 2, y: 2 }, { x: 4, y: 0 })).toEqual({ x: 1, y: -1 });
  });
});
