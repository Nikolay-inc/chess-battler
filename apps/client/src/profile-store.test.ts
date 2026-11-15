import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '@chess-battler/content';
import { applyAction, createRun } from '@chess-battler/sim';
import { profileStats, runRecord, validNickname } from './profile-store';
import type { RunRecord } from './profile-store';

const rec = (over: Partial<RunRecord>): RunRecord => ({
  run_id: 'r',
  finished_at: '2026-11-16T10:00:00Z',
  result: 'lost',
  wins: 0,
  losses: 3,
  rounds: 3,
  families: {},
  app_version: 'test',
  ...over,
});

describe('профиль', () => {
  it('ник: 2–20 символов, любые буквы, пробелы схлопываются', () => {
    expect(validNickname('  Коля  ')).toBe('Коля');
    expect(validNickname('Ivan  the   Rook')).toBe('Ivan the Rook');
    expect(validNickname('Мирослава_2')).toBe('Мирослава_2');
    expect(validNickname('x')).toBeNull();
    expect(validNickname('a'.repeat(21))).toBeNull();
    expect(validNickname('<script>')).toBeNull();
  });

  it('статистика: забеги, победы, лучший результат, любимая семья', () => {
    const stats = profileStats([
      rec({ run_id: '1', wins: 4, families: { riders: 3, guards: 1 } }),
      rec({ run_id: '2', wins: 10, result: 'won', families: { guards: 4 } }),
      rec({ run_id: '3', wins: 2, families: { guards: 1, riders: 2 } }),
    ]);
    expect(stats).toMatchObject({ runs: 3, wins: 16, favorite: 'guards' });
    expect(stats.best?.run_id).toBe('2');
    expect(profileStats([])).toEqual({ runs: 0, wins: 0, best: null, favorite: null });
  });

  it('запись забега: итог и семьи фигур на поле', () => {
    let s = createRun(1, RUN_CONFIG);
    s = applyAction(s, { type: 'buy', slot: 0 }, RUN_CONFIG);
    s = applyAction(
      s,
      { type: 'move', from: { area: 'bench', index: 0 }, to: { area: 'board', x: 2, y: 2 } },
      RUN_CONFIG,
    );
    for (let i = 0; i < 3; i++)
      s = applyAction(s, { type: 'roundEnd', outcome: 'loss' }, RUN_CONFIG);
    const r = runRecord(s, 'abc', '0.3.0+test', new Date('2026-11-16T12:00:00Z'));
    expect(r).toMatchObject({ run_id: 'abc', result: 'lost', wins: 0, losses: 3, rounds: 3 });
    expect(Object.values(r.families)).toEqual([1]);
  });
});
