import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '@chess-battler/content';
import { applyAction, createRun } from '@chess-battler/sim';
import { parseRun } from './storage';

describe('сохранение забега', () => {
  it('состояние переживает сохранение и загрузку', () => {
    let s = createRun(5, RUN_CONFIG);
    s = applyAction(s, { type: 'buy', slot: 0 }, RUN_CONFIG);
    s = applyAction(
      s,
      { type: 'move', from: { area: 'bench', index: 0 }, to: { area: 'board', x: 2, y: 2 } },
      RUN_CONFIG,
    );
    expect(parseRun(JSON.stringify(s), RUN_CONFIG)).toEqual(s);
  });

  it('битое, чужое или устаревшее сохранение игнорируется', () => {
    const s = createRun(5, RUN_CONFIG);
    expect(parseRun(null, RUN_CONFIG)).toBeNull();
    expect(parseRun('{oops', RUN_CONFIG)).toBeNull();
    expect(parseRun(JSON.stringify({ ...s, version: 2 }), RUN_CONFIG)).toBeNull();
    expect(
      parseRun(JSON.stringify({ ...s, shop: ['queen', null, null, null, null] }), RUN_CONFIG),
    ).toBeNull();
    expect(parseRun(JSON.stringify({ ...s, bench: [null] }), RUN_CONFIG)).toBeNull();
    expect(
      parseRun(
        JSON.stringify({ ...s, board: [{ uid: 1, unit: 'rider', stars: 4, x: 0, y: 0 }] }),
        RUN_CONFIG,
      ),
    ).toBeNull();
  });
});
