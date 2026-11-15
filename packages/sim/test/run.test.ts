import { describe, expect, it } from 'vitest';
import { RunError, applyAction, boardCap, createRun, runArmy, sellValue } from '../src';
import type { RunAction, RunConfig, RunState, UnitDef } from '../src';
import { def } from './helpers';

const unit = (id: string, cost: number): UnitDef => def({ id, cost });

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  lives: 3,
  winsToFinish: 10,
  goldPerRound: 10,
  rerollCost: 1,
  sellPerCopy: 1,
  shopSlots: 5,
  benchSlots: 4,
  boardCaps: [3, 4, 5, 5, 6, 6, 7, 8],
  tierOdds: [
    { fromRound: 1, weights: [100, 0, 0] },
    { fromRound: 3, weights: [75, 25, 0] },
    { fromRound: 5, weights: [55, 35, 10] },
    { fromRound: 7, weights: [40, 40, 20] },
  ],
  catalog: [unit('a', 1), unit('b', 1), unit('c', 2), unit('d', 3)],
  ...over,
});

/** Каталог из одной фигуры: магазин всегда предлагает её. */
const mono = config({ catalog: [unit('a', 1)] });

const act = (s: RunState, cfg: RunConfig, ...actions: RunAction[]) =>
  actions.reduce((st, a) => applyAction(st, a, cfg), s);

const errorCode = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof RunError ? e.code : String(e);
  }
  return null;
};

describe('старт забега', () => {
  it('3 жизни, 10 золота, 5 слотов, пустая скамейка на 4', () => {
    const s = createRun(1, config());
    expect(s).toMatchObject({ round: 1, lives: 3, wins: 0, gold: 10, status: 'shop' });
    expect(s.shop).toHaveLength(5);
    expect(s.bench).toEqual([null, null, null, null]);
  });

  it('в раундах 1–2 магазин предлагает только уровень 1', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(createRun(seed, config()).shop.every((id) => id === 'a' || id === 'b')).toBe(true);
    }
  });
});

describe('магазин', () => {
  it('покупка списывает цену и кладёт фигуру на скамейку', () => {
    const s = act(createRun(1, mono), mono, { type: 'buy', slot: 0 });
    expect(s.gold).toBe(9);
    expect(s.shop[0]).toBeNull();
    expect(s.bench[0]).toEqual({ uid: 1, unit: 'a', stars: 1 });
    expect(errorCode(() => act(s, mono, { type: 'buy', slot: 0 }))).toBe('empty_slot');
  });

  it('не хватает золота', () => {
    const cfg = config({ catalog: [unit('d', 3)], goldPerRound: 2 });
    expect(errorCode(() => act(createRun(1, cfg), cfg, { type: 'buy', slot: 0 }))).toBe(
      'not_enough_gold',
    );
  });

  it('переброс стоит 1 и меняет магазин детерминированно', () => {
    const cfg = config();
    const s = act(createRun(7, cfg), cfg, { type: 'reroll' });
    expect(s.gold).toBe(9);
    expect(act(createRun(7, cfg), cfg, { type: 'reroll' })).toEqual(s);
  });

  it('продажа: 1 золото за каждую ★1 внутри', () => {
    const cfg = config();
    expect([1, 2, 3].map((st) => sellValue(st as 1 | 2 | 3, cfg))).toEqual([1, 3, 9]);
    const s = act(
      createRun(1, mono),
      mono,
      { type: 'buy', slot: 0 },
      {
        type: 'sell',
        from: { area: 'bench', index: 0 },
      },
    );
    expect(s.gold).toBe(10);
    expect(s.bench[0]).toBeNull();
  });

  it('заморозка сохраняет магазин на следующий раунд, переброс снимает её', () => {
    const cfg = config();
    const s = act(createRun(3, cfg), cfg, { type: 'freeze' });
    expect(s.frozen).toBe(true);
    const next = act(s, cfg, { type: 'roundEnd', outcome: 'win' });
    expect(next.shop).toEqual(s.shop);
    expect(next.frozen).toBe(false);
    expect(act(s, cfg, { type: 'reroll' }).frozen).toBe(false);
  });
});

describe('слияние', () => {
  it('3 × ★1 → ★2; три ★2 → ★3', () => {
    let s = createRun(1, mono);
    s = act(s, mono, ...[0, 1, 2].map((slot) => ({ type: 'buy', slot }) as const));
    expect(s.bench.filter(Boolean)).toEqual([{ uid: 1, unit: 'a', stars: 2 }]);
    s = act(s, mono, { type: 'buy', slot: 3 }, { type: 'buy', slot: 4 }, { type: 'reroll' });
    s = act(s, mono, ...[0, 1, 2, 3].map((slot) => ({ type: 'buy', slot }) as const));
    expect(s.gold).toBe(0);
    expect(s.bench.filter(Boolean)).toEqual([{ uid: 1, unit: 'a', stars: 3 }]);
  });

  it('слитая фигура остаётся на поле, если одна из копий была на поле', () => {
    let s = act(
      createRun(1, mono),
      mono,
      { type: 'buy', slot: 0 },
      {
        type: 'move',
        from: { area: 'bench', index: 0 },
        to: { area: 'board', x: 2, y: 2 },
      },
    );
    s = act(s, mono, { type: 'buy', slot: 1 }, { type: 'buy', slot: 2 });
    expect(s.board).toEqual([{ uid: 1, unit: 'a', stars: 2, x: 2, y: 2 }]);
    expect(s.bench.every((b) => b === null)).toBe(true);
  });

  it('при полной скамейке покупка разрешена, только если сразу сольётся', () => {
    const cfg = config({ catalog: [unit('a', 1), unit('b', 1)] });
    // Ищем seed, где в магазине есть и a, и b.
    let seed = 0;
    while (!['a', 'b'].every((id) => createRun(seed, cfg).shop.includes(id))) seed++;
    let s = createRun(seed, cfg);
    const slotOf = (st: RunState, id: string) => st.shop.indexOf(id);
    // Заполняем скамейку: a, a и две b.
    const buy = (id: string) => {
      while (slotOf(s, id) < 0) s = act(s, cfg, { type: 'reroll' });
      s = act(s, cfg, { type: 'buy', slot: slotOf(s, id) });
    };
    buy('a');
    buy('b');
    buy('a');
    buy('b');
    expect(s.bench.every(Boolean)).toBe(true);
    s = { ...s, gold: 10 };
    while (slotOf(s, 'a') < 0 || slotOf(s, 'b') < 0)
      s = { ...act(s, cfg, { type: 'reroll' }), gold: 10 };
    // b есть 2 копии — сольётся; разрешено.
    const merged = act(s, cfg, { type: 'buy', slot: slotOf(s, 'b') });
    expect(merged.bench.filter((u) => u?.unit === 'b')).toEqual([
      expect.objectContaining({ stars: 2 }),
    ]);
    // Новая фигура без пары — нельзя.
    const cfg2 = config({ catalog: [unit('a', 1), unit('b', 1), unit('z', 1)] });
    const full = { ...s, shop: ['z', null, null, null, null] };
    expect(errorCode(() => applyAction(full, { type: 'buy', slot: 0 }, cfg2))).toBe('bench_full');
  });
});

describe('расстановка', () => {
  it('ставит только на свои 3 ряда и не больше лимита раунда', () => {
    const cfg = config({ catalog: [unit('a', 1), unit('b', 1)] });
    let s = createRun(5, cfg);
    s = {
      ...s,
      bench: [
        { uid: 10, unit: 'a', stars: 1 },
        { uid: 11, unit: 'b', stars: 1 },
        { uid: 12, unit: 'a', stars: 2 },
        { uid: 13, unit: 'b', stars: 2 },
      ],
    };
    const place = (st: RunState, index: number, x: number, y: number) =>
      applyAction(
        st,
        { type: 'move', from: { area: 'bench', index }, to: { area: 'board', x, y } },
        cfg,
      );
    expect(errorCode(() => place(s, 0, 0, 3))).toBe('invalid_location');
    s = place(place(place(s, 0, 0, 0), 1, 1, 0), 2, 2, 0);
    expect(boardCap(1, cfg)).toBe(3);
    expect(errorCode(() => place(s, 3, 3, 0))).toBe('board_full');
    // Обмен со скамейкой при полном поле разрешён.
    const swapped = place(s, 3, 0, 0);
    expect(swapped.board.find((b) => b.x === 0 && b.y === 0)?.uid).toBe(13);
    expect(swapped.bench[3]?.uid).toBe(10);
    // Перестановка внутри поля.
    const moved = applyAction(
      s,
      { type: 'move', from: { area: 'board', x: 0, y: 0 }, to: { area: 'board', x: 4, y: 2 } },
      cfg,
    );
    expect(moved.board.find((b) => b.uid === 10)).toMatchObject({ x: 4, y: 2 });
    expect(runArmy(moved, cfg)).toHaveLength(3);
  });

  it('лимит растёт по раундам: 3 → 8', () => {
    const cfg = config();
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 15].map((r) => boardCap(r, cfg))).toEqual([
      3, 4, 5, 5, 6, 6, 7, 8, 8, 8,
    ]);
  });
});

describe('раунды и конец забега', () => {
  it('поражение отнимает жизнь, ничья — ничего; золото обновляется', () => {
    const cfg = config();
    let s = act(createRun(1, cfg), cfg, { type: 'reroll' }, { type: 'roundEnd', outcome: 'loss' });
    expect(s).toMatchObject({ round: 2, lives: 2, losses: 1, gold: 10 });
    s = act(s, cfg, { type: 'roundEnd', outcome: 'draw' });
    expect(s).toMatchObject({ round: 3, lives: 2, wins: 0 });
    expect(s.history).toEqual(['loss', 'draw']);
  });

  it('3 поражения — забег проигран; 10 побед — выигран; дальше действия запрещены', () => {
    const cfg = config();
    const lost = act(
      createRun(1, cfg),
      cfg,
      ...Array(3).fill({ type: 'roundEnd', outcome: 'loss' }),
    );
    expect(lost.status).toBe('lost');
    expect(errorCode(() => act(lost, cfg, { type: 'reroll' }))).toBe('run_over');
    const won = act(
      createRun(1, cfg),
      cfg,
      ...Array(10).fill({ type: 'roundEnd', outcome: 'win' }),
    );
    expect(won).toMatchObject({ status: 'won', wins: 10 });
  });

  it('шансы уровней в магазине к 7-му раунду: есть все три уровня', () => {
    const cfg = config();
    let s = act(createRun(9, cfg), cfg, ...Array(6).fill({ type: 'roundEnd', outcome: 'draw' }));
    expect(s.round).toBe(7);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      s = { ...applyAction(s, { type: 'reroll' }, cfg), gold: 10 };
      s.shop.forEach((id) => id && seen.add(id));
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('детерминизм забега', () => {
  it('тот же seed и те же действия — то же состояние; состояние переживает JSON', () => {
    const cfg = config();
    const actions: RunAction[] = [
      { type: 'buy', slot: 0 },
      { type: 'reroll' },
      { type: 'buy', slot: 2 },
      { type: 'move', from: { area: 'bench', index: 0 }, to: { area: 'board', x: 1, y: 2 } },
      { type: 'roundEnd', outcome: 'win' },
      { type: 'reroll' },
    ];
    const a = act(createRun(42, cfg), cfg, ...actions);
    const b = act(JSON.parse(JSON.stringify(createRun(42, cfg))) as RunState, cfg, ...actions);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(createRun(43, cfg).shop).not.toEqual(createRun(42, cfg).shop);
  });

  it('исходное состояние не мутируется', () => {
    const cfg = config();
    const s = createRun(1, cfg);
    const copy = JSON.parse(JSON.stringify(s)) as RunState;
    applyAction(s, { type: 'buy', slot: 0 }, cfg);
    expect(s).toEqual(copy);
  });
});
