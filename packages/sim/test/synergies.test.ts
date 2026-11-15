import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  DIAGONAL,
  FORWARD,
  ORTHOGONAL,
  activeSynergies,
  simulate,
  steps,
} from '../src';
import type { BattleEvent, Family, SynergyDef, SynergyEffect, UnitPlacement } from '../src';
import { at, def, dummy, eventsOfTick, striker } from './helpers';

const CD = DEFAULT_RULES.collisionDamage;
const ofType = <T extends BattleEvent['type']>(events: readonly BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

/** Синергия с одной ступенью (порог count). */
const syn = (family: Family, effect: SynergyEffect, count = 1): SynergyDef => ({
  family,
  tiers: [{ count, effect }],
});
const run = (units: UnitPlacement[], ...synergies: SynergyDef[]) => simulate({ units, synergies });

describe('подсчёт синергий', () => {
  it('считает копии на поле, ступени суммируются', () => {
    const legion = def({ family: 'legion' });
    const rider = def({ family: 'riders' });
    const defs: SynergyDef[] = [
      {
        family: 'legion',
        tiers: [
          { count: 2, effect: { kind: 'pushBonus', amount: 1 } },
          { count: 4, effect: { kind: 'pushBonus', amount: 1 } },
        ],
      },
      {
        family: 'riders',
        tiers: [{ count: 2, effect: { kind: 'firstStrike', multiplier: 2 } }],
      },
    ];
    const units = [
      ...Array.from({ length: 4 }, () => ({ def: legion, side: 'A' as const })),
      { def: rider, side: 'A' as const },
      { def: rider, side: 'B' as const },
      { def: rider, side: 'B' as const },
    ];
    const a = activeSynergies(units, 'A', defs);
    expect(a.map((s) => [s.family, s.count, s.tiers.map((t) => t.count)])).toEqual([
      ['legion', 4, [2, 4]],
      ['riders', 1, []],
    ]);
    expect(activeSynergies(units, 'B', defs).map((s) => s.tiers.length)).toEqual([1]);
  });

  it('синергия действует только на свою семью и свою сторону', () => {
    const r = run(
      [at(striker({ family: 'legion', atk: 3, push: 0 }), 'A', 2, 1), at(dummy(), 'B', 2, 2)],
      syn('riders', { kind: 'firstStrike', multiplier: 2 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]).toMatchObject({ amount: 3 });
  });
});

describe('Легион', () => {
  it('Строй: +1 броня за соседнего союзника Легиона, максимум +2', () => {
    const legion = def({ family: 'legion', hp: 50 });
    const r = run(
      [
        at(striker({ atk: 3, push: 0 }), 'A', 2, 2),
        at(legion, 'B', 2, 3),
        at(legion, 'B', 1, 3),
        at(legion, 'B', 3, 3),
        at(legion, 'B', 2, 4),
      ],
      syn('legion', { kind: 'formation', armorPerNeighbor: 1, max: 2 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]).toMatchObject({ amount: 1 });
  });

  it('Повышение: дойдя до последнего ряда — +HP, +ATK и атака по всем 8 клеткам', () => {
    const all8 = steps([...ORTHOGONAL, ...DIAGONAL]);
    const walker = def({ family: 'legion', hp: 8, move: steps([FORWARD]) });
    const r = run(
      [at(walker, 'A', 0, 4), at(dummy(), 'B', 1, 5)],
      syn('legion', { kind: 'promotion', hp: 4, atk: 2, attack: all8 }),
    );
    const ev = eventsOfTick(r, 1);
    expect(ev).toContainEqual({ type: 'promote', unit: 0, hp: 12 });
    // До повышения ударить нечем; с (0,5) новая атака достаёт врага на (1,5): 0 + 2 ATK.
    expect(ofType(eventsOfTick(r, 2), 'damage')[0]).toMatchObject({ unit: 1, amount: 2 });
  });
});

describe('Всадники', () => {
  it('Натиск: первая атака фигуры наносит ×2', () => {
    const r = run(
      [at(striker({ family: 'riders', atk: 3, push: 0 }), 'A', 2, 1), at(dummy(), 'B', 2, 2)],
      syn('riders', { kind: 'firstStrike', multiplier: 2 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]!.amount).toBe(6);
    expect(ofType(eventsOfTick(r, 2), 'damage')[0]!.amount).toBe(3);
  });

  it('Прорыв: после хода толкает соседних врагов от себя', () => {
    const rider = def({ family: 'riders', move: steps([FORWARD]), initiative: 5 });
    const r = run(
      [at(rider, 'A', 2, 1), at(dummy(), 'B', 2, 3), at(dummy(), 'B', 3, 2)],
      syn('riders', { kind: 'breakthrough', power: 1 }),
    );
    expect(eventsOfTick(r, 1)).toEqual([
      { type: 'move', unit: 0, from: { x: 2, y: 1 }, to: { x: 2, y: 2 } },
      { type: 'push', unit: 2, from: { x: 2, y: 3 }, to: { x: 2, y: 4 }, depth: 0 },
      { type: 'push', unit: 1, from: { x: 3, y: 2 }, to: { x: 4, y: 2 }, depth: 0 },
    ]);
  });
});

describe('Мистики', () => {
  it('Благословение: в начале каждого 3-го такта лечит союзников по диагонали', () => {
    const r = run(
      [
        at(def({ family: 'mystics' }), 'A', 1, 1),
        at(dummy(20), 'A', 2, 2),
        at(striker({ atk: 1, push: 0 }), 'B', 2, 3),
      ],
      syn('mystics', { kind: 'periodicHeal', every: 3, amount: 2 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'heal')).toHaveLength(0);
    expect(ofType(eventsOfTick(r, 2), 'heal')).toHaveLength(0);
    expect(eventsOfTick(r, 3)[0]).toEqual({ type: 'heal', unit: 0, amount: 2, hp: 20, by: 1 });
  });

  it('Проклятие: каждая атака снимает 1 броню до конца боя', () => {
    const r = run(
      [
        at(striker({ family: 'mystics', atk: 3, push: 0 }), 'A', 2, 1),
        at(def({ hp: 50, armor: 2 }), 'B', 2, 2),
      ],
      syn('mystics', { kind: 'curse', armor: 1 }),
    );
    const dmg = (t: number) => ofType(eventsOfTick(r, t), 'damage')[0]!.amount;
    expect([dmg(1), dmg(2), dmg(3), dmg(4)]).toEqual([1, 2, 3, 3]);
    expect(ofType(r.events, 'curse').map((e) => e.armor)).toEqual([1, 0]);
  });
});

describe('Стражи', () => {
  it('Сокрушение: +1 к силе толчка', () => {
    const r = run(
      [at(striker({ family: 'guards' }), 'A', 2, 1), at(dummy(), 'B', 2, 2)],
      syn('guards', { kind: 'pushBonus', amount: 1 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'push').map((e) => e.to)).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });

  it('Стена: цель, врезавшаяся в край, оглушается и получает +2 урона столкновения', () => {
    const victim = striker({ id: 'victim', initiative: 5, hp: 50 });
    const r = run(
      [at(striker({ family: 'guards' }), 'A', 2, 4), at(victim, 'B', 2, 5)],
      syn('guards', { kind: 'wall', collisionBonus: 2 }),
    );
    const ev = eventsOfTick(r, 1);
    expect(ofType(ev, 'damage')[1]).toMatchObject({ source: 'collision', amount: CD + 2 });
    expect(ev).toContainEqual({ type: 'stun', unit: 1 });
    expect(ev).toContainEqual({ type: 'stunned', unit: 1 });
    expect(ofType(ev, 'attack').map((e) => e.unit)).toEqual([0]);
  });

  it('Стена: задетая фигура получает обычный урон столкновения', () => {
    const r = run(
      [
        at(striker({ family: 'guards' }), 'A', 2, 1),
        at(dummy(), 'B', 2, 2),
        at(dummy(), 'B', 2, 3),
      ],
      syn('guards', { kind: 'wall', collisionBonus: 2 }),
    );
    expect(ofType(eventsOfTick(r, 1), 'damage').map((e) => [e.unit, e.amount])).toEqual([
      [1, 1],
      [1, CD + 2],
      [2, CD],
    ]);
  });
});
