import { describe, expect, it } from 'vitest';
import { LOCALES, detectLocale, setLocale, t, unitDesc, unitName } from './index';
import bg from './bg.json';
import en from './en.json';
import ru from './ru.json';
import uk from './uk.json';
import { DEFAULT_RULES, starScaledDef } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';

type Node = string | { [k: string]: Node };
const DICTS: Record<string, Node> = { ru, uk, bg, en };
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (n: Node) =>
  typeof n === 'object' && 'other' in n && Object.keys(n).every((k) => PLURAL.has(k));

/** Листья словаря: ключ → строка или формы множественного числа. */
function leaves(node: Node, prefix = ''): Map<string, Node> {
  const out = new Map<string, Node>();
  if (typeof node === 'string' || isPlural(node)) return out.set(prefix, node);
  for (const [k, v] of Object.entries(node)) {
    for (const [kk, vv] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(kk, vv);
  }
  return out;
}
const placeholders = (n: Node): string[] =>
  [
    ...new Set(
      (typeof n === 'string' ? [n] : Object.values(n as Record<string, string>)).flatMap((s) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!),
      ),
    ),
  ].sort();

describe('переводы интерфейса', () => {
  const base = leaves(ru);

  it.each(LOCALES)('%s: те же ключи и плейсхолдеры, что в русском, без пустых строк', (loc) => {
    const dict = leaves(DICTS[loc]!);
    expect([...dict.keys()].sort()).toEqual([...base.keys()].sort());
    for (const [key, value] of dict) {
      expect(placeholders(value), `${loc}: ${key}`).toEqual(placeholders(base.get(key)!));
      const strings =
        typeof value === 'string' ? [value] : Object.values(value as Record<string, string>);
      for (const s of strings) expect(s.trim(), `${loc}: ${key}`).not.toBe('');
    }
  });

  it.each(LOCALES)('%s: у множественного числа есть все формы языка', (loc) => {
    const needed = new Intl.PluralRules(loc).resolvedOptions().pluralCategories;
    for (const [key, value] of leaves(DICTS[loc]!)) {
      if (typeof value === 'string') continue;
      for (const cat of needed) expect(Object.keys(value), `${loc}: ${key}`).toContain(cat);
    }
  });
});

describe('t()', () => {
  it('подстановки и множественное число по правилам языка', () => {
    setLocale('ru');
    expect(t('play.round', { round: 3 })).toBe('Раунд 3');
    expect([1, 2, 5, 21].map((n) => t('count.ticks', { n }))).toEqual([
      '1 такт',
      '2 такта',
      '5 тактов',
      '21 такт',
    ]);
    setLocale('uk');
    expect([1, 3, 11].map((n) => t('count.ticks', { n }))).toEqual([
      '1 такт',
      '3 такти',
      '11 тактів',
    ]);
    setLocale('en');
    expect([1, 2].map((n) => t('count.ticks', { n }))).toEqual(['1 tick', '2 ticks']);
    setLocale('ru');
  });

  it('описание способности — с числами с учётом звёзд', () => {
    setLocale('ru');
    const oracle = getUnit('oracle');
    expect(unitName('oracle')).toBe('Оракул');
    expect(unitDesc(oracle)).toContain('щит 6');
    expect(unitDesc(starScaledDef(oracle, 3, DEFAULT_RULES))).toContain('щит 12');
    setLocale('bg');
    expect(unitDesc(starScaledDef(oracle, 2, DEFAULT_RULES))).toContain('щит 9');
    setLocale('ru');
  });
});

describe('определение языка', () => {
  it('Telegram → браузер → английский', () => {
    expect(detectLocale(['de-DE', 'uk-UA'])).toBe('uk');
    expect(detectLocale(['bg'], undefined)).toBe('bg');
    expect(detectLocale(['ru-RU'], 'en')).toBe('en');
    expect(detectLocale(['fr-FR', 'de'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('строки только в словарях', () => {
  it('ключи data-i18n в разметке существуют', async () => {
    const html = (await import('../../index.html?raw')).default as string;
    const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    const base = leaves(ru);
    for (const k of keys) expect(base.has(k), k).toBe(true);
  });

  it('в коде клиента нет текста на русском вне комментариев (всё через i18n)', () => {
    const files = import.meta.glob(['../**/*.ts', '!../**/*.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(15);
    const offenders: string[] = [];
    for (const [file, src] of Object.entries(files)) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        if (/[А-Яа-яЁёІіЇїЄєҐґ]/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
