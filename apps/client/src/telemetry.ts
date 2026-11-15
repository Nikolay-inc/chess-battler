import type { RoundOutcome, RunState } from '@chess-battler/sim';
import type { Row } from './analytics';

/** Id забега для аналитики: seed в hex (случайный 32-битный на каждый забег). */
export const runId = (s: RunState): string => s.seed.toString(16);

export const FEEDBACK_MAX = 1000;

/** Снимок армии игрока перед боем раунда — будущий пул призраков. */
export function snapshotRow(before: RunState, outcome: RoundOutcome): Row {
  return {
    run_id: runId(before),
    round: before.round,
    wins: before.wins,
    losses: before.losses,
    outcome,
    units: before.board.map((b) => ({ unit: b.unit, stars: b.stars, x: b.x, y: b.y })),
  };
}

/** Ответ на опрос в конце забега. */
export function feedbackRow(s: RunState, rating: number, annoyed: string): Row {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RangeError('Оценка должна быть от 1 до 5');
  }
  const text = annoyed.trim().slice(0, FEEDBACK_MAX);
  return {
    run_id: runId(s),
    rating,
    annoyed: text === '' ? null : text,
    run_result: s.status === 'won' ? 'won' : 'lost',
    wins: s.wins,
    rounds: s.history.length,
  };
}
