import { describe, expect, it } from 'vitest';
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
});
