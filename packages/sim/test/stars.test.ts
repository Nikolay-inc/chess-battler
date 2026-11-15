import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, scaleTenths, simulate, starScaledDef } from '../src';
import { at, def, dummy } from './helpers';

describe('звёзды', () => {
  it('округление до ближайшего целого, половина вверх, без float', () => {
    expect(scaleTenths(7, 18)).toBe(13); // 12,6
    expect(scaleTenths(3, 16)).toBe(5); // 4,8
    expect(scaleTenths(5, 15)).toBe(8); // 7,5
    expect(scaleTenths(3, 25)).toBe(8); // 7,5
    expect(scaleTenths(9, 10)).toBe(9);
  });

  it('★2/★3 масштабируют HP, ATK и числа способностей; толчок и инициатива — без изменений', () => {
    const d = def({
      hp: 7,
      atk: 3,
      push: 2,
      initiative: 4,
      abilities: [
        { kind: 'heal', amount: 2 },
        { kind: 'rage', atkPerHit: 1, max: 3 },
      ],
    });
    const s2 = starScaledDef(d, 2, DEFAULT_RULES);
    const s3 = starScaledDef(d, 3, DEFAULT_RULES);
    expect([s2.hp, s2.atk, s2.push, s2.initiative]).toEqual([13, 5, 2, 4]);
    expect([s3.hp, s3.atk]).toEqual([21, 8]);
    expect(s2.abilities).toEqual([
      { kind: 'heal', amount: 3 },
      { kind: 'rage', atkPerHit: 1, max: 3 },
    ]);
    expect(s3.abilities![0]).toEqual({ kind: 'heal', amount: 4 });
  });

  it('звёзды фигуры попадают в бой и в снимок', () => {
    const r = simulate({
      units: [{ ...at(def({ hp: 10 }), 'A', 0, 0), stars: 3 }, at(dummy(), 'B', 4, 5)],
    });
    expect(r.initial[0]).toMatchObject({ stars: 3, hp: 30, maxHp: 30 });
  });
});
