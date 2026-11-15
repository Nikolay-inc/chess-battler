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
  name: 'Легионер',
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
  name: 'Щитоносец',
  family: 'legion',
  cost: 1,
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK_WIDE,
  abilities: [{ kind: 'auraArmor', amount: 1 }],
  description: 'Прикрытие: соседние союзники получают +1 броню.',
};

export const standardBearer: UnitDef = {
  id: 'standard_bearer',
  name: 'Знаменосец',
  family: 'legion',
  cost: 2,
  hp: 9,
  atk: 2,
  initiative: 3,
  push: 1,
  move: PAWN_MOVE,
  attack: PAWN_ATTACK,
  abilities: [{ kind: 'auraAtk', amount: 1, family: 'legion' }],
  description: 'Знамя: союзники Легиона в том же ряду получают +1 ATK.',
};

export const veteran: UnitDef = {
  id: 'veteran',
  name: 'Ветеран',
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
  description: 'Закалка: +1 ATK за каждое получение урона, максимум +3.',
};

// ---------- Всадники (кони) ----------

export const rider: UnitDef = {
  id: 'rider',
  name: 'Всадник',
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
  name: 'Застрельщик',
  family: 'riders',
  cost: 1,
  hp: 6,
  atk: 3,
  initiative: 6,
  push: 1,
  move: KNIGHT,
  attack: KNIGHT,
  abilities: [{ kind: 'targetHighestAtk' }],
  description: 'Наводчик: бьёт цель с наибольшей ATK.',
};

export const lancer: UnitDef = {
  id: 'lancer',
  name: 'Улан',
  family: 'riders',
  cost: 2,
  hp: 7,
  atk: 3,
  initiative: 6,
  push: 2,
  move: KNIGHT,
  attack: KNIGHT,
  abilities: [{ kind: 'collisionBonus', amount: 2 }],
  description: 'Копьё: если его толчок вызвал столкновение, урон столкновения +2.',
};

export const commander: UnitDef = {
  id: 'commander',
  name: 'Командор',
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
  description: 'Клич: в начале боя все союзные Всадники получают +2 инициативы и +1 ATK.',
};

// ---------- Мистики (слоны) ----------

export const adept: UnitDef = {
  id: 'adept',
  name: 'Адепт',
  family: 'mystics',
  cost: 1,
  hp: 6,
  atk: 3,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
  description: 'Дальний стрелок: бьёт по всей диагонали.',
};

export const novice: UnitDef = {
  id: 'novice',
  name: 'Послушник',
  family: 'mystics',
  cost: 1,
  hp: 7,
  atk: 1,
  initiative: 4,
  push: 0,
  move: rays(DIAGONAL, 2),
  attack: steps(DIAGONAL),
  abilities: [{ kind: 'heal', amount: 2 }],
  description:
    'Лечение: после атаки (или вместо хода, если врагов в зоне нет) лечит самого раненого союзника по диагонали на 2.',
};

export const stormcaller: UnitDef = {
  id: 'stormcaller',
  name: 'Буревестник',
  family: 'mystics',
  cost: 2,
  hp: 7,
  atk: 2,
  initiative: 4,
  push: 2,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL, 2),
  abilities: [{ kind: 'squall', maxLinks: 3 }],
  description: 'Шквал: фигура, в которую врезалась цель, тоже сдвигается (цепочка до 3 звеньев).',
};

export const oracle: UnitDef = {
  id: 'oracle',
  name: 'Оракул',
  family: 'mystics',
  cost: 3,
  hp: 9,
  atk: 3,
  initiative: 4,
  push: 1,
  move: rays(DIAGONAL, 2),
  attack: rays(DIAGONAL),
  abilities: [{ kind: 'shieldStrongest', amount: 6 }],
  description: 'Предвидение: в начале боя союзник с наибольшим HP получает щит 6.',
};

// ---------- Стражи (ладьи) ----------

export const warden: UnitDef = {
  id: 'warden',
  name: 'Страж',
  family: 'guards',
  cost: 1,
  hp: 14,
  atk: 3,
  initiative: 1,
  push: 1,
  pushResist: 1,
  move: rays(ORTHOGONAL, 2),
  attack: steps(ORTHOGONAL),
  description: 'Устойчивость: сила толчков по нему на 1 меньше.',
};

export const sentry: UnitDef = {
  id: 'sentry',
  name: 'Часовой',
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
  description: 'Ответный удар: атакующий из соседней клетки получает 1 урон.',
};

export const ram: UnitDef = {
  id: 'ram',
  name: 'Таран',
  family: 'guards',
  cost: 2,
  hp: 12,
  atk: 2,
  initiative: 2,
  push: 3,
  move: rays(ORTHOGONAL, 3),
  attack: steps(ORTHOGONAL),
  abilities: [{ kind: 'heavy' }],
  description: 'Тяжёлый: не получает урон от столкновений.',
};

export const bastion: UnitDef = {
  id: 'bastion',
  name: 'Бастион',
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
  description: 'Провокация: враги, у которых Бастион в зоне атаки, обязаны бить его.',
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
