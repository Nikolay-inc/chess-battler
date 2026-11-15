import { describe, expect, it } from 'vitest';
import migration from '../../../supabase/migrations/20261116100000_payments.sql?raw';
import { COSMETICS, COSMETIC_KINDS, CONTENT_TEXTS, DEFAULT_COSMETICS } from '../src';

describe('косметика', () => {
  it('id уникальны, у каждого вида ровно один стандартный скин за 0', () => {
    const ids = COSMETICS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of COSMETIC_KINDS) {
      const free = COSMETICS.filter((c) => c.kind === kind && c.priceXtr === 0);
      expect(free.map((c) => c.id)).toEqual([DEFAULT_COSMETICS[kind]]);
    }
  });

  it('у каждого скина есть название на всех языках', () => {
    for (const [loc, texts] of Object.entries(CONTENT_TEXTS)) {
      for (const c of COSMETICS) {
        expect(
          (texts.cosmetic.item as Record<string, string>)[c.id],
          `${loc}.${c.id}`,
        ).toBeTruthy();
      }
    }
  });

  it('каталог совпадает с таблицей products в миграции (id, вид, цена)', () => {
    const rows = [...migration.matchAll(/\('([a-z0-9_]+)', '(board|frame|pushFx)', (\d+)\)/g)].map(
      (m) => `${m[1]}:${m[2]}:${m[3]}`,
    );
    expect(rows.sort()).toEqual(COSMETICS.map((c) => `${c.id}:${c.kind}:${c.priceXtr}`).sort());
  });
});
