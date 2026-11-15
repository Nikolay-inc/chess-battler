import { DIAGONAL, ORTHOGONAL, steps } from '@chess-battler/sim';
import type { Family, SynergyDef } from '@chess-battler/sim';

// Раздел 2 документа. Считаются фигуры на поле, каждая копия отдельно; бонусы 2 и 4 суммируются.

export const SYNERGIES: readonly SynergyDef[] = [
  {
    family: 'legion',
    tiers: [
      {
        count: 2,
        name: 'Строй',
        description: '+1 броня за каждого соседнего союзника из Легиона, максимум +2.',
        effect: { kind: 'formation', armorPerNeighbor: 1, max: 2 },
      },
      {
        count: 4,
        name: 'Повышение',
        description:
          'Легион, дошедший до последнего ряда врага, один раз за бой получает +4 HP, +2 ATK и атаку по всем 8 соседним клеткам.',
        effect: { kind: 'promotion', hp: 4, atk: 2, attack: steps([...ORTHOGONAL, ...DIAGONAL]) },
      },
    ],
  },
  {
    family: 'riders',
    tiers: [
      {
        count: 2,
        name: 'Натиск',
        description: 'Первая атака каждого Всадника в бою наносит ×2 урона.',
        effect: { kind: 'firstStrike', multiplier: 2 },
      },
      {
        count: 4,
        name: 'Прорыв',
        description: 'После хода-прыжка Всадник толкает на 1 всех врагов в соседних клетках.',
        effect: { kind: 'breakthrough', power: 1 },
      },
    ],
  },
  {
    family: 'mystics',
    tiers: [
      {
        count: 2,
        name: 'Благословение',
        description:
          'В начале каждого 3-го такта каждый Мистик лечит союзников по диагонали (1 клетка) на 2.',
        effect: { kind: 'periodicHeal', every: 3, amount: 2 },
      },
      {
        count: 4,
        name: 'Проклятие',
        description: 'Каждая атака Мистика снимает с цели 1 броню до конца боя.',
        effect: { kind: 'curse', armor: 1 },
      },
    ],
  },
  {
    family: 'guards',
    tiers: [
      {
        count: 2,
        name: 'Сокрушение',
        description: '+1 к силе толчка у Стражей.',
        effect: { kind: 'pushBonus', amount: 1 },
      },
      {
        count: 4,
        name: 'Стена',
        description:
          'Фигура, толкнутая Стражем в другую фигуру или край, оглушается на 1 такт, а урон столкновения по ней +2.',
        effect: { kind: 'wall', collisionBonus: 2 },
      },
    ],
  },
];

export const FAMILY_NAMES: Readonly<Record<Family, string>> = {
  legion: 'Легион',
  riders: 'Всадники',
  mystics: 'Мистики',
  guards: 'Стражи',
};
