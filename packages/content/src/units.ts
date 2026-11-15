import {
  DIAGONAL,
  FORWARD,
  FORWARD_LEFT,
  FORWARD_RIGHT,
  KNIGHT_JUMPS,
  LEFT,
  ORTHOGONAL,
  RIGHT,
  rays,
  steps,
} from '@chess-battler/sim';
import type { UnitDef } from '@chess-battler/sim';

const PAWN_MOVE = steps([FORWARD, LEFT, RIGHT]);

// ---------- Легион (пешки): дешёвая пехота первой линии ----------

export const legionnaire: UnitDef = {
  id: 'legionnaire',
  name: 'Легионер',
  family: 'legion',
  hp: 8,
  atk: 3,
  initiative: 3,
  push: 1,
  move: PAWN_MOVE,
  attack: steps([FORWARD_LEFT, FORWARD_RIGHT]),
};

export const shieldbearer: UnitDef = {
  id: 'shieldbearer',
  name: 'Щитоносец',
  family: 'legion',
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 1,
  move: PAWN_MOVE,
  attack: steps([FORWARD_LEFT, FORWARD, FORWARD_RIGHT]),
};

// ---------- Всадники (кони): быстрые, прыгают через строй ----------

export const rider: UnitDef = {
  id: 'rider',
  name: 'Всадник',
  family: 'riders',
  hp: 8,
  atk: 3,
  initiative: 5,
  push: 1,
  move: steps(KNIGHT_JUMPS),
  attack: steps(KNIGHT_JUMPS),
};

export const lancer: UnitDef = {
  id: 'lancer',
  name: 'Улан',
  family: 'riders',
  hp: 7,
  atk: 3,
  initiative: 6,
  push: 2,
  move: steps(KNIGHT_JUMPS),
  attack: steps(KNIGHT_JUMPS),
};

// ---------- Мистики (слоны): дальний бой по диагоналям ----------

export const adept: UnitDef = {
  id: 'adept',
  name: 'Адепт',
  family: 'mystics',
  hp: 6,
  atk: 3,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
};

export const stormcaller: UnitDef = {
  id: 'stormcaller',
  name: 'Буревестник',
  family: 'mystics',
  hp: 7,
  atk: 2,
  initiative: 4,
  push: 2,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL, 2),
};

// ---------- Стражи (ладьи): живучие, толкают по прямым ----------

export const warden: UnitDef = {
  id: 'warden',
  name: 'Страж',
  family: 'guards',
  hp: 14,
  atk: 3,
  initiative: 1,
  push: 1,
  move: rays(ORTHOGONAL, 2),
  attack: steps(ORTHOGONAL),
};

export const ram: UnitDef = {
  id: 'ram',
  name: 'Таран',
  family: 'guards',
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 3,
  move: rays(ORTHOGONAL, 3),
  attack: steps(ORTHOGONAL),
};

export const UNIT_LIST: readonly UnitDef[] = [
  legionnaire,
  shieldbearer,
  rider,
  lancer,
  adept,
  stormcaller,
  warden,
  ram,
];

export const UNITS: Readonly<Record<string, UnitDef>> = Object.fromEntries(
  UNIT_LIST.map((u) => [u.id, u]),
);

export function getUnit(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Неизвестная фигура: ${id}`);
  return def;
}
