import { Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { attackZone, moveTargets } from '@chess-battler/sim';
import type { Family, Rules, Side, UnitSnapshot, Vec } from '@chess-battler/sim';
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
  /** Логическая клетка фигуры (обновляется проигрывателем по событиям). */
  cell: Vec;
  /** Экранная позиция клетки, вокруг которой живут временные смещения. */
  readonly base = { x: 0, y: 0 };
  /** Смещения выпада и тряски — независимы, чтобы перекрывающиеся анимации не конфликтовали. */
  readonly lunge = { x: 0, y: 0 };
  readonly shake = { x: 0, y: 0 };
  /** Номер текущего сдвига: новый сдвиг отменяет предыдущий (каскад может их перекрыть). */
  slideToken = 0;

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
    this.cell = snap.pos;
    this.drawHp();
  }

  /** Применяет base + смещения к позиции. */
  sync(): void {
    if (this.destroyed) return;
    this.position.set(
      this.base.x + this.lunge.x + this.shake.x,
      this.base.y + this.lunge.y + this.shake.y,
    );
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

/** Доска: клетки, подсветка, фигуры, слой эффектов. y=0 доски — внизу экрана (сторона A). */
export class BoardView extends Container {
  readonly units = new Map<number, UnitView>();
  readonly highlight = new Graphics();
  readonly unitLayer = new Container();
  readonly fxLayer = new Container();
  /** Фигура, для которой показаны клетки хода и атаки. */
  private focused: number | null = null;
  /** true — выбрана тапом (не сбрасывается при уходе курсора). */
  private pinned = false;

  constructor(readonly rules: Rules) {
    super();
    const grid = new Graphics();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const p = this.toScreen({ x, y });
        const own = y < this.rows / 2 ? 'A' : 'B';
        const light = (x + y) % 2 === 0;
        const base = own === 'A' ? (light ? 0x2a3242 : 0x232a38) : light ? 0x3a2c30 : 0x312529;
        grid.rect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL).fill({ color: base });
      }
    }
    // Линия фронта.
    const midY = PAD + (this.rows / 2) * CELL;
    grid.rect(PAD, midY - 1, this.cols * CELL, 2).fill({ color: 0xffffff, alpha: 0.18 });
    // Тап по пустому полю снимает выделение.
    grid.eventMode = 'static';
    grid.hitArea = new Rectangle(0, 0, this.pixelWidth, this.pixelHeight);
    grid.on('pointertap', () => this.clearFocus());
    this.addChild(grid, this.highlight, this.unitLayer, this.fxLayer);
  }

  get cols(): number {
    return this.rules.width;
  }

  get rows(): number {
    return this.rules.height;
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
      v.base.x = p.x;
      v.base.y = p.y;
      v.sync();
      this.bindUnit(v, s.id);
      this.units.set(s.id, v);
      this.unitLayer.addChild(v);
    }
    this.refreshHighlight();
  }

  // ---------- Подсветка хода и атаки ----------

  private bindUnit(v: UnitView, id: number): void {
    v.eventMode = 'static';
    v.cursor = 'pointer';
    v.hitArea = new Circle(0, 0, CELL * 0.45);
    // Наведение — только для мыши; на таче наведения нет, там работает тап.
    v.on('pointerover', (e) => {
      if (e.pointerType === 'mouse' && !this.pinned) this.focus(id);
    });
    v.on('pointerout', (e) => {
      if (e.pointerType === 'mouse' && !this.pinned) this.clearFocus();
    });
    v.on('pointertap', () => {
      if (this.pinned && this.focused === id) {
        this.clearFocus();
      } else {
        this.pinned = true;
        this.focus(id);
      }
    });
  }

  focus(id: number): void {
    this.focused = id;
    this.refreshHighlight();
  }

  clearFocus(): void {
    this.focused = null;
    this.pinned = false;
    this.highlight.clear();
  }

  /** Перерисовать подсветку по текущим клеткам фигур (вызывается после ходов и смертей). */
  refreshHighlight(): void {
    if (this.focused === null) return;
    const v = this.units.get(this.focused);
    if (!v) {
      this.clearFocus();
      return;
    }
    const def = getUnit(v.snap.defId);
    const side = v.snap.side;
    const others = [...this.units.values()].filter((u) => u !== v);
    const occupied = (p: Vec) => others.some((u) => u.cell.x === p.x && u.cell.y === p.y);
    const enemyAt = (p: Vec) =>
      others.some((u) => u.snap.side !== side && u.cell.x === p.x && u.cell.y === p.y);

    const g = this.highlight.clear();
    const half = CELL / 2;
    const own = this.toScreen(v.cell);
    g.rect(own.x - half + 2, own.y - half + 2, CELL - 4, CELL - 4).stroke({
      color: 0xf2c14e,
      width: 3,
    });
    for (const p of moveTargets(def.move, v.cell, side, this.rules, occupied)) {
      const c = this.toScreen(p);
      g.rect(c.x - half, c.y - half, CELL, CELL).fill({ color: 0xffffff, alpha: 0.07 });
      g.circle(c.x, c.y, 7).fill({ color: 0xffffff, alpha: 0.45 });
    }
    for (const p of attackZone(def.attack, v.cell, side, this.rules, occupied)) {
      const c = this.toScreen(p);
      const hit = enemyAt(p);
      g.rect(c.x - half + 3, c.y - half + 3, CELL - 6, CELL - 6)
        .fill({ color: 0xff3b3b, alpha: hit ? 0.35 : 0.16 })
        .stroke({ color: 0xff5b5b, width: 2, alpha: hit ? 0.95 : 0.5 });
    }
  }
}
