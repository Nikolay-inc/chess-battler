import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, createSetup, simulate, validateSetup } from '@chess-battler/sim';
import type { Family } from '@chess-battler/sim';
import {
  DEMO_ARMY_A,
  DEMO_ARMY_B,
  RUN_CONFIG,
  SYNERGIES,
  UNIT_LIST,
  getUnit,
  resolveArmy,
} from '../src';
import { createRun } from '@chess-battler/sim';

describe('стартовые фигуры', () => {
  const families: Family[] = ['legion', 'riders', 'mystics', 'guards'];

  it('16 фигур: в каждой семье по 4 — две за 1 золото, одна за 2, одна за 3', () => {
    expect(UNIT_LIST).toHaveLength(16);
    for (const f of families) {
      const costs = UNIT_LIST.filter((u) => u.family === f).map((u) => u.cost);
      expect(costs.sort()).toEqual([1, 1, 2, 3]);
    }
  });

  it('у каждой семьи синергия на 2 и 4 фигуры', () => {
    expect(SYNERGIES.map((s) => s.family).sort()).toEqual([...families].sort());
    for (const s of SYNERGIES) expect(s.tiers.map((t) => t.count)).toEqual([2, 4]);
  });

  it('у фигур со способностями есть описание для интерфейса', () => {
    for (const u of UNIT_LIST) {
      if (u.abilities?.length) expect(u.description, u.id).toBeTruthy();
    }
  });

  it('конфиг забега валиден', () => {
    expect(() => createRun(1, RUN_CONFIG)).not.toThrow();
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
    expect(units.length).toBeLessThanOrEqual(30);
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
  it('ставятся на поле и дают законченный бой с синергиями', () => {
    const r = simulate(
      createSetup(resolveArmy(DEMO_ARMY_A), resolveArmy(DEMO_ARMY_B), DEFAULT_RULES, SYNERGIES),
    );
    expect(r.events.at(-1)?.type).toBe('end');
    expect(r.events.some((e) => e.type === 'collision')).toBe(true);
  });
});
