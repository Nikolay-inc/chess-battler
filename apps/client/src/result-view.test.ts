import { describe, expect, it } from 'vitest';
import type { BattleMoment } from '@chess-battler/sim';
import { describeMoment } from './result-view';

const names = ['Таран', 'Легионер'];
const base: BattleMoment = {
  tick: 3,
  unit: 0,
  side: 'A',
  target: 1,
  damage: 9,
  kills: 1,
  chain: 3,
  score: 20,
};

describe('describeMoment', () => {
  it('описывает цепочку, урон и убийства', () => {
    expect(describeMoment(base, (id) => names[id]!)).toBe(
      'Таран → Легионер: цепочка ×3, 9 урона, разбито фигур: 1',
    );
  });

  it('без цепочки и убийств — только урон', () => {
    expect(describeMoment({ ...base, chain: 1, kills: 0, damage: 1 }, (id) => names[id]!)).toBe(
      'Таран → Легионер: 1 урон',
    );
  });
});
