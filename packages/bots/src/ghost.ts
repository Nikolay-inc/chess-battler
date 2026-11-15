import { RUN_CONFIG, SYNERGIES } from '@chess-battler/content';
import {
  DEFAULT_RULES,
  RunError,
  applyAction,
  boardCap,
  createRng,
  createRun,
  runArmy,
  unitCost,
} from '@chess-battler/sim';
import type {
  ArmySlot,
  BoardUnit,
  Family,
  OwnedUnit,
  Rng,
  Rules,
  RunConfig,
  RunState,
  Stars,
  SynergyDef,
  UnitDef,
} from '@chess-battler/sim';

export interface GhostOptions {
  /** Номер раунда, под который собирается армия (1..). */
  readonly round: number;
  /** 0 — случайные покупки, 1 — жадный расчёт без шума. */
  readonly difficulty: number;
  readonly seed: number;
  readonly config?: RunConfig;
  readonly synergies?: readonly SynergyDef[];
  readonly rules?: Rules;
}

export interface Ghost {
  readonly army: ArmySlot[];
  /** Состояние «забега» бота после последней фазы магазина. */
  readonly state: RunState;
  /** Любимая семья бота (его «стиль»). */
  readonly style: Family;
}

const FAMILIES: readonly Family[] = ['legion', 'riders', 'mystics', 'guards'];
/** Ряд по роли (локальный y): 2 — передний, 0 — задний. */
const ROLE_ROW: Record<Family, number> = { guards: 2, legion: 2, riders: 1, mystics: 0 };
const STAR_POWER: Record<Stars, number> = { 1: 10, 2: 32, 3: 90 };

interface Ctx {
  readonly rng: Rng;
  readonly cfg: RunConfig;
  readonly synergyCounts: readonly number[];
  readonly style: Family;
  /** Шум оценок в процентах. */
  readonly noise: number;
  readonly maxRerolls: number;
}

const owned = (s: RunState): OwnedUnit[] => [
  ...s.board,
  ...s.bench.filter((b): b is OwnedUnit => b !== null),
];

function defOf(cfg: RunConfig, id: string): UnitDef {
  return cfg.catalog.find((d) => d.id === id)!;
}

/** Сила фигуры в «очках»: цена × звёзды. */
function power(cfg: RunConfig, u: OwnedUnit): number {
  return unitCost(defOf(cfg, u.unit)) * STAR_POWER[u.stars];
}

function familyCount(cfg: RunConfig, units: readonly OwnedUnit[], f: Family): number {
  return units.filter((u) => defOf(cfg, u.unit).family === f).length;
}

/** Оценка покупки: сила + слияние + синергия + стиль, с seed-шумом. */
function buyScore(ctx: Ctx, s: RunState, id: string): number {
  const def = defOf(ctx.cfg, id);
  const mine = owned(s);
  const copies = mine.filter((u) => u.unit === id && u.stars === 1).length;
  const fam = familyCount(ctx.cfg, mine, def.family);
  let score = unitCost(def) * 10;
  if (copies === 2) score += 28;
  else if (copies === 1) score += 9;
  if (ctx.synergyCounts.includes(fam + 1)) score += 14;
  else score += Math.min(fam, 4) * 2;
  if (def.family === ctx.style) score += 7;
  const jitter = ctx.rng.int(-ctx.noise, ctx.noise);
  return Math.round((score * (100 + jitter)) / 100);
}

function tryApply(s: RunState, action: Parameters<typeof applyAction>[1], cfg: RunConfig) {
  try {
    return applyAction(s, action, cfg);
  } catch (e) {
    if (e instanceof RunError) return null;
    throw e;
  }
}

/** Одна фаза магазина: покупки, продажа слабых, перебросы. */
function shopPhase(ctx: Ctx, start: RunState): RunState {
  let s = start;
  let rerolls = 0;
  for (let step = 0; step < 40; step++) {
    const candidates = s.shop
      .map((id, slot) => (id ? { slot, id, score: buyScore(ctx, s, id) } : null))
      .filter((c): c is { slot: number; id: string; score: number } => c !== null)
      .filter((c) => unitCost(defOf(ctx.cfg, c.id)) <= s.gold)
      .sort((a, b) => b.score - a.score || a.slot - b.slot);
    const best = candidates[0];
    if (best) {
      const bought = tryApply(s, { type: 'buy', slot: best.slot }, ctx.cfg);
      if (bought) {
        s = bought;
        continue;
      }
      // Скамейка полна: продаём самую слабую фигуру скамейки, если покупка лучше.
      const weakest = s.bench
        .map((u, index) => (u ? { index, p: power(ctx.cfg, u) } : null))
        .filter((w): w is { index: number; p: number } => w !== null)
        .sort((a, b) => a.p - b.p || a.index - b.index)[0];
      if (weakest && best.score > weakest.p + 6) {
        s = applyAction(
          s,
          { type: 'sell', from: { area: 'bench', index: weakest.index } },
          ctx.cfg,
        );
        continue;
      }
    }
    if (rerolls < ctx.maxRerolls && s.gold >= ctx.cfg.rerollCost + 1) {
      s = applyAction(s, { type: 'reroll' }, ctx.cfg);
      rerolls++;
      continue;
    }
    break;
  }
  return arrange(ctx, s);
}

/** Расстановка: сильнейшие фигуры (с учётом синергий) на поле, по рядам ролей. */
function arrange(ctx: Ctx, s: RunState): RunState {
  const cap = boardCap(s.round, ctx.cfg);
  const mine = owned(s);
  const value = (u: OwnedUnit) => {
    const f = defOf(ctx.cfg, u.unit).family;
    const fam = familyCount(ctx.cfg, mine, f);
    return power(ctx.cfg, u) + (fam >= 2 ? 6 : 0) + (f === ctx.style ? 3 : 0);
  };
  const ranked = [...mine].sort((a, b) => value(b) - value(a) || a.uid - b.uid);
  const chosen = ranked.slice(0, cap);
  const rest = ranked.slice(cap);

  // Колонки: центр важнее краёв; небольшой seed-сдвиг, чтобы расстановки различались.
  const columns = [2, 1, 3, 0, 4];
  if (ctx.rng.int(0, 1) === 1) columns.reverse();
  const taken = new Set<string>();
  const board: BoardUnit[] = [];
  for (const u of chosen) {
    const want = ROLE_ROW[defOf(ctx.cfg, u.unit).family];
    const rows = [want, want === 2 ? 1 : want === 0 ? 1 : 2, want === 2 ? 0 : want === 0 ? 2 : 0];
    let placed = false;
    for (const y of rows) {
      for (const x of columns) {
        if (!placed && !taken.has(`${x},${y}`)) {
          taken.add(`${x},${y}`);
          board.push({ uid: u.uid, unit: u.unit, stars: u.stars, x, y });
          placed = true;
        }
      }
    }
  }
  const bench: (OwnedUnit | null)[] = Array.from({ length: ctx.cfg.benchSlots }, (_, i) => {
    const u = rest[i];
    return u ? { uid: u.uid, unit: u.unit, stars: u.stars } : null;
  });
  return { ...s, board, bench };
}

/**
 * Армия-«призрак» под номер раунда: бот проходит фазы магазина раундов 1..round
 * по правилам забега. Детерминирована по (round, difficulty, seed).
 */
export function generateGhost(opts: GhostOptions): Ghost {
  const cfg = opts.config ?? RUN_CONFIG;
  const synergies = opts.synergies ?? SYNERGIES;
  const difficulty = Math.max(0, Math.min(1, opts.difficulty));
  const rng = createRng(opts.seed ^ 0x5bd1e995);
  const style = FAMILIES[rng.int(0, FAMILIES.length - 1)]!;
  const ctx: Ctx = {
    rng,
    cfg,
    style,
    synergyCounts: [...new Set(synergies.flatMap((s) => s.tiers.map((t) => t.count)))],
    noise: Math.round(15 + 60 * (1 - difficulty)),
    maxRerolls: Math.round(3 * difficulty),
  };
  let s = createRun(opts.seed, cfg);
  for (let r = 1; r <= opts.round; r++) {
    s = shopPhase(ctx, s);
    if (r < opts.round)
      s = applyAction(s, { type: 'roundEnd', outcome: 'draw' }, cfg, opts.rules ?? DEFAULT_RULES);
  }
  return { army: runArmy(s, cfg), state: s, style };
}
