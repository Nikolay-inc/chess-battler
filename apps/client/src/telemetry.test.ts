import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '@chess-battler/content';
import { applyAction, createRun } from '@chess-battler/sim';
import { feedbackRow, snapshotRow } from './telemetry';

describe('строки телеметрии', () => {
  it('снимок армии: раунд, победы/поражения до боя, итог, фигуры с позициями и звёздами', () => {
    let s = createRun(0xabc, RUN_CONFIG);
    s = applyAction(s, { type: 'buy', slot: 0 }, RUN_CONFIG);
    s = applyAction(
      s,
      { type: 'move', from: { area: 'bench', index: 0 }, to: { area: 'board', x: 2, y: 1 } },
      RUN_CONFIG,
    );
    const row = snapshotRow(s, 'loss');
    expect(row).toEqual({
      run_id: 'abc',
      round: 1,
      wins: 0,
      losses: 0,
      outcome: 'loss',
      units: [{ unit: s.board[0]!.unit, stars: 1, x: 2, y: 1 }],
    });
  });

  it('опрос: оценка 1–5, пустой текст — null, длинный обрезается', () => {
    const s = createRun(1, RUN_CONFIG);
    expect(feedbackRow(s, 5, '   ')).toMatchObject({ rating: 5, annoyed: null, rounds: 0 });
    expect((feedbackRow(s, 3, 'а'.repeat(1500)).annoyed as string).length).toBe(1000);
    expect(() => feedbackRow(s, 0, '')).toThrow();
    expect(() => feedbackRow(s, 6, '')).toThrow();
  });
});
