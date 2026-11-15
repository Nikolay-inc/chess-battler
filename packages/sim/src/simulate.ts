import { activeSynergies, findAbility, starScaledDef, synergyTable } from './abilities';
import type { SynergyTable } from './abilities';
import { add, inBounds, manhattan, pushDirection, toLocal } from './geometry';
import { DIAGONAL, ORTHOGONAL, attackTargets, moveTargets } from './patterns';
import { validateSetup } from './setup';
import { DEFAULT_RULES } from './types';
import type {
  Ability,
  BattleEvent,
  BattleResult,
  BattleSetup,
  BuffStat,
  DamageSource,
  EndReason,
  Pattern,
  Rules,
  Side,
  Stars,
  SynergyEffect,
  UnitDef,
  UnitSnapshot,
  Vec,
} from './types';

interface Unit {
  readonly id: number;
  /** Описание с учётом звёзд. */
  readonly def: UnitDef;
  readonly side: Side;
  readonly stars: Stars;
  pos: Vec;
  hp: number;
  maxHp: number;
  shield: number;
  /** Пропустит следующее действие. */
  stunned: boolean;
  // Постоянные модификаторы (до конца боя).
  atkBonus: number;
  initBonus: number;
  rageGained: number;
  curse: number;
  hasAttacked: boolean;
  promoted: boolean;
  attackPattern: Pattern;
  // Ауры — пересчитываются в начале каждого такта.
  auraArmor: number;
  auraAtk: number;
}

/** Контекст толчка: какие модификаторы действуют на всю цепочку. */
interface PushContext {
  readonly collisionBonus: number;
  readonly wall: Extract<SynergyEffect, { kind: 'wall' }> | undefined;
  readonly squall: Extract<Ability, { kind: 'squall' }> | undefined;
}

const other = (side: Side): Side => (side === 'A' ? 'B' : 'A');

/**
 * Сравнение клеток в порядке «передний ряд раньше, затем слева направо»
 * с точки зрения стороны. Полный порядок для клеток одной стороны.
 */
function compareFrontFirst(a: Vec, b: Vec, side: Side, rules: Rules): number {
  const la = toLocal(side, a, rules);
  const lb = toLocal(side, b, rules);
  return lb.y - la.y || la.x - lb.x;
}

class Battle {
  readonly units: Unit[];
  readonly events: BattleEvent[] = [];
  private readonly grid: (Unit | null)[];
  private readonly synergies: Record<Side, SynergyTable>;
  tick = 0;
  ended: { winner: Side | null; reason: EndReason } | null = null;

  constructor(
    setup: BattleSetup,
    readonly rules: Rules,
  ) {
    validateSetup(setup, rules);
    // Канонический порядок: результат не зависит от порядка фигур во входе.
    const sorted = [...setup.units].sort((a, b) => {
      if (a.side !== b.side) return a.side === 'A' ? -1 : 1;
      return compareFrontFirst(a.pos, b.pos, a.side, rules);
    });
    this.units = sorted.map((u, id) => {
      const stars = u.stars ?? 1;
      const def = starScaledDef(u.def, stars, rules);
      return {
        id,
        def,
        side: u.side,
        stars,
        pos: u.pos,
        hp: def.hp,
        maxHp: def.hp,
        shield: 0,
        stunned: false,
        atkBonus: 0,
        initBonus: 0,
        rageGained: 0,
        curse: 0,
        hasAttacked: false,
        promoted: false,
        attackPattern: def.attack,
        auraArmor: 0,
        auraAtk: 0,
      };
    });
    this.grid = new Array<Unit | null>(rules.width * rules.height).fill(null);
    for (const u of this.units) this.grid[this.index(u.pos)] = u;
    const syn = setup.synergies ?? [];
    this.synergies = {
      A: synergyTable(activeSynergies(sorted, 'A', syn)),
      B: synergyTable(activeSynergies(sorted, 'B', syn)),
    };
  }

  // ---------- Доска ----------

  private index(p: Vec): number {
    return p.y * this.rules.width + p.x;
  }

  at(p: Vec): Unit | null {
    return inBounds(p, this.rules) ? (this.grid[this.index(p)] ?? null) : null;
  }

  private place(u: Unit, to: Vec): void {
    this.grid[this.index(u.pos)] = null;
    this.grid[this.index(to)] = u;
    u.pos = to;
  }

  alive(side?: Side): Unit[] {
    return this.units.filter((u) => u.hp > 0 && (side === undefined || u.side === side));
  }

  /** Живые союзники в клетках u.pos + dirs (dirs — в координатах доски). */
  private alliesAround(u: Unit, dirs: readonly Vec[]): Unit[] {
    return dirs.flatMap((d) => {
      const o = this.at(add(u.pos, d));
      return o && o.side === u.side ? [o] : [];
    });
  }

  snapshot(): UnitSnapshot[] {
    return this.units.map((u) => ({
      id: u.id,
      defId: u.def.id,
      side: u.side,
      pos: u.pos,
      hp: u.hp,
      maxHp: u.maxHp,
      stars: u.stars,
    }));
  }

  // ---------- Характеристики ----------

  private atk(u: Unit): number {
    return u.def.atk + u.atkBonus + u.auraAtk;
  }

  private armor(u: Unit): number {
    return Math.max(0, (u.def.armor ?? 0) + u.auraArmor - u.curse);
  }

  private initiative(u: Unit): number {
    return u.def.initiative + u.initBonus;
  }

  /** Эффект синергии, действующий на фигуру (синергия её семьи на её стороне). */
  private synergy<K extends SynergyEffect['kind']>(
    u: Unit,
    kind: K,
  ): Extract<SynergyEffect, { kind: K }> | undefined {
    return this.synergies[u.side]
      .get(u.def.family)
      ?.find((e): e is Extract<SynergyEffect, { kind: K }> => e.kind === kind);
  }

  // ---------- Ход боя ----------

  /**
   * Порядок действий в такте: инициатива по убыванию; при равенстве стороны
   * чередуются начиная с приоритетной (нечётный такт — A), внутри стороны —
   * передний ряд раньше, затем слева направо.
   */
  turnOrder(): Unit[] {
    const first: Side = this.tick % 2 === 1 ? 'A' : 'B';
    const inits = [...new Set(this.alive().map((u) => this.initiative(u)))].sort((a, b) => b - a);
    const order: Unit[] = [];
    for (const init of inits) {
      const bySide = (side: Side) =>
        this.alive(side)
          .filter((u) => this.initiative(u) === init)
          .sort((a, b) => compareFrontFirst(a.pos, b.pos, side, this.rules));
      const queues = [bySide(first), bySide(other(first))];
      for (let i = 0; i < Math.max(queues[0]!.length, queues[1]!.length); i++) {
        for (const q of queues) {
          const u = q[i];
          if (u) order.push(u);
        }
      }
    }
    return order;
  }

  run(): void {
    this.battleStart();
    this.checkEnd();
    while (!this.ended && this.tick < this.rules.maxTicks) {
      this.tick++;
      this.events.push({ type: 'tick', tick: this.tick });
      this.tickStart();
      for (const u of this.turnOrder()) {
        if (u.hp <= 0) continue; // погиб раньше своей очереди
        if (u.stunned) {
          u.stunned = false;
          this.events.push({ type: 'stunned', unit: u.id });
          continue;
        }
        this.act(u);
        this.checkPromotions();
        this.checkEnd();
        if (this.ended) break;
      }
    }
    if (!this.ended) {
      const hpA = this.alive('A').reduce((s, u) => s + u.hp, 0);
      const hpB = this.alive('B').reduce((s, u) => s + u.hp, 0);
      this.ended = {
        winner: hpA > hpB ? 'A' : hpB > hpA ? 'B' : null,
        reason: 'timeout',
      };
    }
    this.events.push({ type: 'end', ...this.ended, tick: this.tick });
  }

  private checkEnd(): void {
    const a = this.alive('A').length;
    const b = this.alive('B').length;
    if (a > 0 && b > 0) return;
    this.ended = { winner: a > 0 ? 'A' : b > 0 ? 'B' : null, reason: 'elimination' };
  }

  // ---------- Триггеры battleStart / tickStart ----------

  private battleStart(): void {
    for (const u of this.units) {
      const rally = findAbility(u.def, 'rally');
      if (!rally) continue;
      for (const ally of this.alive(u.side).filter((a) => a.def.family === rally.family)) {
        ally.initBonus += rally.initiative;
        ally.atkBonus += rally.atk;
        this.buff(ally, 'initiative', rally.initiative, u.id);
        this.buff(ally, 'atk', rally.atk, u.id);
      }
    }
    for (const u of this.units) {
      const shield = findAbility(u.def, 'shieldStrongest');
      if (!shield || shield.amount <= 0) continue;
      let best: Unit | null = null;
      for (const a of this.alive(u.side)) if (!best || a.hp > best.hp) best = a;
      if (best) {
        best.shield += shield.amount;
        this.events.push({ type: 'shield', unit: best.id, amount: shield.amount, by: u.id });
      }
    }
  }

  private tickStart(): void {
    const storm = this.rules.storm;
    if (storm && this.tick >= storm.startTick) {
      for (const u of this.alive()) u.atkBonus += storm.atkPerTick;
      const total = (this.tick - storm.startTick + 1) * storm.atkPerTick;
      this.events.push({ type: 'storm', tick: this.tick, atk: total });
    }
    this.computeAuras();
    for (const u of this.alive()) {
      const heal = this.synergy(u, 'periodicHeal');
      if (heal && this.tick % heal.every === 0) {
        for (const ally of this.alliesAround(u, DIAGONAL)) this.heal(ally, heal.amount, u.id);
      }
    }
  }

  /** Ауры: пересчёт по текущим позициям. */
  private computeAuras(): void {
    const alive = this.alive();
    for (const u of alive) u.auraArmor = u.auraAtk = 0;
    for (const u of alive) {
      const cover = findAbility(u.def, 'auraArmor');
      if (cover) for (const a of this.alliesAround(u, ORTHOGONAL)) a.auraArmor += cover.amount;
      const banner = findAbility(u.def, 'auraAtk');
      if (banner) {
        for (const a of alive) {
          const sameRow = a.pos.y === u.pos.y;
          if (a !== u && a.side === u.side && a.def.family === banner.family && sameRow) {
            a.auraAtk += banner.amount;
          }
        }
      }
      const formation = this.synergy(u, 'formation');
      if (formation) {
        const n = this.alliesAround(u, ORTHOGONAL).filter((a) => a.def.family === u.def.family);
        u.auraArmor += Math.min(formation.max, n.length * formation.armorPerNeighbor);
      }
    }
  }

  /** Повышение: фигура семьи с эффектом promotion дошла до последнего ряда врага. */
  private checkPromotions(): void {
    for (const u of this.alive()) {
      const promo = this.synergy(u, 'promotion');
      if (!promo || u.promoted) continue;
      const lastRow = u.side === 'A' ? this.rules.height - 1 : 0;
      if (u.pos.y !== lastRow) continue;
      u.promoted = true;
      u.maxHp += promo.hp;
      u.hp += promo.hp;
      u.atkBonus += promo.atk;
      u.attackPattern = promo.attack;
      this.events.push({ type: 'promote', unit: u.id, hp: u.hp });
    }
  }

  // ---------- Действие ----------

  private act(u: Unit): void {
    const target = this.pickTarget(u);
    if (target) {
      this.attack(u, target);
      if (u.hp > 0) this.healAround(u);
      return;
    }
    // Лекарь без врагов в зоне лечит вместо хода (если есть кого).
    if (findAbility(u.def, 'heal') && this.woundedDiagonal(u)) {
      this.events.push({ type: 'support', unit: u.id });
      this.healAround(u);
      return;
    }
    // Под ударом врага фигура держит позицию: иначе выходит бесконечная погоня, когда
    // разные шаблоны атаки (например, ладья и слон) не дают никому закончить ход на ударной клетке.
    if (this.threatened(u)) return;
    const dest = this.pickMove(u);
    if (dest) {
      const from = u.pos;
      this.place(u, dest);
      this.events.push({ type: 'move', unit: u.id, from, to: dest });
      const breakthrough = this.synergy(u, 'breakthrough');
      if (breakthrough) this.breakthrough(u, breakthrough.power);
    }
  }

  /** Может ли какой-то враг ударить u со своей текущей клетки. */
  private threatened(u: Unit): boolean {
    return this.alive(other(u.side)).some((e) => this.enemiesInReach(e, e.pos).includes(u));
  }

  /** Враги, по которым u может ударить с клетки from. */
  private enemiesInReach(u: Unit, from: Vec): Unit[] {
    const occupied = (p: Vec) => {
      const o = this.at(p);
      return o !== null && o !== u;
    };
    return attackTargets(u.attackPattern, from, u.side, this.rules, occupied)
      .map((p) => this.at(p)!)
      .filter((o) => o.side !== u.side);
  }

  /**
   * Цель: Провокация (обязаны бить фигуру с taunt в зоне) → правило фигуры
   * (наибольшая ATK) → по умолчанию меньше HP → ближе → меньший id.
   */
  private pickTarget(u: Unit): Unit | null {
    let pool = this.enemiesInReach(u, u.pos);
    const taunting = pool.filter((e) => findAbility(e.def, 'taunt'));
    if (taunting.length > 0) pool = taunting;
    const byAtk = findAbility(u.def, 'targetHighestAtk') !== undefined;
    let best: Unit | null = null;
    for (const e of pool) {
      if (!best) {
        best = e;
        continue;
      }
      const d =
        (byAtk ? this.atk(best) - this.atk(e) : 0) ||
        e.hp - best.hp ||
        manhattan(u.pos, e.pos) - manhattan(u.pos, best.pos) ||
        e.id - best.id;
      if (d < 0) best = e;
    }
    return best;
  }

  /**
   * Выбор хода: клетка, с которой фигура быстрее всего (в ходах своего шаблона, BFS по
   * текущей доске) сможет ударить врага; расстояние 0 — ударит уже на следующем такте.
   * Если реального пути нет (закрыли свои) — оценка, где свои считаются проходимыми:
   * фигура выдвигается к проходу, только если это её приближает, иначе ждёт (без метаний).
   * Если пути нет и сквозь своих — клетка, строго уменьшающая манхэттен до ближайшего врага.
   */
  private pickMove(u: Unit): Vec | null {
    const occupied = (p: Vec) => {
      const o = this.at(p);
      return o !== null && o !== u;
    };
    // Для оценки пути свои фигуры проходимы: к следующему такту они обычно уходят.
    const enemyAt = (p: Vec) => {
      const o = this.at(p);
      return o !== null && o !== u && o.side !== u.side;
    };
    const dests = moveTargets(u.def.move, u.pos, u.side, this.rules, occupied);
    if (dests.length === 0) return null;

    const enemies = this.alive(other(u.side));
    const nearest = (p: Vec) => Math.min(...enemies.map((e) => manhattan(p, e.pos)));

    const canAttack = new Map<number, boolean>();
    const isGoal = (p: Vec) => {
      const k = this.index(p);
      let v = canAttack.get(k);
      if (v === undefined) {
        v = this.enemiesInReach(u, p).length > 0;
        canAttack.set(k, v);
      }
      return v;
    };
    const distance = (start: Vec, blocked: (p: Vec) => boolean): number => {
      const seen = new Set<number>([this.index(start)]);
      let frontier = [start];
      for (let d = 0; frontier.length > 0; d++) {
        const next: Vec[] = [];
        for (const p of frontier) {
          if (isGoal(p)) return d;
          for (const n of moveTargets(u.def.move, p, u.side, this.rules, blocked)) {
            const k = this.index(n);
            if (!seen.has(k)) {
              seen.add(k);
              next.push(n);
            }
          }
        }
        frontier = next;
      }
      return Infinity;
    };
    /** Лучшая клетка хода по расстоянию (при равенстве — ближе к врагу, затем порядок шаблона). */
    const bestBy = (blocked: (p: Vec) => boolean) => {
      let best: Vec | null = null;
      let bestDist = Infinity;
      let bestNear = Infinity;
      for (const p of dests) {
        const d = distance(p, blocked);
        const n = nearest(p);
        if (d < bestDist || (d === bestDist && n < bestNear)) {
          best = p;
          bestDist = d;
          bestNear = n;
        }
      }
      return { best, bestDist, bestNear };
    };

    const real = bestBy(occupied);
    if (real.bestDist !== Infinity) return real.best;
    const through = bestBy(enemyAt);
    const here = distance(u.pos, enemyAt);
    if (through.bestDist < here) return through.best;
    // Путь сквозь своих есть, но шаг его не сокращает — ждём, пока проход освободится.
    if (here !== Infinity) return null;
    // Пути до позиции атаки нет вовсе — просто сближаемся, если это возможно.
    return real.bestNear < nearest(u.pos) ? real.best : null;
  }

  // ---------- Атака ----------

  private attack(u: Unit, target: Unit): void {
    this.events.push({ type: 'attack', unit: u.id, target: target.id });
    const dir = pushDirection(u.pos, target.pos);
    const firstStrike = this.synergy(u, 'firstStrike');
    const mult = firstStrike && !u.hasAttacked ? firstStrike.multiplier : 1;
    u.hasAttacked = true;
    const damage = Math.max(1, this.atk(u) - this.armor(target)) * mult;
    this.damage(target, damage, 'attack', u);
    if (target.hp <= 0) return;

    const curse = this.synergy(u, 'curse');
    if (curse && this.armor(target) > 0) {
      target.curse += curse.armor;
      this.events.push({ type: 'curse', unit: target.id, armor: this.armor(target) });
    }
    const power = u.def.push + (this.synergy(u, 'pushBonus')?.amount ?? 0);
    if (power > 0 && u.def.push > 0) this.push(target, dir, power, 0, this.pushContext(u));
  }

  private pushContext(u: Unit): PushContext {
    return {
      collisionBonus: findAbility(u.def, 'collisionBonus')?.amount ?? 0,
      wall: this.synergy(u, 'wall'),
      squall: findAbility(u.def, 'squall'),
    };
  }

  /** Прорыв: после хода толкнуть соседних (ортогонально) врагов от себя. */
  private breakthrough(u: Unit, power: number): void {
    const ctx = this.pushContext(u);
    for (const d of ORTHOGONAL) {
      const e = this.at(add(u.pos, d));
      if (e && e.side !== u.side && e.hp > 0 && u.hp > 0) this.push(e, d, power, 0, ctx);
    }
  }

  // ---------- Толчки ----------

  /**
   * Толчок силой power (минус устойчивость цели). Каждый шаг в пустую клетку тратит 1 силы.
   * Край поля: урон толкаемому. Фигура на пути: урон обоим, толкаемый стоит,
   * задетая фигура получает толчок силой power - 1 (цепочка; Шквал не даёт ей затухнуть).
   */
  private push(u: Unit, dir: Vec, power: number, depth: number, ctx: PushContext): void {
    const resisted = Math.max(0, power - (u.def.pushResist ?? 0));
    for (let p = resisted; p > 0; p--) {
      const to = add(u.pos, dir);
      if (!inBounds(to, this.rules)) {
        this.events.push({ type: 'collision', unit: u.id, other: null, at: to, depth });
        this.collisionDamage(u, depth, ctx);
        this.wallStun(u, depth, ctx);
        return;
      }
      const hit = this.at(to);
      if (hit) {
        this.events.push({ type: 'collision', unit: u.id, other: hit.id, at: to, depth });
        this.collisionDamage(u, depth, ctx);
        this.collisionDamage(hit, depth + 1, ctx);
        this.wallStun(u, depth, ctx);
        let next = p - 1;
        // Шквал: звено depth+1 — это (depth+2)-я фигура цепочки.
        if (ctx.squall && depth + 2 <= ctx.squall.maxLinks) next = Math.max(next, 1);
        if (hit.hp > 0 && next > 0) this.push(hit, dir, next, depth + 1, ctx);
        return;
      }
      const from = u.pos;
      this.place(u, to);
      this.events.push({ type: 'push', unit: u.id, from, to, depth });
    }
  }

  /** Урон столкновения. Броня не снижает; Тяжёлые не получают; Стена бьёт цель сильнее. */
  private collisionDamage(u: Unit, depth: number, ctx: PushContext): void {
    if (findAbility(u.def, 'heavy')) return;
    const wallBonus = ctx.wall && depth === 0 ? ctx.wall.collisionBonus : 0;
    this.damage(u, this.rules.collisionDamage + ctx.collisionBonus + wallBonus, 'collision');
  }

  /** Стена: цель удара Стража, врезавшаяся в фигуру или край, оглушается. Не суммируется. */
  private wallStun(u: Unit, depth: number, ctx: PushContext): void {
    if (!ctx.wall || depth !== 0 || u.hp <= 0 || u.stunned) return;
    u.stunned = true;
    this.events.push({ type: 'stun', unit: u.id });
  }

  // ---------- Урон, лечение, баффы ----------

  private damage(u: Unit, amount: number, source: DamageSource, attacker?: Unit): void {
    if (amount <= 0 || u.hp <= 0) return;
    const absorbed = Math.min(u.shield, amount);
    u.shield -= absorbed;
    const hpLoss = amount - absorbed;
    u.hp = Math.max(0, u.hp - hpLoss);
    this.events.push({
      type: 'damage',
      unit: u.id,
      amount,
      hp: u.hp,
      source,
      ...(absorbed > 0 ? { absorbed } : {}),
    });
    if (u.hp === 0) {
      this.grid[this.index(u.pos)] = null;
      this.events.push({ type: 'death', unit: u.id });
    } else if (hpLoss > 0) {
      const rage = findAbility(u.def, 'rage');
      if (rage && u.rageGained < rage.max) {
        const gain = Math.min(rage.atkPerHit, rage.max - u.rageGained);
        u.rageGained += gain;
        u.atkBonus += gain;
        this.buff(u, 'atk', gain, null);
      }
    }
    // Ответный удар — даже если фигура погибла от этого удара.
    const thorns = findAbility(u.def, 'thorns');
    if (thorns && source === 'attack' && attacker && attacker.hp > 0) {
      if (manhattan(attacker.pos, u.pos) === 1) this.damage(attacker, thorns.amount, 'thorns');
    }
  }

  private heal(u: Unit, amount: number, by: number): void {
    if (u.hp <= 0) return;
    const healed = Math.min(amount, u.maxHp - u.hp);
    if (healed <= 0) return;
    u.hp += healed;
    this.events.push({ type: 'heal', unit: u.id, amount: healed, hp: u.hp, by });
  }

  /** Самый раненый союзник по диагонали (при равенстве — первый по порядку DIAGONAL). */
  private woundedDiagonal(u: Unit): Unit | null {
    let best: Unit | null = null;
    for (const a of this.alliesAround(u, DIAGONAL)) {
      if (a.hp >= a.maxHp) continue;
      if (!best || a.maxHp - a.hp > best.maxHp - best.hp) best = a;
    }
    return best;
  }

  /** Лечение (Послушник): самый раненый союзник по диагонали. */
  private healAround(u: Unit): void {
    const heal = findAbility(u.def, 'heal');
    const target = heal ? this.woundedDiagonal(u) : null;
    if (heal && target) this.heal(target, heal.amount, u.id);
  }

  private buff(u: Unit, stat: BuffStat, amount: number, by: number | null): void {
    if (amount !== 0) this.events.push({ type: 'buff', unit: u.id, stat, amount, by });
  }
}

/** Симулирует бой целиком. Чистая детерминированная функция. */
export function simulate(setup: BattleSetup, rules: Rules = DEFAULT_RULES): BattleResult {
  const battle = new Battle(setup, rules);
  const initial = battle.snapshot();
  battle.run();
  const ended = battle.ended!;
  return {
    rules,
    initial,
    events: battle.events,
    final: battle.snapshot(),
    winner: ended.winner,
    reason: ended.reason,
    ticks: battle.tick,
  };
}
