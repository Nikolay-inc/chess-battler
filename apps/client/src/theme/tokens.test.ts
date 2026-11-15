import { describe, expect, it } from 'vitest';
import css from '../style.css?raw';
import { cssVariables, px, tokens } from './tokens';

describe('дизайн-токены', () => {
  it('цвета — #rrggbb, для каждого есть вариант в каналах RGB', () => {
    const vars = cssVariables();
    for (const [k, v] of Object.entries(tokens.color)) {
      expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(vars['--color-accent']).toBe('#f2c14e');
    expect(vars['--color-accent-rgb']).toBe('242 193 78');
    expect(vars['--color-side-a']).toBe('#4da3ff');
    expect(vars['--space-md']).toBe('12px');
    expect(px('sideB')).toBe(0xff6b5b);
  });

  it('style.css использует только существующие токены и не содержит цветов напрямую', () => {
    const vars = new Set(Object.keys(cssVariables()));
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!);
    const unknown = [...new Set(used)].filter((v) => !vars.has(v));
    expect(unknown).toEqual([]);
    // Цвета задаются только токенами: ни #hex, ни rgb(…) с числами.
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(css.match(/rgba?\(\s*\d/g)).toBeNull();
  });
});
