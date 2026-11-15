import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSetup, simulate } from '../src';
import type { ArmySlot, BattleResult, BattleSetup } from '../src';
import { bishop, knight, pawn, rook } from './helpers';

const armyA: ArmySlot[] = [
  { def: rook, x: 0, y: 0 },
  { def: bishop, x: 2, y: 0 },
  { def: rook, x: 4, y: 0 },
  { def: knight, x: 1, y: 1 },
  { def: knight, x: 3, y: 1 },
  { def: pawn, x: 0, y: 2 },
  { def: pawn, x: 2, y: 2 },
  { def: pawn, x: 4, y: 2 },
];
const armyB: ArmySlot[] = [
  { def: bishop, x: 1, y: 0 },
  { def: bishop, x: 3, y: 0 },
  { def: rook, x: 2, y: 1 },
  { def: knight, x: 0, y: 1 },
  { def: pawn, x: 1, y: 2 },
  { def: pawn, x: 2, y: 2 },
  { def: pawn, x: 3, y: 2 },
];
const setup = (): BattleSetup => createSetup(armyA, armyB);

/** FNV-1a 32-bit по JSON лога — компактный отпечаток для golden-теста. */
function fingerprint(r: BattleResult): string {
  const s = JSON.stringify(r.events);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Детерминированная перестановка (без Math.random). */
function permute<T>(xs: readonly T[], k: number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (i * 7 + k * 13) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('детерминизм', () => {
  afterEach(() => vi.restoreAllMocks());

  it('один и тот же вход даёт тот же результат', () => {
    expect(simulate(setup())).toEqual(simulate(setup()));
  });

  it('бой содержательный: есть удары, толчки и столкновения', () => {
    const types = new Set(simulate(setup()).events.map((e) => e.type));
    for (const t of ['move', 'attack', 'push', 'collision', 'death', 'end']) {
      expect(types).toContain(t);
    }
  });

  it('порядок фигур во входе не влияет на результат', () => {
    const base = simulate(setup());
    for (let k = 1; k <= 5; k++) {
      expect(simulate({ units: permute(setup().units, k) })).toEqual(base);
    }
  });

  it('не использует Math.random и Date', () => {
    const base = simulate(setup());
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random в симуляции');
    });
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Date.now в симуляции');
    });
    expect(simulate(setup())).toEqual(base);
  });

  it('нет общего состояния между боями', () => {
    const base = simulate(setup());
    const other = createSetup(armyB, armyA);
    simulate(other);
    expect(simulate(setup())).toEqual(base);
  });

  it('вход не мутируется', () => {
    const s = setup();
    const copy = JSON.parse(JSON.stringify(s)) as BattleSetup;
    simulate(s);
    expect(s).toEqual(copy);
  });

  it('golden: лог эталонного боя не изменился', () => {
    // Если правила изменены осознанно — обнови снапшот (pnpm test -u) и CLAUDE.md.
    const r = simulate(setup());
    expect({
      fingerprint: fingerprint(r),
      events: r.events.length,
      winner: r.winner,
      reason: r.reason,
      ticks: r.ticks,
    }).toMatchSnapshot();
  });
});
