import { describe, expect, it } from 'vitest';
import { analyzeBattle, battleMoments, scoreMoment, simulate } from '../src';
import { at, dummy, striker } from './helpers';

describe('итоги боя', () => {
  it('считает выживших по сторонам', () => {
    const r = simulate({
      units: [at(striker({ atk: 100 }), 'A', 2, 2), at(dummy(), 'B', 2, 3), at(dummy(), 'A', 0, 0)],
    });
    expect(analyzeBattle(r).survivors).toEqual({
      A: { alive: 2, total: 2 },
      B: { alive: 0, total: 1 },
    });
  });

  it('удар с цепочкой: урон по врагам, длина цепочки, убийства', () => {
    // striker толкает силой 3 колонну из трёх врагов в край (см. push.test.ts).
    const r = simulate({
      units: [
        at(striker({ push: 3 }), 'A', 2, 2),
        at(dummy(), 'B', 2, 3),
        at(dummy(), 'B', 2, 4),
        at(dummy(4), 'B', 2, 5), // погибнет от двух столкновений
      ],
    });
    const first = battleMoments(r)[0]!;
    expect(first).toMatchObject({ tick: 1, unit: 0, target: 1, chain: 3, kills: 1 });
    // 1 (удар) + 2 + 2·2 + 2·2 (столкновения по 2 урона)
    expect(first.damage).toBe(1 + 2 + 4 + 4);
    expect(first.score).toBe(scoreMoment(first));
  });

  it('урон по своим не засчитывается', () => {
    const r = simulate({
      units: [at(striker(), 'A', 2, 1), at(dummy(), 'B', 2, 2), at(dummy(), 'A', 2, 3)],
    });
    // 1 (удар) + 2 (столкновение цели); 2 урона союзнику не в счёт.
    expect(battleMoments(r)[0]!.damage).toBe(3);
  });

  it('лучший момент выбирается по очкам и фильтруется по стороне', () => {
    const r = simulate({
      units: [
        at(striker({ atk: 1, push: 0 }), 'A', 0, 1),
        at(dummy(), 'B', 0, 2),
        at(striker({ atk: 5, push: 0, initiative: 9 }), 'B', 4, 3),
        at(dummy(), 'A', 4, 2),
      ],
    });
    expect(analyzeBattle(r).best).toMatchObject({ side: 'B', damage: 5 });
    expect(analyzeBattle(r, 'A').best).toMatchObject({ side: 'A', damage: 1 });
  });

  it('если сторона не била — лучшего момента нет', () => {
    const r = simulate({ units: [at(dummy(), 'A', 0, 0), at(dummy(), 'B', 4, 5)] });
    expect(analyzeBattle(r, 'A').best).toBeNull();
  });
});
