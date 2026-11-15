import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, createSetup, simulate, validateSetup } from '@chess-battler/sim';
import type { Family } from '@chess-battler/sim';
import {
  CONTENT_TEXTS,
  DEMO_ARMY_A,
  DEMO_ARMY_B,
  RUN_CONFIG,
  SYNERGIES,
  UNIT_LIST,
  getUnit,
  resolveArmy,
  synergyTextParams,
  unitTextParams,
} from '../src';
import type { ContentTexts } from '../src';
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

  it('тексты на всех языках: названия есть, плейсхолдеры совпадают с числами способностей', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [locale, texts] of Object.entries(CONTENT_TEXTS) as [string, ContentTexts][]) {
      for (const u of UNIT_LIST) {
        const t = texts.unit[u.id as keyof typeof texts.unit];
        expect(t?.name, `${locale}.${u.id}`).toBeTruthy();
        const params = Object.keys(unitTextParams(u));
        for (const p of placeholders(t.desc))
          expect(params, `${locale}.${u.id}: {${p}}`).toContain(p);
        // У фигур со способностью или устойчивостью описание обязательно.
        if (u.abilities?.length || u.pushResist) expect(t.desc, `${locale}.${u.id}`).toBeTruthy();
        // Плейсхолдеры одинаковы во всех языках.
        expect(placeholders(t.desc)).toEqual(
          placeholders(CONTENT_TEXTS.ru.unit[u.id as keyof typeof texts.unit].desc),
        );
      }
      for (const syn of SYNERGIES) {
        expect(texts.family[syn.family], `${locale}.family.${syn.family}`).toBeTruthy();
        for (const tier of syn.tiers) {
          const fam = texts.synergy[syn.family] as Record<string, { name: string; desc: string }>;
          const t = fam[String(tier.count)]!;
          expect(t?.name, `${locale}.${syn.family}.${tier.count}`).toBeTruthy();
          const params = Object.keys(synergyTextParams(tier.effect));
          for (const p of placeholders(t.desc))
            expect(params, `${locale}.${syn.family}.${tier.count}: {${p}}`).toContain(p);
        }
      }
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
