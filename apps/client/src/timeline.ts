import type { BattleEvent } from '@chess-battler/sim';

/** Действие одной фигуры: move или attack со всеми последствиями (урон, толчки, смерти). */
export interface ActionGroup {
  readonly events: readonly BattleEvent[];
}

export interface TickGroup {
  readonly tick: number;
  readonly actions: readonly ActionGroup[];
}

/** События, с которых начинается действие фигуры. */
const ACTION_START = new Set<BattleEvent['type']>(['attack', 'move', 'support', 'stunned']);

/**
 * Разбивает плоский лог боя на такты и действия — единицы для анимации и темпа.
 * События до первого такта (начало боя: Клич, Предвидение) — такт 0.
 * События начала такта до первого действия (Благословение) — отдельное действие.
 */
export function groupByTick(events: readonly BattleEvent[]): TickGroup[] {
  const ticks: { tick: number; actions: BattleEvent[][] }[] = [];
  for (const e of events) {
    if (e.type === 'tick') {
      ticks.push({ tick: e.tick, actions: [] });
      continue;
    }
    if (e.type === 'end') continue;
    if (ticks.length === 0) ticks.push({ tick: 0, actions: [] });
    const current = ticks.at(-1)!;
    if (ACTION_START.has(e.type) || current.actions.length === 0) {
      current.actions.push([e]);
    } else {
      current.actions.at(-1)!.push(e);
    }
  }
  return ticks.map((t) => ({ tick: t.tick, actions: t.actions.map((events) => ({ events })) }));
}

/** Все фигуры, которых касается действие (действующая, цели, толкаемые, задетые). */
export function involvedUnits(action: ActionGroup): number[] {
  const ids = new Set<number>();
  for (const e of action.events) {
    if ('unit' in e) ids.add(e.unit);
    if (e.type === 'attack') ids.add(e.target);
    if (e.type === 'collision' && e.other !== null) ids.add(e.other);
    if ((e.type === 'heal' || e.type === 'shield' || e.type === 'buff') && e.by !== null) {
      ids.add(e.by);
    }
  }
  return [...ids];
}

export const PACING = {
  /** Минимальная длительность такта на ×1, мс. */
  minTickMs: 600,
  /** Ориентир длительности такта на ×1, мс: в него стараемся уложить каскад действий. */
  tickBudgetMs: 1100,
  /** Примерная длительность одного действия, мс (для расчёта шага каскада). */
  actionMs: 450,
  minStaggerMs: 60,
  maxStaggerMs: 320,
} as const;

/** Задержка между стартами действий внутри такта: чем больше фигур, тем плотнее каскад. */
export function staggerMs(actions: number): number {
  if (actions <= 1) return 0;
  const raw = (PACING.tickBudgetMs - PACING.actionMs) / (actions - 1);
  return Math.round(Math.min(PACING.maxStaggerMs, Math.max(PACING.minStaggerMs, raw)));
}
