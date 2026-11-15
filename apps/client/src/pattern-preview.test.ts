import { describe, expect, it } from 'vitest';
import { getUnit } from '@chess-battler/content';
import { patternPreview } from './pattern-preview';

const draw = (id: string) =>
  patternPreview(getUnit(id))
    .map((row) =>
      row.map((c) => ({ self: 'S', move: 'm', attack: 'a', both: 'B', empty: '.' })[c]).join(''),
    )
    .join('\n');

describe('схема хода и атаки', () => {
  it('Легионер: ходит вперёд и вбок, бьёт вперёд по диагонали', () => {
    expect(draw('legionnaire')).toBe(['.....', '.ama.', '.mSm.', '.....', '.....'].join('\n'));
  });

  it('Всадник: ход и удар буквой «Г»', () => {
    expect(draw('rider')).toBe(['.B.B.', 'B...B', '..S..', 'B...B', '.B.B.'].join('\n'));
  });

  it('Часовой: ход на 1 по прямой, удар по прямой на 2', () => {
    expect(draw('sentry')).toBe(['..a..', '..B..', 'aBSBa', '..B..', '..a..'].join('\n'));
  });
});
