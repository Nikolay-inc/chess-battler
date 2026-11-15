import type { Rules, Side, Vec } from './types';

export const vec = (x: number, y: number): Vec => ({ x, y });

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

export const eq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;

export const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const inBounds = (p: Vec, rules: Rules): boolean =>
  p.x >= 0 && p.y >= 0 && p.x < rules.width && p.y < rules.height;

/** Направление «вперёд» стороны по y. */
export const forward = (side: Side): 1 | -1 => (side === 'A' ? 1 : -1);

/** Перевод направления шаблона (вперёд = +y) в координаты доски. */
export const orient = (dir: Vec, side: Side): Vec => ({ x: dir.x, y: dir.y * forward(side) });

/** Сколько рядов у каждой стороны. */
export const rowsPerSide = (rules: Rules): number => Math.floor(rules.height / 2);

/**
 * Локальные координаты стороны (y=0 — задний ряд, x — слева направо с её точки зрения)
 * → координаты доски. Для B — поворот на 180°.
 */
export const toBoard = (side: Side, local: Vec, rules: Rules): Vec =>
  side === 'A' ? local : { x: rules.width - 1 - local.x, y: rules.height - 1 - local.y };

/** Обратное к toBoard (поворот на 180° — инволюция). */
export const toLocal = (side: Side, pos: Vec, rules: Rules): Vec => toBoard(side, pos, rules);

/** Направление толчка: знак доминирующей оси; при равенстве — диагональ. */
export const pushDirection = (from: Vec, to: Vec): Vec => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return {
    x: ax >= ay ? Math.sign(dx) : 0,
    y: ay >= ax ? Math.sign(dy) : 0,
  };
};
