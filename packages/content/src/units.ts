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

// Данные — по документу «Фигуры, синергии и экономика забега (v0.1)», раздел 3.
// Уровень = цена в золоте.

const PAWN_MOVE = steps([FORWARD, LEFT, RIGHT]);
const PAWN_ATTACK = steps([FORWARD_LEFT, FORWARD_RIGHT]);
const PAWN_ATTACK_WIDE = steps([FORWARD_LEFT, FORWARD, FORWARD_RIGHT]);
const KNIGHT = steps(KNIGHT_JUMPS);

// ---------- Легион (пешки) ----------

export const legionnaire: UnitDef = {
  id: 'legionnaire',
  family: 'legion',
  cost: 1,
  hp: 8,
  atk: 3,
  initiative: 3,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK,
};

export const shieldbearer: UnitDef = {
  id: 'shieldbearer',
  family: 'legion',
  cost: 1,
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK_WIDE,
  abilities: [{ kind: 'auraArmor', amount: 1 }],
};

export const standardBearer: UnitDef = {
  id: 'standard_bearer',
  family: 'legion',
  cost: 2,
  hp: 9,
  atk: 2,
  initiative: 3,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK,
  abilities: [{ kind: 'auraAtk', amount: 1, family: 'legion' }],
};

export const veteran: UnitDef = {
  id: 'veteran',
  family: 'legion',
  cost: 3,
  hp: 14,
  atk: 4,
  armor: 1,
  initiative: 3,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK_WIDE,
  abilities: [{ kind: 'rage', atkPerHit: 1, max: 3 }],
};

// ---------- Всадники (кони) ----------

export const rider: UnitDef = {
  id: 'rider',
  family: 'riders',
  cost: 1,
  hp: 8,
  atk: 3,
  initiative: 5,
  push: 1,
  move: KNIGHT,
  attack: KNIGHT,
};

export const skirmisher: UnitDef = {
  id: 'skirmisher',
  family: 'riders',
  cost: 1,
  hp: 6,
  atk: 3,
  initiative: 6,
  push: 1,
  move: KNIGHT,
  attack: KNIGHT,
  abilities: [{ kind: 'targetHighestAtk' }],
};

export const lancer: UnitDef = {
  id: 'lancer',
  family: 'riders',
  cost: 2,
  hp: 7,
  atk: 3,
  initiative: 6,
  push: 2,
  move: KNIGHT,
  attack: KNIGHT,
  abilities: [{ kind: 'collisionBonus', amount: 2 }],
};

export const commander: UnitDef = {
  id: 'commander',
  family: 'riders',
  cost: 3,
  hp: 12,
  atk: 4,
  armor: 1,
  initiative: 5,
  push: 1,
  move: KNIGHT,
  attack: KNIGHT,
  abilities: [{ kind: 'rally', family: 'riders', initiative: 2, atk: 1 }],
};

// ---------- Мистики (слоны) ----------

export const adept: UnitDef = {
  id: 'adept',
  family: 'mystics',
  cost: 1,
  hp: 6,
  atk: 3,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
};

export const novice: UnitDef = {
  id: 'novice',
  family: 'mystics',
  cost: 1,
  hp: 7,
  atk: 1,
  initiative: 4,
  push: 0,
  move: rays(DIAGONAL, 2),
  attack: steps(DIAGONAL),
  abilities: [{ kind: 'heal', amount: 2 }],
};

export const stormcaller: UnitDef = {
  id: 'stormcaller',
  family: 'mystics',
  cost: 2,
  hp: 7,
  atk: 2,
  initiative: 4,
  push: 2,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL, 2),
  abilities: [{ kind: 'squall', maxLinks: 3 }],
};

export const oracle: UnitDef = {
  id: 'oracle',
  family: 'mystics',
  cost: 3,
  hp: 9,
  atk: 3,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
  abilities: [{ kind: 'shieldStrongest', amount: 6 }],
};

// ---------- Стражи (ладьи) ----------

export const warden: UnitDef = {
  id: 'warden',
  family: 'guards',
  cost: 1,
  hp: 14,
  atk: 3,
  initiative: 1,
  push: 1,
  pushResist: 1,
  move: rays(ORTHOGONAL, 2),
  attack: steps(ORTHOGONAL),
};

export const sentry: UnitDef = {
  id: 'sentry',
  family: 'guards',
  cost: 1,
  hp: 10,
  atk: 2,
  armor: 1,
  initiative: 2,
  push: 1,
  move: steps(ORTHOGONAL),
  attack: rays(ORTHOGONAL, 2),
  abilities: [{ kind: 'thorns', amount: 1 }],
};

export const ram: UnitDef = {
  id: 'ram',
  family: 'guards',
  cost: 2,
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 3,
  move: rays(ORTHOGONAL, 3),
  attack: steps(ORTHOGONAL),
  abilities: [{ kind: 'heavy' }],
};

export const bastion: UnitDef = {
  id: 'bastion',
  family: 'guards',
  cost: 3,
  hp: 20,
  atk: 3,
  armor: 2,
  initiative: 1,
  push: 2,
  move: steps(ORTHOGONAL),
  attack: steps(ORTHOGONAL),
  abilities: [{ kind: 'taunt' }],
};

export const UNIT_LIST: readonly UnitDef[] = [
  legionnaire,
  shieldbearer,
  standardBearer,
  veteran,
  rider,
  skirmisher,
  lancer,
  commander,
  adept,
  novice,
  stormcaller,
  oracle,
  warden,
  sentry,
  ram,
  bastion,
];

export const UNITS: Readonly<Record<string, UnitDef>> = Object.fromEntries(
  UNIT_LIST.map((u) => [u.id, u]),
);

export function getUnit(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Неизвестная фигура: ${id}`);
  return def;
}
