import type { BattleEvent, BattleResult, Side } from './types';

/** Одно действие-удар с его последствиями — кандидат в «лучший момент». */
export interface BattleMoment {
  readonly tick: number;
  /** Кто бил. */
  readonly unit: number;
  readonly side: Side;
  /** Основная цель удара. */
  readonly target: number;
  /** Урон по врагам за действие (удар + столкновения). */
  readonly damage: number;
  /** Сколько врагов погибло за действие. */
  readonly kills: number;
  /** Длина цепочки толчков: 0 — без толчка, 1 — обычный толчок, 2+ — цепочка. */
  readonly chain: number;
  readonly score: number;
}

export interface BattleSummary {
  readonly survivors: Readonly<Record<Side, { readonly alive: number; readonly total: number }>>;
  /** Лучший удар стороны perspective (или вообще, если сторона не указана). */
  readonly best: BattleMoment | null;
}

export const MOMENT_WEIGHTS = { damage: 1, kill: 5, chainLink: 3 } as const;

export function scoreMoment(m: Pick<BattleMoment, 'damage' | 'kills' | 'chain'>): number {
  return (
    m.damage * MOMENT_WEIGHTS.damage +
    m.kills * MOMENT_WEIGHTS.kill +
    Math.max(0, m.chain - 1) * MOMENT_WEIGHTS.chainLink
  );
}

/** Все удары боя в порядке лога. */
export function battleMoments(result: BattleResult): BattleMoment[] {
  const sideOf = (id: number): Side => result.initial[id]!.side;
  const moments: BattleMoment[] = [];
  let tick = 0;
  let current: { unit: number; target: number; events: BattleEvent[] } | null = null;

  const flush = () => {
    if (!current) return;
    const side = sideOf(current.unit);
    let damage = 0;
    let kills = 0;
    let chain = 0;
    for (const e of current.events) {
      if (e.type === 'damage' && sideOf(e.unit) !== side) damage += e.amount;
      if (e.type === 'death' && sideOf(e.unit) !== side) kills++;
      if (e.type === 'push' || e.type === 'collision') chain = Math.max(chain, e.depth + 1);
    }
    const base = { damage, kills, chain };
    moments.push({
      tick,
      unit: current.unit,
      side,
      target: current.target,
      ...base,
      score: scoreMoment(base),
    });
    current = null;
  };

  for (const e of result.events) {
    if (e.type === 'tick' || e.type === 'move' || e.type === 'end') {
      flush();
      if (e.type === 'tick') tick = e.tick;
    } else if (e.type === 'attack') {
      flush();
      current = { unit: e.unit, target: e.target, events: [] };
    } else if (current) {
      current.events.push(e);
    }
  }
  flush();
  return moments;
}

/** Сводка для экрана итога: выжившие и лучший момент. */
export function analyzeBattle(result: BattleResult, perspective?: Side): BattleSummary {
  const count = (side: Side) => ({
    alive: result.final.filter((u) => u.side === side && u.hp > 0).length,
    total: result.initial.filter((u) => u.side === side).length,
  });
  let best: BattleMoment | null = null;
  for (const m of battleMoments(result)) {
    if (perspective && m.side !== perspective) continue;
    if (!best || m.score > best.score) best = m; // при равенстве — более ранний
  }
  return { survivors: { A: count('A'), B: count('B') }, best };
}
