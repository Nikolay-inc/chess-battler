import { describe, expect, it } from 'vitest';
import { FORWARD, KNIGHT_JUMPS, createSetup, placeArmy, simulate, steps } from '../src';
import type { BattleEvent } from '../src';
import { at, def, dummy, eventsOfTick, knight, pawn, striker } from './helpers';

const actors = (events: BattleEvent[]) =>
  events.flatMap((e) => (e.type === 'attack' || e.type === 'move' ? [e.unit] : []));

describe('порядок такта', () => {
  it('высокая инициатива действует раньше', () => {
    const slow = striker({ id: 'slow', initiative: 1 });
    const fast = striker({ id: 'fast', initiative: 9 });
    // A(1,1)=slow id0, A(3,1)=fast id1; мишени B над ними.
    const r = simulate({
      units: [
        at(slow, 'A', 1, 1),
        at(fast, 'A', 3, 1),
        at(dummy(), 'B', 1, 2),
        at(dummy(), 'B', 3, 2),
      ],
    });
    expect(actors(eventsOfTick(r, 1))).toEqual([1, 0]);
  });

  it('при равной инициативе стороны чередуются, приоритет меняется каждый такт', () => {
    // По две фигуры у сторон, все с одинаковой инициативой, каждая бьёт мишень напротив.
    const s = striker({ push: 0 });
    const r = simulate({
      units: [
        at(s, 'A', 0, 1),
        at(s, 'A', 4, 1),
        at(dummy(), 'B', 0, 2),
        at(dummy(), 'B', 4, 2),
        at(s, 'B', 1, 4),
        at(s, 'B', 3, 4),
        at(dummy(), 'A', 1, 3),
        at(dummy(), 'A', 3, 3),
      ],
    });
    const sideOf = (id: number) => r.initial[id]!.side;
    expect(actors(eventsOfTick(r, 1)).map(sideOf)).toEqual(['A', 'B', 'A', 'B']);
    expect(actors(eventsOfTick(r, 2)).map(sideOf)).toEqual(['B', 'A', 'B', 'A']);
  });

  it('убитая до своей очереди фигура не действует', () => {
    const killer = striker({ id: 'killer', atk: 50, initiative: 9 });
    const victim = striker({ id: 'victim', initiative: 1 });
    const r = simulate({
      units: [at(killer, 'A', 2, 1), at(victim, 'B', 2, 2), at(dummy(), 'A', 0, 0)],
    });
    const tick1 = eventsOfTick(r, 1);
    expect(tick1.filter((e) => e.type === 'attack')).toHaveLength(1);
    expect(r.winner).toBe('A');
  });
});

describe('выбор действия', () => {
  it('пешка идёт вперёд и бьёт по диагонали', () => {
    const r = simulate(createSetup([{ def: pawn, x: 2, y: 2 }], [{ def: dummy(), x: 1, y: 1 }]));
    // B (1,1) локально → доска (3,4). Пешка A на (2,2) атакует (1,3)/(3,3).
    const first = eventsOfTick(r, 1);
    expect(first[0]).toMatchObject({ type: 'move', unit: 0 });
    const attacked = r.events.find((e) => e.type === 'attack');
    expect(attacked).toMatchObject({ unit: 0, target: 1 });
  });

  it('конь идёт на клетку, с которой может ударить (BFS), а не просто ближе', () => {
    const r = simulate({ units: [at(knight, 'A', 0, 0), at(dummy(), 'B', 4, 5)] });
    const ev = eventsOfTick(r, 1)[0];
    expect(ev?.type).toBe('move');
    // Каждый ход коня сокращает путь до позиции атаки; бой заканчивается ударами.
    expect(r.events.some((e) => e.type === 'attack')).toBe(true);
  });

  it('из нескольких целей выбирает с меньшим HP', () => {
    const fork = striker({ attack: steps(KNIGHT_JUMPS), push: 0 });
    const r = simulate({
      units: [at(fork, 'A', 2, 2), at(dummy(50), 'B', 1, 4), at(dummy(20), 'B', 3, 4)],
    });
    expect(eventsOfTick(r, 1)[0]).toMatchObject({
      type: 'attack',
      target: r.initial.find((u) => u.hp === 20)!.id,
    });
  });

  it('если подойти нельзя, фигура ждёт', () => {
    const stuck = def({ id: 'stuck', move: steps([FORWARD]), attack: steps([FORWARD]), atk: 1 });
    // Впереди своя фигура — двигаться некуда.
    const r = simulate({
      units: [at(stuck, 'A', 0, 0), at(dummy(), 'A', 0, 1), at(dummy(), 'B', 4, 5)],
    });
    expect(eventsOfTick(r, 1)).toEqual([]);
  });
});

describe('конец боя', () => {
  it('уничтожение армии — победа', () => {
    const r = simulate({ units: [at(striker({ atk: 100 }), 'A', 2, 2), at(dummy(), 'B', 2, 3)] });
    expect(r).toMatchObject({ winner: 'A', reason: 'elimination', ticks: 1 });
    expect(r.events.at(-1)).toEqual({ type: 'end', winner: 'A', reason: 'elimination', tick: 1 });
  });

  it('пустая армия — поражение сразу, без тактов', () => {
    const r = simulate({ units: [at(dummy(), 'B', 2, 3)] });
    expect(r).toMatchObject({ winner: 'B', reason: 'elimination', ticks: 0 });
  });

  it('таймаут: побеждает сторона с большей суммой HP', () => {
    const r = simulate({ units: [at(dummy(10), 'A', 0, 0), at(dummy(11), 'B', 4, 5)] });
    expect(r).toMatchObject({ winner: 'B', reason: 'timeout', ticks: 30 });
  });

  it('таймаут при равных HP — ничья', () => {
    const r = simulate({ units: [at(dummy(10), 'A', 0, 0), at(dummy(10), 'B', 4, 5)] });
    expect(r).toMatchObject({ winner: null, reason: 'timeout' });
  });

  it('maxTicks настраивается', () => {
    const rules = { width: 5, height: 6, maxTicks: 3, collisionDamage: 2 };
    const r = simulate({ units: [at(dummy(), 'A', 0, 0), at(dummy(), 'B', 4, 5)] }, rules);
    expect(r.ticks).toBe(3);
  });
});

describe('валидация', () => {
  it('две фигуры на одной клетке', () => {
    expect(() => simulate({ units: [at(dummy(), 'A', 1, 1), at(dummy(), 'B', 1, 1)] })).toThrow();
  });

  it('клетка вне поля', () => {
    expect(() => simulate({ units: [at(dummy(), 'A', 5, 0)] })).toThrow();
  });

  it('армия только на своих трёх рядах', () => {
    expect(() => placeArmy('A', [{ def: pawn, x: 0, y: 3 }])).toThrow();
    expect(placeArmy('B', [{ def: pawn, x: 0, y: 2 }])[0]!.pos).toEqual({ x: 4, y: 3 });
  });
});
