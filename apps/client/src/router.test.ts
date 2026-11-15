import { describe, expect, it } from 'vitest';
import { parseRoute } from './router';

describe('маршруты', () => {
  it('разбирает hash, неизвестное и пустое — на главную', () => {
    expect(parseRoute('#/collection')).toBe('collection');
    expect(parseRoute('#/settings?x=1')).toBe('settings');
    expect(parseRoute('#play')).toBe('play');
    expect(parseRoute('')).toBe('home');
    expect(parseRoute('#/nope')).toBe('home');
  });
});
