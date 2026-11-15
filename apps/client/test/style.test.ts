// Проверка style.css на дизайн-токены. Читаем файл с диска: Vitest отдаёт CSS-импорты
// (даже ?raw) пустой строкой, поэтому прежняя проверка через импорт ничего не проверяла.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssVariables } from '../src/theme/tokens';

/** Переменные, которые задаёт код клиента прямо на элементе (не токены). */
const LOCAL_VARS = new Set(['--arrow-x']);

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

describe('style.css', () => {
  it('файл действительно прочитан', () => {
    expect(css.length).toBeGreaterThan(5000);
  });

  it('использует только существующие токены (и переменные Telegram SDK --tg-*)', () => {
    const vars = new Set(Object.keys(cssVariables()));
    const used = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!))];
    expect(used.length).toBeGreaterThan(50);
    expect(
      used.filter((v) => !vars.has(v) && !LOCAL_VARS.has(v) && !v.startsWith('--tg-')),
    ).toEqual([]);
  });

  it('цвета — только через токены: ни #hex, ни rgb(…) с числами', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(css.match(/rgba?\(\s*\d/g)).toBeNull();
  });
});
