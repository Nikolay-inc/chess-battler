import type { RunConfig, RunState } from '@chess-battler/sim';

export const STORAGE_KEY = 'chess-battler.run.v1';

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStars = (v: unknown) => v === 1 || v === 2 || v === 3;

/**
 * Разбор сохранения. null — сохранения нет, оно битое или не подходит
 * к текущему контенту (другая версия, фигура пропала из каталога и т.п.).
 */
export function parseRun(json: string | null, cfg: RunConfig): RunState | null {
  if (!json) return null;
  let s: Partial<RunState>;
  try {
    s = JSON.parse(json) as Partial<RunState>;
  } catch {
    return null;
  }
  const known = new Set(cfg.catalog.map((u) => u.id));
  const unitOk = (u: unknown): boolean => {
    const o = u as { uid?: unknown; unit?: unknown; stars?: unknown };
    return (
      !!o && isInt(o.uid) && typeof o.unit === 'string' && known.has(o.unit) && isStars(o.stars)
    );
  };
  const ok =
    s &&
    s.version === 1 &&
    [s.seed, s.rng, s.round, s.lives, s.wins, s.losses, s.gold, s.nextUid].every(isInt) &&
    (s.status === 'shop' || s.status === 'won' || s.status === 'lost') &&
    typeof s.frozen === 'boolean' &&
    Array.isArray(s.shop) &&
    s.shop.length === cfg.shopSlots &&
    s.shop.every((id) => id === null || (typeof id === 'string' && known.has(id))) &&
    Array.isArray(s.bench) &&
    s.bench.length === cfg.benchSlots &&
    s.bench.every((b) => b === null || unitOk(b)) &&
    Array.isArray(s.board) &&
    s.board.every((b) => unitOk(b) && isInt(b.x) && isInt(b.y)) &&
    Array.isArray(s.history);
  return ok ? (s as RunState) : null;
}

/** Хранилище может быть недоступно (приватный режим) — тогда просто не сохраняем. */
export function loadRun(cfg: RunConfig): RunState | null {
  try {
    return parseRun(localStorage.getItem(STORAGE_KEY), cfg);
  } catch {
    return null;
  }
}

export function saveRun(s: RunState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Квота или запрет хранилища — игра продолжается без сохранения.
  }
}
