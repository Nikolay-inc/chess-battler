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
}

export interface UnitPlacement {
  readonly def: UnitDef;
  readonly side: Side;
  /** Координаты доски (не локальные). */
  readonly pos: Vec;
}

export interface BattleSetup {
  readonly units: readonly UnitPlacement[];
}

export interface Rules {
  readonly width: number;
  readonly height: number;
  readonly maxTicks: number;
  /** Урон каждому участнику столкновения (с фигурой или краем). */
  readonly collisionDamage: number;
}

export const DEFAULT_RULES: Rules = {
  width: 5,
  height: 6,
  maxTicks: 30,
  collisionDamage: 2,
};

/** Снимок фигуры для лога и клиента. */
export interface UnitSnapshot {
  readonly id: number;
  readonly defId: string;
  readonly side: Side;
  readonly pos: Vec;
  readonly hp: number;
  readonly maxHp: number;
}

export type DamageSource = 'attack' | 'collision';

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
    }
  | { readonly type: 'push'; readonly unit: number; readonly from: Vec; readonly to: Vec }
  | {
      readonly type: 'collision';
      /** Кого толкали. */
      readonly unit: number;
      /** С кем столкнулся; null — край поля. */
      readonly other: number | null;
      /** Клетка, куда фигура пыталась сдвинуться. */
      readonly at: Vec;
    }
  | { readonly type: 'death'; readonly unit: number }
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
