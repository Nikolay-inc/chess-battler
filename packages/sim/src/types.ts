/** Сторона боя. A — снизу (ряды 0..2), идёт вверх; B — сверху (ряды 3..5), идёт вниз. */
export type Side = 'A' | 'B';

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export type Family = 'legion' | 'riders' | 'mystics' | 'guards';

/**
 * Шаблон хода или атаки.
 * Направления записаны относительно «вперёд» своей стороны: +y — к врагу.
 * Для стороны B они зеркалятся по y.
 */
export interface Pattern {
  readonly dirs: readonly Vec[];
  /** true — луч по направлению, блокируется первой фигурой (слон, ладья). */
  readonly slide: boolean;
  /** Максимальная длина луча для slide. По умолчанию — без ограничений. */
  readonly range?: number;
}

/** Уровень звёзд фигуры: ★1 — покупка, ★2 — слияние трёх ★1, ★3 — трёх ★2. */
export type Stars = 1 | 2 | 3;

/**
 * Способность фигуры — данные, которые интерпретирует sim.
 * Числа, помеченные «★», масштабируются звёздами (Rules.stars.ability).
 */
export type Ability =
  /** aura: соседние (ортогонально) союзники получают +amount★ брони. */
  | { readonly kind: 'auraArmor'; readonly amount: number }
  /** aura: союзники семьи family в том же ряду получают +amount★ ATK. */
  | { readonly kind: 'auraAtk'; readonly amount: number; readonly family: Family }
  /** onDamaged: +atkPerHit ATK за каждое получение урона, всего не больше max. */
  | { readonly kind: 'rage'; readonly atkPerHit: number; readonly max: number }
  /** targetRule: бьёт врага с наибольшей ATK. */
  | { readonly kind: 'targetHighestAtk' }
  /** onCollision: столкновения от толчков этой фигуры наносят +amount урона. */
  | { readonly kind: 'collisionBonus'; readonly amount: number }
  /** battleStart: союзники семьи family получают +initiative и +atk★. */
  | {
      readonly kind: 'rally';
      readonly family: Family;
      readonly initiative: number;
      readonly atk: number;
    }
  /**
   * afterAttack и вместо хода (если врагов в зоне нет): лечит самого раненого
   * союзника по диагонали (1 клетка) на amount★.
   */
  | { readonly kind: 'heal'; readonly amount: number }
  /** onCollision: цепочка от толчка этой фигуры не затухает раньше maxLinks звеньев. */
  | { readonly kind: 'squall'; readonly maxLinks: number }
  /** battleStart: союзник с наибольшим HP получает щит amount★. */
  | { readonly kind: 'shieldStrongest'; readonly amount: number }
  /** onDamaged: атакующий в соседней клетке получает amount урона. */
  | { readonly kind: 'thorns'; readonly amount: number }
  /** Не получает урон от столкновений. */
  | { readonly kind: 'heavy' }
  /** aura: враги, у которых эта фигура в зоне атаки, обязаны бить её. */
  | { readonly kind: 'taunt' };

/** Эффект синергии семьи. Действует на фигуры этой семьи у стороны, где синергия активна. */
export type SynergyEffect =
  /** +armorPerNeighbor брони за каждого соседнего союзника семьи, не больше max. */
  | { readonly kind: 'formation'; readonly armorPerNeighbor: number; readonly max: number }
  /** Дойдя до последнего ряда врага — один раз +hp, +atk и новый шаблон атаки. */
  | {
      readonly kind: 'promotion';
      readonly hp: number;
      readonly atk: number;
      readonly attack: Pattern;
    }
  /** Первая атака каждой фигуры в бою наносит ×multiplier урона. */
  | { readonly kind: 'firstStrike'; readonly multiplier: number }
  /** После хода фигура толкает соседних врагов с силой power. */
  | { readonly kind: 'breakthrough'; readonly power: number }
  /** В начале каждого every-го такта фигура лечит союзников по диагонали на amount. */
  | { readonly kind: 'periodicHeal'; readonly every: number; readonly amount: number }
  /** Каждая атака снимает с цели armor брони до конца боя. */
  | { readonly kind: 'curse'; readonly armor: number }
  /** +amount к силе толчка. */
  | { readonly kind: 'pushBonus'; readonly amount: number }
  /** Цель, толкнутая этой фигурой в фигуру или край, оглушается; урон столкновения по ней +bonus. */
  | { readonly kind: 'wall'; readonly collisionBonus: number };

export interface SynergyTier {
  /** Сколько фигур семьи на поле нужно (каждая копия считается). */
  readonly count: number;
  readonly name: string;
  readonly description: string;
  readonly effect: SynergyEffect;
}

export interface SynergyDef {
  readonly family: Family;
  readonly tiers: readonly SynergyTier[];
}

/** Статичное описание фигуры (данные из packages/content). */
export interface UnitDef {
  readonly id: string;
  readonly name: string;
  readonly family: Family;
  readonly hp: number;
  readonly atk: number;
  /** Чем больше, тем раньше фигура действует в такте. */
  readonly initiative: number;
  /** Сила толчка в клетках; 0 — удар не толкает. */
  readonly push: number;
  readonly move: Pattern;
  readonly attack: Pattern;
  /** Урон атаки по фигуре = max(1, atk − armor). По умолчанию 0. */
  readonly armor?: number;
  /** На сколько уменьшается сила толчка по фигуре. По умолчанию 0. */
  readonly pushResist?: number;
  readonly abilities?: readonly Ability[];
  /** Цена в золоте (= уровень). Нужна забегу, бою — нет. */
  readonly cost?: number;
  /** Текст способности для интерфейса. sim его не читает. */
  readonly description?: string;
}

export interface UnitPlacement {
  readonly def: UnitDef;
  readonly side: Side;
  /** Координаты доски (не локальные). */
  readonly pos: Vec;
  /** По умолчанию ★1. */
  readonly stars?: Stars;
}

export interface BattleSetup {
  readonly units: readonly UnitPlacement[];
  /** Синергии семей (данные из content). Без них бой идёт без синергий. */
  readonly synergies?: readonly SynergyDef[];
}

/** Множители звёзд в десятых долях: индекс 0 — ★1, 1 — ★2, 2 — ★3. */
export interface StarScaling {
  readonly hp: readonly [number, number, number];
  readonly atk: readonly [number, number, number];
  readonly ability: readonly [number, number, number];
}

export interface Rules {
  readonly width: number;
  readonly height: number;
  readonly maxTicks: number;
  /** Урон каждому участнику столкновения (с фигурой или краем). */
  readonly collisionDamage: number;
  readonly stars: StarScaling;
  /**
   * «Буря» против затягивания: с такта startTick в начале каждого такта все фигуры
   * получают ещё +atkPerTick ATK (накапливается: +1, +2, +3…). null — без Бури.
   */
  readonly storm: { readonly startTick: number; readonly atkPerTick: number } | null;
}

export const DEFAULT_RULES: Rules = {
  width: 5,
  height: 6,
  maxTicks: 30,
  collisionDamage: 2,
  stars: {
    hp: [10, 18, 30],
    atk: [10, 16, 25],
    ability: [10, 15, 20],
  },
  storm: { startTick: 15, atkPerTick: 1 },
};

/** Снимок фигуры для лога и клиента. */
export interface UnitSnapshot {
  readonly id: number;
  readonly defId: string;
  readonly side: Side;
  readonly pos: Vec;
  readonly hp: number;
  readonly maxHp: number;
  readonly stars: Stars;
}

export type DamageSource = 'attack' | 'collision' | 'thorns';

export type BuffStat = 'atk' | 'armor' | 'initiative';

export type BattleEvent =
  | { readonly type: 'tick'; readonly tick: number }
  | { readonly type: 'move'; readonly unit: number; readonly from: Vec; readonly to: Vec }
  | { readonly type: 'attack'; readonly unit: number; readonly target: number }
  | {
      readonly type: 'damage';
      readonly unit: number;
      readonly amount: number;
      readonly hp: number;
      readonly source: DamageSource;
      /** Сколько из amount поглотил щит (поле есть, только если > 0). */
      readonly absorbed?: number;
    }
  | {
      readonly type: 'push';
      readonly unit: number;
      readonly from: Vec;
      readonly to: Vec;
      /** 0 — толчок от удара, 1+ — звено цепочки. */
      readonly depth: number;
    }
  | {
      readonly type: 'collision';
      /** Кого толкали. */
      readonly unit: number;
      /** С кем столкнулся; null — край поля. */
      readonly other: number | null;
      /** Клетка, куда фигура пыталась сдвинуться. */
      readonly at: Vec;
      /** Глубина цепочки толкаемой фигуры (см. push.depth). */
      readonly depth: number;
    }
  | { readonly type: 'death'; readonly unit: number }
  /** Фигура лечится; amount — фактически восстановлено. */
  | {
      readonly type: 'heal';
      readonly unit: number;
      readonly amount: number;
      readonly hp: number;
      readonly by: number;
    }
  | { readonly type: 'shield'; readonly unit: number; readonly amount: number; readonly by: number }
  | {
      readonly type: 'buff';
      readonly unit: number;
      readonly stat: BuffStat;
      readonly amount: number;
      /** Источник: id фигуры или null (синергия/ярость). */
      readonly by: number | null;
    }
  /** Действие без удара и хода: фигура использует способность (лечение вместо хода). */
  | { readonly type: 'support'; readonly unit: number }
  /** Фигура оглушена и пропустит следующее действие. */
  | { readonly type: 'stun'; readonly unit: number }
  /** Оглушённая фигура пропустила действие. */
  | { readonly type: 'stunned'; readonly unit: number }
  /** Броня цели снижена проклятием. */
  | { readonly type: 'curse'; readonly unit: number; readonly armor: number }
  /** «Буря»: в начале такта все фигуры получили ещё ATK; atk — суммарная прибавка Бури. */
  | { readonly type: 'storm'; readonly tick: number; readonly atk: number }
  /** Повышение Легиона: +HP, +ATK, новый шаблон атаки. */
  | { readonly type: 'promote'; readonly unit: number; readonly hp: number }
  | {
      readonly type: 'end';
      readonly winner: Side | null;
      readonly reason: EndReason;
      readonly tick: number;
    };

export type EndReason = 'elimination' | 'timeout';

export interface BattleResult {
  readonly rules: Rules;
  /** Фигуры на старте; id = индекс в массиве. */
  readonly initial: readonly UnitSnapshot[];
  readonly events: readonly BattleEvent[];
  readonly final: readonly UnitSnapshot[];
  readonly winner: Side | null;
  readonly reason: EndReason;
  /** Сколько тактов прошло. */
  readonly ticks: number;
}
