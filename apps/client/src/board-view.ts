import { Container, Graphics, Text } from 'pixi.js';
import type { Family, Side, UnitSnapshot, Vec } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';

export const CELL = 76;
export const PAD = 10;

const SIDE_COLOR: Record<Side, number> = { A: 0x4da3ff, B: 0xff6b5b };
const GLYPH: Record<Family, string> = {
  legion: '♟',
  riders: '♞',
  mystics: '♝',
  guards: '♜',
};

export class UnitView extends Container {
  private readonly hpBar = new Graphics();
  hp: number;

  constructor(
    readonly snap: UnitSnapshot,
    readonly maxHp: number,
  ) {
    super();
    const def = getUnit(snap.defId);
    const color = SIDE_COLOR[snap.side];
    const r = CELL * 0.38;

    const body = new Graphics()
      .circle(0, 0, r)
      .fill({ color: 0x1d2029 })
      .stroke({ color, width: 3 });
    const glyph = new Text({
      text: GLYPH[def.family],
      style: { fontFamily: 'serif', fontSize: 34, fill: color },
    });
    glyph.anchor.set(0.5, 0.6);
    const label = new Text({
      text: def.name,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 9, fill: 0xc8cad3 },
    });
    label.anchor.set(0.5, 0);
    label.y = r * 0.35;

    this.hpBar.y = r + 4;
    this.addChild(body, glyph, label, this.hpBar);
    this.hp = snap.hp;
    this.drawHp();
  }

  setHp(hp: number): void {
    this.hp = hp;
    this.drawHp();
  }

  private drawHp(): void {
    const w = CELL * 0.7;
    const frac = Math.max(0, this.hp) / this.maxHp;
    this.hpBar
      .clear()
      .rect(-w / 2, 0, w, 5)
      .fill({ color: 0x000000, alpha: 0.6 })
      .rect(-w / 2, 0, w * frac, 5)
      .fill({ color: frac > 0.5 ? 0x5ad17a : frac > 0.25 ? 0xf2c14e : 0xff5b5b });
  }
}

/** Доска: клетки, фигуры, слой эффектов. y=0 доски — внизу экрана (сторона A). */
export class BoardView extends Container {
  readonly units = new Map<number, UnitView>();
  readonly unitLayer = new Container();
  readonly fxLayer = new Container();

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    super();
    const grid = new Graphics();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const p = this.toScreen({ x, y });
        const own = y < rows / 2 ? 'A' : 'B';
        const light = (x + y) % 2 === 0;
        const base = own === 'A' ? (light ? 0x2a3242 : 0x232a38) : light ? 0x3a2c30 : 0x312529;
        grid.rect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL).fill({ color: base });
      }
    }
    // Линия фронта.
    const midY = PAD + (rows / 2) * CELL;
    grid.rect(PAD, midY - 1, cols * CELL, 2).fill({ color: 0xffffff, alpha: 0.18 });
    this.addChild(grid, this.unitLayer, this.fxLayer);
  }

  get pixelWidth(): number {
    return this.cols * CELL + PAD * 2;
  }

  get pixelHeight(): number {
    return this.rows * CELL + PAD * 2;
  }

  toScreen(p: Vec): { x: number; y: number } {
    return {
      x: PAD + p.x * CELL + CELL / 2,
      y: PAD + (this.rows - 1 - p.y) * CELL + CELL / 2,
    };
  }

  setUnits(snaps: readonly UnitSnapshot[]): void {
    for (const v of this.units.values()) v.destroy({ children: true });
    this.units.clear();
    this.fxLayer.removeChildren().forEach((c) => c.destroy());
    for (const s of snaps) {
      if (s.hp <= 0) continue;
      const v = new UnitView(s, s.maxHp);
      const p = this.toScreen(s.pos);
      v.position.set(p.x, p.y);
      this.units.set(s.id, v);
      this.unitLayer.addChild(v);
    }
  }
}
