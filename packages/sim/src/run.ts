import { createRng } from './rng';
import type { ArmySlot } from './setup';
import { DEFAULT_RULES } from './types';
import type { Rules, Stars, UnitDef } from './types';

/** Параметры забега (данные из packages/content). */
export interface RunConfig {
  readonly lives: number;
  readonly winsToFinish: number;
  readonly goldPerRound: number;
  readonly rerollCost: number;
  /** Цена продажи за каждую ★1 внутри фигуры (★2 = 3 ×, ★3 = 9 ×). */
  readonly sellPerCopy: number;
  readonly shopSlots: number;
  readonly benchSlots: number;
  /** Лимит фигур на поле: индекс = раунд − 1, дальше — последнее значение. */
  readonly boardCaps: readonly number[];
  /** Шансы уровня в слоте магазина (веса для уровней 1, 2, 3) начиная с раунда fromRound. */
  readonly tierOdds: readonly {
    readonly fromRound: number;
    readonly weights: readonly [number, number, number];
  }[];
  /** Фигуры магазина; у каждой обязателен cost (= уровень 1..3). */
  readonly catalog: readonly UnitDef[];
}

export interface OwnedUnit {
  /** Уникальный id экземпляра в забеге. */
  readonly uid: number;
  readonly unit: string;
  readonly stars: Stars;
}

/** Фигура на поле в локальных координатах игрока (y=0 — задний ряд). */
export interface BoardUnit extends OwnedUnit {
  readonly x: number;
  readonly y: number;
}

export type RunStatus = 'shop' | 'won' | 'lost';
export type RoundOutcome = 'win' | 'loss' | 'draw';

/** Состояние забега. Только JSON-данные — сохраняется как есть. */
export interface RunState {
  readonly version: 1;
  readonly seed: number;
  /** Состояние ГПСЧ магазина. */
  readonly rng: number;
  readonly round: number;
  readonly lives: number;
  readonly wins: number;
  readonly losses: number;
  readonly gold: number;
  /** id фигур в слотах магазина; null — слот выкуплен. */
  readonly shop: readonly (string | null)[];
  readonly frozen: boolean;
  readonly bench: readonly (OwnedUnit | null)[];
  readonly board: readonly BoardUnit[];
  readonly nextUid: number;
  readonly status: RunStatus;
  readonly history: readonly RoundOutcome[];
}

export type Location =
  | { readonly area: 'bench'; readonly index: number }
  | { readonly area: 'board'; readonly x: number; readonly y: number };

export type RunAction =
  | { readonly type: 'buy'; readonly slot: number }
  | { readonly type: 'sell'; readonly from: Location }
  | { readonly type: 'reroll' }
  | { readonly type: 'freeze' }
  /** Переставить фигуру; если цель занята — поменять местами. */
  | { readonly type: 'move'; readonly from: Location; readonly to: Location }
  | { readonly type: 'roundEnd'; readonly outcome: RoundOutcome };

export type RunErrorCode =
  | 'run_over'
  | 'not_enough_gold'
  | 'empty_slot'
  | 'bench_full'
  | 'board_full'
  | 'invalid_location'
  | 'nothing_there';

export class RunError extends Error {
  constructor(
    readonly code: RunErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Draft = Mutable<Omit<RunState, 'shop' | 'bench' | 'board' | 'history'>> & {
  shop: (string | null)[];
  bench: (OwnedUnit | null)[];
  board: BoardUnit[];
  history: RoundOutcome[];
};

const clone = (s: RunState): Draft => JSON.parse(JSON.stringify(s)) as Draft;

export const boardCap = (round: number, config: RunConfig): number =>
  config.boardCaps[Math.min(round, config.boardCaps.length) - 1]!;

export const sellValue = (stars: Stars, config: RunConfig): number =>
  config.sellPerCopy * 3 ** (stars - 1);

export function unitCost(def: UnitDef): number {
  if (def.cost === undefined) throw new Error(`${def.id}: у фигуры магазина нет цены`);
  return def.cost;
}

function catalogUnit(config: RunConfig, id: string): UnitDef {
  const def = config.catalog.find((d) => d.id === id);
  if (!def) throw new Error(`Нет фигуры ${id} в каталоге`);
  return def;
}

/** Бросает шансы уровня и выбирает фигуру уровня равновероятно. */
function rollShop(d: Draft, config: RunConfig): void {
  const rng = createRng(d.rng);
  let odds = config.tierOdds[0]!;
  for (const o of config.tierOdds) if (d.round >= o.fromRound) odds = o;
  const total = odds.weights[0] + odds.weights[1] + odds.weights[2];
  d.shop = Array.from({ length: config.shopSlots }, () => {
    let roll = rng.int(1, total);
    let tier = 1;
    while (tier < 3 && roll > odds.weights[tier - 1]!) {
      roll -= odds.weights[tier - 1]!;
      tier++;
    }
    // Если фигур такого уровня нет — ближайший уровень ниже, затем выше.
    const order = [tier, tier - 1, tier - 2, tier + 1, tier + 2].filter((t) => t >= 1 && t <= 3);
    let pool: readonly UnitDef[] = [];
    for (const t of order) {
      if (pool.length > 0) break;
      pool = config.catalog.filter((u) => unitCost(u) === t);
    }
    return pool[rng.int(0, pool.length - 1)]!.id;
  });
  d.rng = rng.state;
}

export function createRun(seed: number, config: RunConfig): RunState {
  if (config.catalog.length === 0) throw new Error('Пустой каталог');
  for (const u of config.catalog) {
    const c = unitCost(u);
    if (!Number.isInteger(c) || c < 1 || c > 3) throw new Error(`${u.id}: цена должна быть 1..3`);
  }
  const d: Draft = {
    version: 1,
    seed: seed >>> 0,
    rng: seed >>> 0,
    round: 1,
    lives: config.lives,
    wins: 0,
    losses: 0,
    gold: config.goldPerRound,
    shop: [],
    frozen: false,
    bench: Array.from({ length: config.benchSlots }, () => null),
    board: [],
    nextUid: 1,
    status: 'shop',
    history: [],
  };
  rollShop(d, config);
  return d;
}

// ---------- Работа с позициями ----------

function inOwnRows(x: number, y: number, rules: Rules): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < rules.width &&
    y >= 0 &&
    y < Math.floor(rules.height / 2)
  );
}

function getAt(d: Draft, loc: Location, rules: Rules): OwnedUnit | null {
  if (loc.area === 'bench') {
    if (!Number.isInteger(loc.index) || loc.index < 0 || loc.index >= d.bench.length) {
      throw new RunError('invalid_location', `Нет слота скамейки ${loc.index}`);
    }
    return d.bench[loc.index] ?? null;
  }
  if (!inOwnRows(loc.x, loc.y, rules)) {
    throw new RunError('invalid_location', `Клетка (${loc.x}, ${loc.y}) не на своих рядах`);
  }
  return d.board.find((b) => b.x === loc.x && b.y === loc.y) ?? null;
}

function removeAt(d: Draft, loc: Location): void {
  if (loc.area === 'bench') d.bench[loc.index] = null;
  else d.board = d.board.filter((b) => b.x !== loc.x || b.y !== loc.y);
}

function putAt(d: Draft, loc: Location, u: OwnedUnit): void {
  const own: OwnedUnit = { uid: u.uid, unit: u.unit, stars: u.stars };
  if (loc.area === 'bench') d.bench[loc.index] = own;
  else d.board.push({ ...own, x: loc.x, y: loc.y });
}

// ---------- Слияние ----------

/** Все фигуры игрока: сначала поле (в порядке массива), затем скамейка. */
function owned(d: Draft): { u: OwnedUnit; loc: Location }[] {
  return [
    ...d.board.map((b) => ({ u: b as OwnedUnit, loc: { area: 'board', x: b.x, y: b.y } as const })),
    ...d.bench.flatMap((u, index) => (u ? [{ u, loc: { area: 'bench', index } as const }] : [])),
  ];
}

/**
 * Три одинаковые фигуры одного уровня → одна уровнем выше на месте первой
 * (поле важнее скамейки). Повторяется, пока есть что сливать (★2 → ★3).
 */
function mergeAll(d: Draft): void {
  for (;;) {
    const all = owned(d);
    const group = all.find(
      ({ u }) =>
        u.stars < 3 && all.filter((o) => o.u.unit === u.unit && o.u.stars === u.stars).length >= 3,
    );
    if (!group) return;
    const same = all.filter((o) => o.u.unit === group.u.unit && o.u.stars === group.u.stars);
    const [keep, ...rest] = same.slice(0, 3);
    for (const r of rest) removeAt(d, r.loc);
    removeAt(d, keep!.loc);
    putAt(d, keep!.loc, { ...keep!.u, stars: (keep!.u.stars + 1) as Stars });
  }
}

// ---------- Действия ----------

export function applyAction(
  state: RunState,
  action: RunAction,
  config: RunConfig,
  rules: Rules = DEFAULT_RULES,
): RunState {
  if (state.status !== 'shop') throw new RunError('run_over', 'Забег окончен');
  const d = clone(state);
  switch (action.type) {
    case 'buy': {
      const id = d.shop[action.slot];
      if (id === undefined || id === null) throw new RunError('empty_slot', 'Слот пуст');
      const cost = unitCost(catalogUnit(config, id));
      if (d.gold < cost) throw new RunError('not_enough_gold', 'Не хватает золота');
      const free = d.bench.findIndex((b) => b === null);
      const copies = owned(d).filter((o) => o.u.unit === id && o.u.stars === 1).length;
      // При полной скамейке покупка разрешена, только если сразу сольётся.
      if (free < 0 && copies < 2) throw new RunError('bench_full', 'Скамейка заполнена');
      const unit: OwnedUnit = { uid: d.nextUid++, unit: id, stars: 1 };
      d.gold -= cost;
      d.shop[action.slot] = null;
      if (free >= 0) {
        d.bench[free] = unit;
        mergeAll(d);
      } else {
        // Временно кладём в дополнительный слот: слияние заберёт её.
        d.bench.push(unit);
        mergeAll(d);
        d.bench = d.bench.slice(0, config.benchSlots);
      }
      break;
    }
    case 'sell': {
      const u = getAt(d, action.from, rules);
      if (!u) throw new RunError('nothing_there', 'Здесь нет фигуры');
      removeAt(d, action.from);
      d.gold += sellValue(u.stars, config);
      break;
    }
    case 'reroll': {
      if (d.gold < config.rerollCost) throw new RunError('not_enough_gold', 'Не хватает золота');
      d.gold -= config.rerollCost;
      d.frozen = false;
      rollShop(d, config);
      break;
    }
    case 'freeze': {
      d.frozen = !d.frozen;
      break;
    }
    case 'move': {
      const same =
        action.from.area === 'bench' && action.to.area === 'bench'
          ? action.from.index === action.to.index
          : action.from.area === 'board' &&
            action.to.area === 'board' &&
            action.from.x === action.to.x &&
            action.from.y === action.to.y;
      const a = getAt(d, action.from, rules);
      if (!a) throw new RunError('nothing_there', 'Здесь нет фигуры');
      const b = getAt(d, action.to, rules);
      if (same) break;
      const fromBench = action.from.area === 'bench';
      const toBoard = action.to.area === 'board';
      // Со скамейки на пустую клетку поля — +1 фигура на поле.
      if (fromBench && toBoard && !b && d.board.length >= boardCap(d.round, config)) {
        throw new RunError('board_full', `На поле не больше ${boardCap(d.round, config)} фигур`);
      }
      removeAt(d, action.from);
      if (b) removeAt(d, action.to);
      putAt(d, action.to, a);
      if (b) putAt(d, action.from, b);
      break;
    }
    case 'roundEnd': {
      d.history.push(action.outcome);
      if (action.outcome === 'win') d.wins++;
      if (action.outcome === 'loss') {
        d.losses++;
        d.lives--;
      }
      if (d.wins >= config.winsToFinish) d.status = 'won';
      else if (d.lives <= 0) d.status = 'lost';
      else {
        d.round++;
        d.gold = config.goldPerRound;
        if (!d.frozen) rollShop(d, config);
        d.frozen = false;
      }
      break;
    }
  }
  return d;
}

/** Армия игрока для боя (локальные координаты, со звёздами). */
export function runArmy(state: RunState, config: RunConfig): ArmySlot[] {
  return state.board.map((b) => ({
    def: catalogUnit(config, b.unit),
    x: b.x,
    y: b.y,
    stars: b.stars,
  }));
}

/** Детерминированный seed боя раунда: одинаков для клиента, сервера и ботов. */
export function roundSeed(state: RunState): number {
  return (Math.imul(state.seed ^ 0x9e3779b9, 31) + state.round * 0x85ebca6b) >>> 0;
}
