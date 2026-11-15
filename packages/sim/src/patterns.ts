import { add, inBounds, orient } from './geometry';
import type { Pattern, Rules, Side, Vec } from './types';

// Направления в «локальной» системе шаблона: +y — вперёд, к врагу.
export const FORWARD: Vec = { x: 0, y: 1 };
export const BACK: Vec = { x: 0, y: -1 };
export const LEFT: Vec = { x: -1, y: 0 };
export const RIGHT: Vec = { x: 1, y: 0 };
export const FORWARD_LEFT: Vec = { x: -1, y: 1 };
export const FORWARD_RIGHT: Vec = { x: 1, y: 1 };
export const BACK_LEFT: Vec = { x: -1, y: -1 };
export const BACK_RIGHT: Vec = { x: 1, y: -1 };

export const ORTHOGONAL: readonly Vec[] = [FORWARD, RIGHT, BACK, LEFT];
export const DIAGONAL: readonly Vec[] = [FORWARD_LEFT, FORWARD_RIGHT, BACK_RIGHT, BACK_LEFT];
export const KNIGHT_JUMPS: readonly Vec[] = [
  { x: -1, y: 2 },
  { x: 1, y: 2 },
  { x: 2, y: 1 },
  { x: 2, y: -1 },
  { x: 1, y: -2 },
  { x: -1, y: -2 },
  { x: -2, y: -1 },
  { x: -2, y: 1 },
];

/** Одиночные смещения (шаг или прыжок — промежуточные клетки не проверяются). */
export const steps = (dirs: readonly Vec[]): Pattern => ({ dirs, slide: false });

/** Лучи, блокируемые первой фигурой. */
export const rays = (dirs: readonly Vec[], range?: number): Pattern =>
  range === undefined ? { dirs, slide: true } : { dirs, slide: true, range };

/** Шаблон, который ничего не делает (например, неподвижная мишень в тестах). */
export const NONE: Pattern = { dirs: [], slide: false };

type Occupied = (p: Vec) => boolean;

/** Пустые клетки, куда фигура может пойти по шаблону. Порядок детерминирован. */
export function moveTargets(
  pattern: Pattern,
  from: Vec,
  side: Side,
  rules: Rules,
  occupied: Occupied,
): Vec[] {
  const out: Vec[] = [];
  for (const d of pattern.dirs) {
    const dir = orient(d, side);
    const range = pattern.slide ? (pattern.range ?? Infinity) : 1;
    let p = from;
    for (let i = 0; i < range; i++) {
      p = add(p, dir);
      if (!inBounds(p, rules) || occupied(p)) break;
      out.push(p);
    }
  }
  return out;
}

/** Занятые клетки, по которым фигура может ударить (первая фигура на луче). */
export function attackTargets(
  pattern: Pattern,
  from: Vec,
  side: Side,
  rules: Rules,
  occupied: Occupied,
): Vec[] {
  const out: Vec[] = [];
  for (const d of pattern.dirs) {
    const dir = orient(d, side);
    const range = pattern.slide ? (pattern.range ?? Infinity) : 1;
    let p = from;
    for (let i = 0; i < range; i++) {
      p = add(p, dir);
      if (!inBounds(p, rules)) break;
      if (occupied(p)) {
        out.push(p);
        break;
      }
    }
  }
  return out;
}
