import { add, inBounds, manhattan, pushDirection, toLocal } from './geometry';
import { attackTargets, moveTargets } from './patterns';
import { validateSetup } from './setup';
import { DEFAULT_RULES } from './types';
import type {
  BattleEvent,
  BattleResult,
  BattleSetup,
  DamageSource,
  EndReason,
  Rules,
  Side,
  UnitDef,
  UnitSnapshot,
  Vec,
} from './types';

interface Unit {
  readonly id: number;
  readonly def: UnitDef;
  readonly side: Side;
  pos: Vec;
  hp: number;
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
    this.units = sorted.map((u, id) => ({
      id,
      def: u.def,
      side: u.side,
      pos: u.pos,
      hp: u.def.hp,
    }));
    this.grid = new Array<Unit | null>(rules.width * rules.height).fill(null);
    for (const u of this.units) this.grid[this.index(u.pos)] = u;
  }

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

  snapshot(): UnitSnapshot[] {
    return this.units.map((u) => ({
      id: u.id,
      defId: u.def.id,
      side: u.side,
      pos: u.pos,
      hp: u.hp,
      maxHp: u.def.hp,
    }));
  }

  /**
   * Порядок действий в такте: инициатива по убыванию; при равенстве стороны
   * чередуются начиная с приоритетной (нечётный такт — A), внутри стороны —
   * передний ряд раньше, затем слева направо.
   */
  turnOrder(): Unit[] {
    const first: Side = this.tick % 2 === 1 ? 'A' : 'B';
    const inits = [...new Set(this.alive().map((u) => u.def.initiative))].sort((a, b) => b - a);
    const order: Unit[] = [];
    for (const init of inits) {
      const bySide = (side: Side) =>
        this.alive(side)
          .filter((u) => u.def.initiative === init)
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
    this.checkEnd();
    while (!this.ended && this.tick < this.rules.maxTicks) {
      this.tick++;
      this.events.push({ type: 'tick', tick: this.tick });
      for (const u of this.turnOrder()) {
        if (u.hp <= 0) continue; // погиб раньше своей очереди
        this.act(u);
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

  // ---------- Действие ----------

  private act(u: Unit): void {
    const target = this.pickTarget(u, u.pos);
    if (target) {
      this.attack(u, target);
      return;
    }
    const dest = this.pickMove(u);
    if (dest) {
      const from = u.pos;
      this.place(u, dest);
      this.events.push({ type: 'move', unit: u.id, from, to: dest });
    }
  }

  /** Враги, по которым u может ударить с клетки from. */
  private enemiesInReach(u: Unit, from: Vec): Unit[] {
    const occupied = (p: Vec) => {
      const o = this.at(p);
      return o !== null && o !== u;
    };
    return attackTargets(u.def.attack, from, u.side, this.rules, occupied)
      .map((p) => this.at(p)!)
      .filter((o) => o.side !== u.side);
  }

  /** Цель: меньше HP → ближе → меньший id. */
  private pickTarget(u: Unit, from: Vec): Unit | null {
    const enemies = this.enemiesInReach(u, from);
    let best: Unit | null = null;
    for (const e of enemies) {
      if (
        !best ||
        e.hp < best.hp ||
        (e.hp === best.hp &&
          (manhattan(from, e.pos) < manhattan(from, best.pos) ||
            (manhattan(from, e.pos) === manhattan(from, best.pos) && e.id < best.id)))
      ) {
        best = e;
      }
    }
    return best;
  }

  /**
   * Выбор хода: клетка с минимальным числом ходов до позиции атаки (BFS по текущей доске).
   * Если пути нет — клетка, строго уменьшающая манхэттен до ближайшего врага. Иначе — ждать.
   */
  private pickMove(u: Unit): Vec | null {
    const occupied = (p: Vec) => {
      const o = this.at(p);
      return o !== null && o !== u;
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
    const distance = (start: Vec): number => {
      const seen = new Set<number>([this.index(start)]);
      let frontier = [start];
      for (let d = 0; frontier.length > 0; d++) {
        const next: Vec[] = [];
        for (const p of frontier) {
          if (isGoal(p)) return d;
          for (const n of moveTargets(u.def.move, p, u.side, this.rules, occupied)) {
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

    let best: Vec | null = null;
    let bestDist = Infinity;
    let bestNear = Infinity;
    for (const p of dests) {
      const d = distance(p);
      const n = nearest(p);
      if (d < bestDist || (d === bestDist && n < bestNear)) {
        best = p;
        bestDist = d;
        bestNear = n;
      }
    }
    if (bestDist !== Infinity) return best;
    // Пути до позиции атаки нет — просто сближаемся, если это возможно.
    return bestNear < nearest(u.pos) ? best : null;
  }

  // ---------- Атака и толчки ----------

  private attack(u: Unit, target: Unit): void {
    this.events.push({ type: 'attack', unit: u.id, target: target.id });
    const dir = pushDirection(u.pos, target.pos);
    this.damage(target, u.def.atk, 'attack');
    if (target.hp > 0 && u.def.push > 0) this.push(target, dir, u.def.push);
  }

  /**
   * Толчок силой power. Каждый шаг в пустую клетку тратит 1 силы.
   * Край поля: урон толкаемому. Фигура на пути: урон обоим, толкаемый стоит,
   * задетая фигура получает толчок силой power - 1 (цепочка).
   */
  private push(u: Unit, dir: Vec, power: number): void {
    for (let p = power; p > 0; p--) {
      const to = add(u.pos, dir);
      if (!inBounds(to, this.rules)) {
        this.events.push({ type: 'collision', unit: u.id, other: null, at: to });
        this.damage(u, this.rules.collisionDamage, 'collision');
        return;
      }
      const hit = this.at(to);
      if (hit) {
        this.events.push({ type: 'collision', unit: u.id, other: hit.id, at: to });
        this.damage(u, this.rules.collisionDamage, 'collision');
        this.damage(hit, this.rules.collisionDamage, 'collision');
        if (hit.hp > 0 && p - 1 > 0) this.push(hit, dir, p - 1);
        return;
      }
      const from = u.pos;
      this.place(u, to);
      this.events.push({ type: 'push', unit: u.id, from, to });
    }
  }

  private damage(u: Unit, amount: number, source: DamageSource): void {
    if (amount <= 0 || u.hp <= 0) return;
    u.hp = Math.max(0, u.hp - amount);
    this.events.push({ type: 'damage', unit: u.id, amount, hp: u.hp, source });
    if (u.hp === 0) {
      this.grid[this.index(u.pos)] = null;
      this.events.push({ type: 'death', unit: u.id });
    }
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
