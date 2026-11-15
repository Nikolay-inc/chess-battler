import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, DIAGONAL, FORWARD, KNIGHT_JUMPS, rays, simulate, steps } from '../src';
import type { BattleEvent } from '../src';
import { at, def, dummy, eventsOfTick, striker } from './helpers';

const CD = DEFAULT_RULES.collisionDamage;
const ofType = <T extends BattleEvent['type']>(events: readonly BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);

describe('броня', () => {
  it('снижает урон атаки: max(1, atk − armor)', () => {
    const hit = (armor: number) =>
      ofType(
        eventsOfTick(
          simulate({
            units: [
              at(striker({ atk: 3, push: 0 }), 'A', 2, 1),
              at(def({ hp: 50, armor }), 'B', 2, 2),
            ],
          }),
          1,
        ),
        'damage',
      )[0]!.amount;
    expect(hit(0)).toBe(3);
    expect(hit(1)).toBe(2);
    expect(hit(5)).toBe(1);
  });

  it('не снижает урон столкновения', () => {
    const r = simulate({
      units: [at(striker(), 'A', 2, 4), at(def({ hp: 50, armor: 5 }), 'B', 2, 5)],
    });
    expect(ofType(eventsOfTick(r, 1), 'damage').map((e) => [e.source, e.amount])).toEqual([
      ['attack', 1],
      ['collision', CD],
    ]);
  });
});

describe('щит (Предвидение)', () => {
  it('в начале боя щит получает союзник с наибольшим HP, щит поглощает урон', () => {
    const oracle = def({ id: 'oracle', abilities: [{ kind: 'shieldStrongest', amount: 6 }] });
    const r = simulate({
      units: [
        at(oracle, 'A', 0, 0),
        at(dummy(30), 'A', 2, 1), // id 0: передний ряд A раньше
        at(striker({ atk: 4, push: 0 }), 'B', 2, 2),
      ],
    });
    expect(r.events[0]).toEqual({ type: 'shield', unit: 0, amount: 6, by: 1 });
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]).toMatchObject({
      amount: 4,
      absorbed: 4,
      hp: 30,
    });
    expect(ofType(eventsOfTick(r, 2), 'damage')[0]).toMatchObject({
      amount: 4,
      absorbed: 2,
      hp: 28,
    });
    expect(ofType(eventsOfTick(r, 3), 'damage')[0]).not.toHaveProperty('absorbed');
  });
});

describe('устойчивость и Тяжёлый', () => {
  it('pushResist уменьшает силу толчка', () => {
    const t = def({ hp: 50, pushResist: 1 });
    const r1 = simulate({ units: [at(striker({ push: 1 }), 'A', 2, 1), at(t, 'B', 2, 2)] });
    expect(ofType(eventsOfTick(r1, 1), 'push')).toHaveLength(0);
    const r2 = simulate({ units: [at(striker({ push: 2 }), 'A', 2, 1), at(t, 'B', 2, 2)] });
    expect(ofType(eventsOfTick(r2, 1), 'push')).toHaveLength(1);
  });

  it('Тяжёлый не получает урон от столкновений', () => {
    const r = simulate({
      units: [
        at(striker(), 'A', 2, 4),
        at(def({ hp: 50, abilities: [{ kind: 'heavy' }] }), 'B', 2, 5),
      ],
    });
    const ev = eventsOfTick(r, 1);
    expect(ofType(ev, 'collision')).toHaveLength(1);
    expect(ofType(ev, 'damage').map((e) => e.source)).toEqual(['attack']);
  });
});

describe('способности при уроне', () => {
  it('Ответный удар бьёт только соседнего атакующего', () => {
    const sentry = def({ hp: 50, abilities: [{ kind: 'thorns', amount: 1 }] });
    const near = simulate({ units: [at(striker({ push: 0 }), 'A', 2, 1), at(sentry, 'B', 2, 2)] });
    expect(ofType(eventsOfTick(near, 1), 'damage')[1]).toMatchObject({
      unit: 0,
      amount: 1,
      source: 'thorns',
    });
    const far = simulate({
      units: [at(striker({ push: 0, attack: rays([FORWARD]) }), 'A', 2, 1), at(sentry, 'B', 2, 3)],
    });
    expect(ofType(eventsOfTick(far, 1), 'damage')).toHaveLength(1);
  });

  it('Закалка: +1 ATK за каждое получение урона, не больше максимума', () => {
    const veteran = def({ hp: 100, abilities: [{ kind: 'rage', atkPerHit: 1, max: 3 }] });
    const r = simulate({ units: [at(striker({ push: 0 }), 'A', 2, 1), at(veteran, 'B', 2, 2)] });
    const buffs = ofType(r.events, 'buff').filter((e) => e.unit === 1);
    expect(buffs).toHaveLength(3);
    expect(buffs.every((b) => b.stat === 'atk' && b.amount === 1)).toBe(true);
  });
});

describe('выбор цели', () => {
  const fork = (over = {}) => striker({ attack: steps(KNIGHT_JUMPS), push: 0, ...over });

  it('Провокация: враги, у которых провокатор в зоне, обязаны бить его', () => {
    const r = simulate({
      units: [
        at(fork(), 'A', 2, 2),
        at(dummy(5), 'B', 1, 4),
        at(def({ hp: 50, abilities: [{ kind: 'taunt' }] }), 'B', 3, 4),
      ],
    });
    const target = ofType(eventsOfTick(r, 1), 'attack')[0]!.target;
    expect(r.initial[target]!.hp).toBe(50);
  });

  it('Наводчик бьёт цель с наибольшей ATK', () => {
    const r = simulate({
      units: [
        at(fork({ abilities: [{ kind: 'targetHighestAtk' }] }), 'A', 2, 2),
        at(def({ hp: 5, atk: 1 }), 'B', 1, 4),
        at(def({ hp: 50, atk: 7 }), 'B', 3, 4),
      ],
    });
    const target = ofType(eventsOfTick(r, 1), 'attack')[0]!.target;
    expect(r.initial[target]!.hp).toBe(50);
  });
});

describe('способности толчка', () => {
  it('Копьё: столкновения от толчка фигуры наносят +2', () => {
    const r = simulate({
      units: [
        at(striker({ abilities: [{ kind: 'collisionBonus', amount: 2 }] }), 'A', 2, 4),
        at(dummy(), 'B', 2, 5),
      ],
    });
    expect(ofType(eventsOfTick(r, 1), 'damage')[1]).toMatchObject({
      source: 'collision',
      amount: CD + 2,
    });
  });

  it('Шквал: цепочка не затухает до 3 звеньев', () => {
    const units = (abilities: UnitAbilities) => [
      at(striker({ push: 2, abilities }), 'A', 2, 1),
      at(dummy(), 'B', 2, 2),
      at(dummy(), 'B', 2, 3),
      at(dummy(), 'B', 2, 4),
    ];
    const plain = ofType(eventsOfTick(simulate({ units: units([]) }), 1), 'push');
    expect(plain.map((e) => e.depth)).toEqual([]);
    const squall = ofType(
      eventsOfTick(simulate({ units: units([{ kind: 'squall', maxLinks: 3 }]) }), 1),
      'push',
    );
    expect(squall).toEqual([
      { type: 'push', unit: 3, from: { x: 2, y: 4 }, to: { x: 2, y: 5 }, depth: 2 },
    ]);
  });
});

type UnitAbilities = NonNullable<Parameters<typeof def>[0]>['abilities'];

describe('battleStart и ауры', () => {
  it('Клич: союзные Всадники получают инициативу и ATK, остальные — нет', () => {
    const commander = def({
      family: 'riders',
      abilities: [{ kind: 'rally', family: 'riders', initiative: 2, atk: 1 }],
    });
    const r = simulate({
      units: [
        at(commander, 'A', 0, 0),
        at(def({ family: 'riders' }), 'A', 1, 0),
        at(def({ family: 'legion' }), 'A', 2, 0),
        at(dummy(), 'B', 4, 5),
      ],
    });
    const start = r.events.slice(
      0,
      r.events.findIndex((e) => e.type === 'tick'),
    );
    const buffed = ofType(start, 'buff').map((e) => r.initial[e.unit]!.defId);
    expect(buffed).toHaveLength(4);
    expect(new Set(ofType(start, 'buff').map((e) => e.unit)).size).toBe(2);
  });

  it('Прикрытие: соседний союзник получает +1 броню', () => {
    const cover = def({ abilities: [{ kind: 'auraArmor', amount: 1 }] });
    const r = simulate({
      units: [
        at(cover, 'A', 1, 2),
        at(dummy(), 'A', 2, 2),
        at(striker({ atk: 3, push: 0 }), 'B', 2, 3),
      ],
    });
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]).toMatchObject({ amount: 2 });
  });

  it('Знамя: союзник семьи в том же ряду получает +1 ATK', () => {
    const banner = def({
      family: 'legion',
      abilities: [{ kind: 'auraAtk', amount: 1, family: 'legion' }],
    });
    const r = simulate({
      units: [
        at(banner, 'A', 0, 1),
        at(striker({ family: 'legion', atk: 3, push: 0 }), 'A', 2, 1),
        at(dummy(), 'B', 2, 2),
      ],
    });
    expect(ofType(eventsOfTick(r, 1), 'damage')[0]).toMatchObject({ amount: 4 });
  });

  it('Лечение: без врагов в зоне лечит раненого союзника по диагонали вместо хода', () => {
    const novice = def({
      family: 'mystics',
      move: rays(DIAGONAL, 2),
      abilities: [{ kind: 'heal', amount: 2 }],
    });
    const r = simulate({
      units: [
        at(novice, 'A', 1, 1),
        at(dummy(20), 'A', 2, 2),
        at(striker({ atk: 3, push: 0 }), 'B', 2, 3),
      ],
    });
    // id: A(2,2)=0, A(1,1)=1, B=2
    expect(eventsOfTick(r, 1)).toEqual([
      { type: 'attack', unit: 2, target: 0 },
      { type: 'damage', unit: 0, amount: 3, hp: 17, source: 'attack' },
      { type: 'support', unit: 1 },
      { type: 'heal', unit: 0, amount: 2, hp: 19, by: 1 },
    ]);
  });
});

describe('Буря', () => {
  it('с такта startTick каждый такт все фигуры получают ещё +ATK (накапливается)', () => {
    const rules = { ...DEFAULT_RULES, storm: { startTick: 3, atkPerTick: 1 } };
    const r = simulate(
      { units: [at(striker({ push: 0 }), 'A', 2, 1), at(dummy(), 'B', 2, 2)] },
      rules,
    );
    const dmg = (t: number) => ofType(eventsOfTick(r, t), 'damage')[0]!.amount;
    expect([dmg(1), dmg(2), dmg(3), dmg(4), dmg(5)]).toEqual([1, 1, 2, 3, 4]);
    expect(ofType(eventsOfTick(r, 4), 'storm')).toEqual([{ type: 'storm', tick: 4, atk: 2 }]);
    expect(ofType(eventsOfTick(r, 2), 'storm')).toEqual([]);
  });

  it('по умолчанию начинается с 15-го такта; null — выключена', () => {
    expect(DEFAULT_RULES.storm).toEqual({ startTick: 15, atkPerTick: 1 });
    const r = simulate(
      { units: [at(dummy(), 'A', 0, 0), at(dummy(), 'B', 4, 5)] },
      { ...DEFAULT_RULES, storm: null },
    );
    expect(ofType(r.events, 'storm')).toEqual([]);
  });
});
