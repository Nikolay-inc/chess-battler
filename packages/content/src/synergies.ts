import { DIAGONAL, ORTHOGONAL, steps } from '@chess-battler/sim';
import type { SynergyDef } from '@chess-battler/sim';

// Раздел 2 документа. Считаются фигуры на поле, каждая копия отдельно; бонусы 2 и 4 суммируются.
// Названия и описания ступеней — в locales/*.json (synergy.<семья>.<порог>).

export const SYNERGIES: readonly SynergyDef[] = [
  {
    family: 'legion',
    tiers: [
      {
        count: 2,
        effect: { kind: 'formation', armorPerNeighbor: 1, max: 2 },
      },
      {
        count: 4,
        effect: { kind: 'promotion', hp: 4, atk: 2, attack: steps([...ORTHOGONAL, ...DIAGONAL]) },
      },
    ],
  },
  {
    family: 'riders',
    tiers: [
      {
        count: 2,
        effect: { kind: 'firstStrike', multiplier: 2 },
      },
      {
        count: 4,
        effect: { kind: 'breakthrough', power: 1 },
      },
    ],
  },
  {
    family: 'mystics',
    tiers: [
      {
        count: 2,
        effect: { kind: 'periodicHeal', every: 3, amount: 2 },
      },
      {
        count: 4,
        effect: { kind: 'curse', armor: 1 },
      },
    ],
  },
  {
    family: 'guards',
    tiers: [
      {
        count: 2,
        effect: { kind: 'pushBonus', amount: 1 },
      },
      {
        count: 4,
        effect: { kind: 'wall', collisionBonus: 2 },
      },
    ],
  },
];
