import { Graphics, Text } from 'pixi.js';
import type { BattleEvent, BattleResult, Vec } from '@chess-battler/sim';
import type { BoardView, UnitView } from './board-view';
import { CELL } from './board-view';
import type { Tweener } from './tween';
import { easeInOutQuad, easeOutCubic } from './tween';

/** Проигрывает лог событий боя на доске. Никакой игровой логики — только анимация. */
export class BattlePlayer {
  constructor(
    private readonly board: BoardView,
    private readonly tw: Tweener,
    private readonly onTick: (tick: number) => void,
  ) {}

  async play(result: BattleResult): Promise<void> {
    this.board.setUnits(result.initial);
    for (const e of result.events) await this.apply(e);
  }

  private unit(id: number): UnitView | undefined {
    return this.board.units.get(id);
  }

  private async apply(e: BattleEvent): Promise<void> {
    switch (e.type) {
      case 'tick':
        this.onTick(e.tick);
        return this.tw.wait(120);
      case 'move':
        return this.slide(e.unit, e.to, 260);
      case 'push':
        return this.slide(e.unit, e.to, 170);
      case 'attack':
        return this.lunge(e.unit, e.target);
      case 'damage':
        return this.damage(e.unit, e.amount, e.hp, e.source === 'collision');
      case 'collision':
        return this.collision(e.unit, e.other, e.at);
      case 'death':
        return this.death(e.unit);
      case 'end':
        return;
    }
  }

  private slide(id: number, to: Vec, ms: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    const from = { x: v.x, y: v.y };
    const dst = this.board.toScreen(to);
    return this.tw.run(ms, (t) => {
      const k = easeInOutQuad(t);
      v.position.set(from.x + (dst.x - from.x) * k, from.y + (dst.y - from.y) * k);
    });
  }

  private async lunge(id: number, targetId: number): Promise<void> {
    const v = this.unit(id);
    const target = this.unit(targetId);
    if (!v || !target) return;
    const home = { x: v.x, y: v.y };
    const dx = target.x - home.x;
    const dy = target.y - home.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = Math.min(CELL * 0.35, len * 0.4);
    this.board.unitLayer.addChild(v); // поверх остальных
    await this.tw.run(200, (t) => {
      const k = Math.sin(t * Math.PI) * reach;
      v.position.set(home.x + (dx / len) * k, home.y + (dy / len) * k);
    });
    v.position.set(home.x, home.y);
  }

  private damage(id: number, amount: number, hp: number, collision: boolean): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    v.setHp(hp);
    const label = new Text({
      text: `-${amount}`,
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 20,
        fontWeight: '800',
        fill: collision ? 0xffa53a : 0xff4d4d,
        stroke: { color: 0x000000, width: 4 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(v.x, v.y - CELL * 0.3);
    this.board.fxLayer.addChild(label);
    const y0 = label.y;
    void this.tw
      .run(650, (t) => {
        label.y = y0 - easeOutCubic(t) * 26;
        label.alpha = 1 - t * t;
      })
      .then(() => label.destroy());
    return this.tw.wait(90);
  }

  private async collision(id: number, otherId: number | null, at: Vec): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    // Вспышка в точке удара: между фигурой и клеткой, куда её толкнули.
    const dst = this.board.toScreen(at);
    const spark = new Graphics().star(0, 0, 6, CELL * 0.22, CELL * 0.1).fill({ color: 0xfff1a8 });
    spark.position.set((v.x + dst.x) / 2, (v.y + dst.y) / 2);
    this.board.fxLayer.addChild(spark);

    const shaken = [v, otherId === null ? undefined : this.unit(otherId)].filter(
      (u): u is UnitView => !!u,
    );
    const homes = shaken.map((u) => ({ x: u.x, y: u.y }));
    await this.tw.run(220, (t) => {
      const amp = (1 - t) * 6;
      const off = Math.sin(t * Math.PI * 8) * amp;
      shaken.forEach((u, i) => u.position.set(homes[i]!.x + off, homes[i]!.y));
      spark.scale.set(0.6 + t * 0.8);
      spark.alpha = 1 - t;
    });
    shaken.forEach((u, i) => u.position.set(homes[i]!.x, homes[i]!.y));
    spark.destroy();
  }

  private async death(id: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    await this.tw.run(280, (t) => {
      v.alpha = 1 - t;
      v.scale.set(1 - t * 0.4);
    });
    this.board.units.delete(id);
    v.destroy({ children: true });
  }
}
