import { Graphics, Text } from 'pixi.js';
import type { BattleEvent, BattleResult, Vec } from '@chess-battler/sim';
import type { BoardView, UnitView } from './board-view';
import { CELL } from './board-view';
import { PACING, groupByTick, involvedUnits, staggerMs } from './timeline';
import type { ActionGroup } from './timeline';
import type { Tweener } from './tween';
import { easeInOutQuad, easeOutCubic } from './tween';

/** Длительности анимаций на ×1, мс. */
const MS = {
  telegraph: 140,
  move: 240,
  lunge: 170,
  damageBeat: 60,
  floatText: 650,
  push: 160,
  collision: 200,
  death: 260,
} as const;

/**
 * Проигрывает лог событий боя на доске. Никакой игровой логики — только анимация.
 * Такт = каскад действий со сдвигом staggerMs; следующий такт начинается, когда все
 * анимации такта закончились (но не раньше PACING.minTickMs).
 */
export class BattlePlayer {
  private skipping = false;

  constructor(
    private readonly board: BoardView,
    private readonly tw: Tweener,
    private readonly onTick: (tick: number) => void,
  ) {}

  /** Мгновенно доиграть: все текущие твины завершаются, проигрыватель ставит итог. */
  skip(): void {
    this.skipping = true;
    this.tw.fastForward = true;
  }

  async play(result: BattleResult): Promise<void> {
    this.skipping = false;
    this.tw.fastForward = false;
    this.board.setUnits(result.initial);
    for (const tick of groupByTick(result.events)) {
      if (this.skipping) break;
      this.onTick(tick.tick);
      const step = staggerMs(tick.actions.length);
      // Действия идут каскадом и перекрываются, но действие с общими фигурами ждёт
      // окончания более ранних — иначе анимации одной фигуры пойдут не в том порядке.
      const lastByUnit = new Map<number, Promise<void>>();
      const actions = tick.actions.map((action, i) => {
        const units = involvedUnits(action);
        const deps = units.flatMap((u) => lastByUnit.get(u) ?? []);
        const done = (async () => {
          await Promise.all([this.tw.wait(i * step), ...deps]);
          await this.playAction(action);
        })();
        for (const u of units) lastByUnit.set(u, done);
        return done;
      });
      await Promise.all([this.tw.wait(PACING.minTickMs), ...actions]);
    }
    this.tw.fastForward = false;
    if (this.skipping) {
      this.board.setUnits(result.final);
      this.onTick(result.ticks);
    }
  }

  private unit(id: number): UnitView | undefined {
    return this.board.units.get(id);
  }

  private async playAction(action: ActionGroup): Promise<void> {
    for (const e of action.events) await this.apply(e);
  }

  private async apply(e: BattleEvent): Promise<void> {
    switch (e.type) {
      case 'move':
        return this.slide(e.unit, e.to, MS.move, easeInOutQuad);
      case 'push':
        return this.slide(e.unit, e.to, MS.push, easeOutCubic);
      case 'attack':
        return this.attack(e.unit, e.target);
      case 'damage':
        return this.damage(e.unit, e.amount, e.hp, e.source === 'collision');
      case 'collision':
        return this.collision(e.unit, e.other, e.at);
      case 'death':
        return this.death(e.unit);
      case 'tick':
      case 'end':
        return;
    }
  }

  private slide(id: number, to: Vec, ms: number, ease: (t: number) => number): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    v.cell = to;
    const token = ++v.slideToken;
    const from = { ...v.base };
    const dst = this.board.toScreen(to);
    this.board.refreshHighlight();
    return this.tw.run(ms, (t) => {
      if (token !== v.slideToken) return; // перехвачен более новым сдвигом
      const k = ease(t);
      v.base.x = from.x + (dst.x - from.x) * k;
      v.base.y = from.y + (dst.y - from.y) * k;
      v.sync();
    });
  }

  private async attack(id: number, targetId: number): Promise<void> {
    const v = this.unit(id);
    const target = this.unit(targetId);
    if (!v || !target) return;
    const dx = target.base.x - v.base.x;
    const dy = target.base.y - v.base.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(CELL * 0.35, len * 0.4);
    await this.telegraph(target);
    this.board.unitLayer.addChild(v); // поверх остальных
    await this.tw.run(MS.lunge, (t) => {
      const k = Math.sin(t * Math.PI) * reach;
      v.lunge.x = (dx / len) * k;
      v.lunge.y = (dy / len) * k;
      v.sync();
    });
    v.lunge.x = v.lunge.y = 0;
    v.sync();
  }

  /** «Телеграф»: короткая вспышка-прицел на цели перед ударом. */
  private async telegraph(target: UnitView): Promise<void> {
    const ring = new Graphics()
      .circle(0, 0, CELL * 0.44)
      .stroke({ color: 0xff3b3b, width: 4 })
      .circle(0, 0, CELL * 0.44)
      .fill({ color: 0xff3b3b, alpha: 0.18 });
    ring.position.set(target.base.x, target.base.y);
    this.board.fxLayer.addChild(ring);
    await this.tw.run(MS.telegraph, (t) => {
      if (ring.destroyed) return;
      ring.scale.set(1.35 - 0.35 * easeOutCubic(t));
      ring.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    });
    if (!ring.destroyed) ring.destroy();
  }

  private floatText(text: string, x: number, y: number, color: number, size = 20): void {
    const label = new Text({
      text,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: size,
        fontWeight: '800',
        fill: color,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x, y);
    this.board.fxLayer.addChild(label);
    void this.tw
      .run(MS.floatText, (t) => {
        if (label.destroyed) return;
        label.y = y - easeOutCubic(t) * 26;
        label.alpha = 1 - t * t;
      })
      .then(() => !label.destroyed && label.destroy());
  }

  private damage(id: number, amount: number, hp: number, collision: boolean): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    v.setHp(hp);
    this.floatText(`-${amount}`, v.base.x, v.base.y - CELL * 0.3, collision ? 0xffa53a : 0xff4d4d);
    return this.tw.wait(MS.damageBeat);
  }

  private async collision(id: number, otherId: number | null, at: Vec): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    // Вспышка в точке удара: между фигурой и клеткой, куда её толкнули.
    const dst = this.board.toScreen(at);
    const spark = new Graphics().star(0, 0, 6, CELL * 0.22, CELL * 0.1).fill({ color: 0xfff1a8 });
    spark.position.set((v.base.x + dst.x) / 2, (v.base.y + dst.y) / 2);
    this.board.fxLayer.addChild(spark);

    const shaken = [v, otherId === null ? undefined : this.unit(otherId)].filter(
      (u): u is UnitView => !!u,
    );
    await this.tw.run(MS.collision, (t) => {
      const off = Math.sin(t * Math.PI * 8) * (1 - t) * 6;
      for (const u of shaken) {
        u.shake.x = off;
        u.sync();
      }
      if (spark.destroyed) return;
      spark.scale.set(0.6 + t * 0.8);
      spark.alpha = 1 - t;
    });
    for (const u of shaken) {
      u.shake.x = 0;
      u.sync();
    }
    if (!spark.destroyed) spark.destroy();
  }

  private async death(id: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    // Убираем из карты сразу: последующие действия каскада уже не должны её находить.
    this.board.units.delete(id);
    this.board.refreshHighlight();
    await this.tw.run(MS.death, (t) => {
      if (v.destroyed) return;
      v.alpha = 1 - t;
      v.scale.set(1 - t * 0.4);
    });
    if (!v.destroyed) v.destroy({ children: true });
  }
}
