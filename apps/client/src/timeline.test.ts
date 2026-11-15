import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '@chess-battler/sim';
import { groupByTick, involvedUnits, staggerMs } from './timeline';

const p = { x: 0, y: 0 };

describe('groupByTick', () => {
  it('режет лог на такты и действия', () => {
    const events: BattleEvent[] = [
      { type: 'tick', tick: 1 },
      { type: 'move', unit: 0, from: p, to: p },
      { type: 'attack', unit: 1, target: 2 },
      { type: 'damage', unit: 2, amount: 3, hp: 1, source: 'attack' },
      { type: 'tick', tick: 2 },
      { type: 'attack', unit: 1, target: 2 },
      { type: 'damage', unit: 2, amount: 3, hp: 0, source: 'attack' },
      { type: 'death', unit: 2 },
      { type: 'end', winner: 'A', reason: 'elimination', tick: 2 },
    ];
    const ticks = groupByTick(events);
    expect(ticks.map((t) => t.tick)).toEqual([1, 2]);
    expect(ticks[0]!.actions.map((a) => a.events.length)).toEqual([1, 2]);
    expect(ticks[1]!.actions.map((a) => a.events.length)).toEqual([3]);
  });
});

describe('groupByTick: новые события', () => {
  it('начало боя — такт 0; лечение вместо хода и пропуск хода — отдельные действия', () => {
    const events: BattleEvent[] = [
      { type: 'shield', unit: 0, amount: 6, by: 1 },
      { type: 'buff', unit: 2, stat: 'atk', amount: 1, by: 2 },
      { type: 'tick', tick: 1 },
      { type: 'storm', tick: 1, atk: 1 },
      { type: 'heal', unit: 0, amount: 2, hp: 9, by: 1 },
      { type: 'stunned', unit: 3 },
      { type: 'support', unit: 1 },
      { type: 'heal', unit: 0, amount: 2, hp: 11, by: 1 },
      { type: 'move', unit: 2, from: p, to: p },
    ];
    const ticks = groupByTick(events);
    expect(ticks.map((t) => t.tick)).toEqual([0, 1]);
    expect(ticks[0]!.actions).toHaveLength(1);
    expect(ticks[1]!.actions.map((a) => a.events.map((e) => e.type))).toEqual([
      ['storm', 'heal'],
      ['stunned'],
      ['support', 'heal'],
      ['move'],
    ]);
  });
});

describe('staggerMs', () => {
  it('сжимает каскад при большом числе действий, но не меньше минимума', () => {
    expect(staggerMs(1)).toBe(0);
    expect(staggerMs(2)).toBeGreaterThan(staggerMs(8));
    expect(staggerMs(100)).toBe(60);
  });
});

describe('involvedUnits', () => {
  it('собирает действующую фигуру, цель и участников столкновений', () => {
    const events: BattleEvent[] = [
      { type: 'attack', unit: 1, target: 2 },
      { type: 'damage', unit: 2, amount: 1, hp: 5, source: 'attack' },
      { type: 'collision', unit: 2, other: 3, at: p, depth: 0 },
      { type: 'collision', unit: 3, other: null, at: p, depth: 1 },
    ];
    expect(involvedUnits({ events }).sort()).toEqual([1, 2, 3]);
  });
});
