import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, FORWARD_RIGHT, simulate, steps } from '../src';
import { at, dummy, eventsOfTick, striker } from './helpers';

const CD = DEFAULT_RULES.collisionDamage;

// Во всех сценариях действует только striker (id 0 у стороны A); мишени неподвижны.
describe('толчки', () => {
  it('удар сдвигает цель в пустую клетку', () => {
    const r = simulate({ units: [at(striker(), 'A', 2, 1), at(dummy(), 'B', 2, 2)] });
    expect(eventsOfTick(r, 1)).toEqual([
      { type: 'attack', unit: 0, target: 1 },
      { type: 'damage', unit: 1, amount: 1, hp: 99, source: 'attack' },
      { type: 'push', unit: 1, from: { x: 2, y: 2 }, to: { x: 2, y: 3 }, depth: 0 },
    ]);
  });

  it('столкновение с краем ранит только толкаемого', () => {
    const r = simulate({ units: [at(striker(), 'A', 2, 4), at(dummy(), 'B', 2, 5)] });
    expect(eventsOfTick(r, 1).slice(2)).toEqual([
      { type: 'collision', unit: 1, other: null, at: { x: 2, y: 6 }, depth: 0 },
      { type: 'damage', unit: 1, amount: CD, hp: 99 - CD, source: 'collision' },
    ]);
  });

  it('столкновение с фигурой ранит обоих; при силе 1 цепочки нет', () => {
    const r = simulate({
      units: [at(striker(), 'A', 2, 1), at(dummy(), 'B', 2, 2), at(dummy(), 'B', 2, 3)],
    });
    expect(eventsOfTick(r, 1).slice(2)).toEqual([
      { type: 'collision', unit: 1, other: 2, at: { x: 2, y: 3 }, depth: 0 },
      { type: 'damage', unit: 1, amount: CD, hp: 99 - CD, source: 'collision' },
      { type: 'damage', unit: 2, amount: CD, hp: 100 - CD, source: 'collision' },
    ]);
    // Никто не сдвинулся.
    expect(eventsOfTick(r, 1).some((e) => e.type === 'push')).toBe(false);
  });

  it('цепочка: задетая фигура толкается дальше с силой power - 1', () => {
    const r = simulate({
      units: [at(striker({ push: 2 }), 'A', 2, 1), at(dummy(), 'B', 2, 2), at(dummy(), 'B', 2, 3)],
    });
    expect(eventsOfTick(r, 1).slice(2)).toEqual([
      { type: 'collision', unit: 1, other: 2, at: { x: 2, y: 3 }, depth: 0 },
      { type: 'damage', unit: 1, amount: CD, hp: 99 - CD, source: 'collision' },
      { type: 'damage', unit: 2, amount: CD, hp: 100 - CD, source: 'collision' },
      { type: 'push', unit: 2, from: { x: 2, y: 3 }, to: { x: 2, y: 4 }, depth: 1 },
    ]);
  });

  it('цепочка из трёх фигур доходит до края', () => {
    const r = simulate({
      units: [
        at(striker({ push: 3 }), 'A', 2, 2),
        at(dummy(), 'B', 2, 3),
        at(dummy(), 'B', 2, 4),
        at(dummy(), 'B', 2, 5),
      ],
    });
    const ev = eventsOfTick(r, 1);
    expect(ev.filter((e) => e.type === 'collision')).toEqual([
      { type: 'collision', unit: 1, other: 2, at: { x: 2, y: 4 }, depth: 0 },
      { type: 'collision', unit: 2, other: 3, at: { x: 2, y: 5 }, depth: 1 },
      { type: 'collision', unit: 3, other: null, at: { x: 2, y: 6 }, depth: 2 },
    ]);
    const hpAfter = (id: number) => ev.filter((e) => e.type === 'damage' && e.unit === id).at(-1);
    expect(hpAfter(1)).toMatchObject({ hp: 99 - CD });
    expect(hpAfter(2)).toMatchObject({ hp: 100 - 2 * CD });
    expect(hpAfter(3)).toMatchObject({ hp: 100 - 2 * CD });
  });

  it('сила тратится на шаги: сначала сдвиг, потом удар о фигуру без цепочки', () => {
    const r = simulate({
      units: [at(striker({ push: 2 }), 'A', 2, 1), at(dummy(), 'B', 2, 2), at(dummy(), 'B', 2, 4)],
    });
    expect(eventsOfTick(r, 1).slice(2)).toEqual([
      { type: 'push', unit: 1, from: { x: 2, y: 2 }, to: { x: 2, y: 3 }, depth: 0 },
      { type: 'collision', unit: 1, other: 2, at: { x: 2, y: 4 }, depth: 0 },
      { type: 'damage', unit: 1, amount: CD, hp: 99 - CD, source: 'collision' },
      { type: 'damage', unit: 2, amount: CD, hp: 100 - CD, source: 'collision' },
    ]);
  });

  it('убитая ударом цель не толкается', () => {
    const r = simulate({
      units: [at(striker({ atk: 5 }), 'A', 2, 1), at(dummy(5), 'B', 2, 2), at(dummy(), 'B', 2, 3)],
    });
    expect(eventsOfTick(r, 1)).toEqual([
      { type: 'attack', unit: 0, target: 1 },
      { type: 'damage', unit: 1, amount: 5, hp: 0, source: 'attack' },
      { type: 'death', unit: 1 },
    ]);
  });

  it('столкновение может убить, в том числе свою фигуру атакующего', () => {
    const r = simulate({
      units: [
        at(striker(), 'A', 2, 1),
        at(dummy(1 + CD), 'B', 2, 2),
        at(dummy(CD), 'A', 2, 3), // союзник атакующего за спиной цели
      ],
    });
    const ev = eventsOfTick(r, 1);
    const deaths = ev.filter((e) => e.type === 'death').map((e) => e.unit);
    expect(deaths).toHaveLength(2);
    expect(
      r.final
        .filter((u) => u.hp === 0)
        .map((u) => u.side)
        .sort(),
    ).toEqual(['A', 'B']);
  });

  it('диагональный удар толкает по диагонали', () => {
    const r = simulate({
      units: [at(striker({ attack: steps([FORWARD_RIGHT]) }), 'A', 1, 1), at(dummy(), 'B', 2, 2)],
    });
    expect(eventsOfTick(r, 1).at(-1)).toEqual({
      type: 'push',
      unit: 1,
      from: { x: 2, y: 2 },
      to: { x: 3, y: 3 },
      depth: 0,
    });
  });

  it('сторона B толкает вниз', () => {
    const r = simulate({ units: [at(dummy(), 'A', 2, 2), at(striker(), 'B', 2, 3)] });
    expect(eventsOfTick(r, 1).at(-1)).toEqual({
      type: 'push',
      unit: 0,
      from: { x: 2, y: 2 },
      to: { x: 2, y: 1 },
      depth: 0,
    });
  });
});
