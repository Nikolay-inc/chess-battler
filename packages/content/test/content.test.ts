import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, createSetup, simulate, validateSetup } from '@chess-battler/sim';
import type { Family } from '@chess-battler/sim';
import { DEMO_ARMY_A, DEMO_ARMY_B, UNIT_LIST, getUnit, resolveArmy } from '../src';

describe('стартовые фигуры', () => {
  it('8 фигур, по 2 на каждую семью', () => {
    expect(UNIT_LIST).toHaveLength(8);
    const families: Family[] = ['legion', 'riders', 'mystics', 'guards'];
    for (const f of families) {
      expect(UNIT_LIST.filter((u) => u.family === f)).toHaveLength(2);
    }
  });

  it('id уникальны и в латинице', () => {
    const ids = UNIT_LIST.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('статы проходят валидацию sim', () => {
    const units = UNIT_LIST.map((def, i) => ({
      def,
      side: 'A' as const,
      pos: { x: i % 5, y: Math.floor(i / 5) },
    }));
    expect(() => validateSetup({ units }, DEFAULT_RULES)).not.toThrow();
    for (const u of UNIT_LIST) {
      expect(u.move.dirs.length).toBeGreaterThan(0);
      expect(u.attack.dirs.length).toBeGreaterThan(0);
    }
  });

  it('getUnit бросает на неизвестный id', () => {
    expect(() => getUnit('queen')).toThrow();
  });
});

describe('демо-армии', () => {
  it('ставятся на поле и дают законченный бой', () => {
    const r = simulate(createSetup(resolveArmy(DEMO_ARMY_A), resolveArmy(DEMO_ARMY_B)));
    expect(r.events.at(-1)?.type).toBe('end');
    expect(r.events.some((e) => e.type === 'collision')).toBe(true);
  });
});
