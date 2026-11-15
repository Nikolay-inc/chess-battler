import { Circle, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { attackZone, moveTargets } from '@chess-battler/sim';
import type { Family, Rules, Side, Stars, Vec } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';
import type { BoardSkin } from '@chess-battler/content';
import { t, unitName } from './i18n';
import { px, tokens } from './theme/tokens';

export const CELL = 76;
export const PAD = 10;
/** Отступ между доской и скамейкой. */
export const BENCH_GAP = 14;

/** Цвет рамки своих фигур (косметика); null — цвет стороны. */
let playerFrame: number | null = null;
export function setPlayerFrame(hex: string | null): void {
  playerFrame = hex ? parseInt(hex.slice(1), 16) : null;
}

export const SIDE_COLOR: Record<Side, number> = { A: px('sideA'), B: px('sideB') };
export const GLYPH: Record<Family, string> = {
  legion: '♟',
  riders: '♞',
  mystics: '♝',
  guards: '♜',
};

/** Данные для отрисовки фигуры: снимок боя или фигура забега. */
export interface UnitLook {
  readonly id: number;
  readonly defId: string;
  readonly side: Side;
  readonly pos: Vec;
  readonly hp: number;
  readonly maxHp: number;
  readonly stars: Stars;
}

export class UnitView extends Container {
  private readonly hpBar = new Graphics();
  private readonly badge: Text;
  hp: number;
  maxHp: number;
  shield = 0;
  /** Логическая клетка фигуры (обновляется проигрывателем по событиям). */
  cell: Vec;
  /** Экранная позиция клетки, вокруг которой живут временные смещения. */
  readonly base = { x: 0, y: 0 };
  /** Смещения выпада и тряски — независимы, чтобы перекрывающиеся анимации не конфликтовали. */
  readonly lunge = { x: 0, y: 0 };
  readonly shake = { x: 0, y: 0 };
  /** Номер текущего сдвига: новый сдвиг отменяет предыдущий (каскад может их перекрыть). */
  slideToken = 0;

  constructor(readonly look: UnitLook) {
    super();
    const def = getUnit(look.defId);
    const color = SIDE_COLOR[look.side];
    const r = CELL * 0.38;
    // Рамка своих фигур — косметика игрока (сторона A).
    const ring = look.side === 'A' && playerFrame !== null ? playerFrame : color;

    const body = new Graphics()
      .circle(0, 0, r)
      .fill({ color: px('unitBody') })
      .stroke({ color: ring, width: look.stars > 1 ? 4 : 3 });
    if (look.stars === 3) body.circle(0, 0, r + 4).stroke({ color: px('accent'), width: 2 });
    const glyph = new Text({
      text: GLYPH[def.family],
      style: { fontFamily: tokens.font.glyph, fontSize: 34, fill: color },
    });
    glyph.anchor.set(0.5, 0.6);
    const label = new Text({
      text: unitName(def.id),
      style: { fontFamily: tokens.font.family, fontSize: 9, fill: px('unitLabel') },
    });
    label.anchor.set(0.5, 0);
    label.y = r * 0.35;
    this.addChild(body, glyph, label);

    if (look.stars > 1) {
      const stars = new Text({
        text: '★'.repeat(look.stars),
        style: {
          fontFamily: tokens.font.family,
          fontSize: 12,
          fill: px('accent'),
          stroke: { color: px('shadow'), width: 3 },
        },
      });
      stars.anchor.set(0.5, 0.5);
      stars.y = -r - 1;
      this.addChild(stars);
    }

    this.badge = new Text({
      text: '',
      style: { fontFamily: tokens.font.family, fontSize: 16 },
    });
    this.badge.anchor.set(0.5);
    this.badge.position.set(r * 0.85, -r * 0.75);
    this.hpBar.y = r + 4;
    this.addChild(this.hpBar, this.badge);
    this.hp = look.hp;
    this.maxHp = look.maxHp;
    this.cell = look.pos;
    this.drawHp();
  }

  get side(): Side {
    return this.look.side;
  }

  /** Применяет base + смещения к позиции. */
  sync(): void {
    if (this.destroyed) return;
    this.position.set(
      this.base.x + this.lunge.x + this.shake.x,
      this.base.y + this.lunge.y + this.shake.y,
    );
  }

  setHp(hp: number, maxHp = this.maxHp): void {
    this.hp = hp;
    this.maxHp = maxHp;
    this.drawHp();
  }

  setShield(shield: number): void {
    this.shield = Math.max(0, shield);
    this.drawHp();
  }

  /** Значок состояния над фигурой (оглушение). */
  setBadge(text: string): void {
    if (!this.destroyed) this.badge.text = text;
  }

  private drawHp(): void {
    if (this.destroyed) return;
    const w = CELL * 0.7;
    const frac = Math.max(0, this.hp) / this.maxHp;
    const g = this.hpBar
      .clear()
      .rect(-w / 2, 0, w, 5)
      .fill({ color: px('shadow'), alpha: 0.6 })
      .rect(-w / 2, 0, w * frac, 5)
      .fill({ color: frac > 0.5 ? px('success') : frac > 0.25 ? px('accent') : px('danger') });
    if (this.shield > 0) {
      const sw = Math.min(w, (w * this.shield) / this.maxHp);
      g.rect(-w / 2, -3, sw, 3).fill({ color: px('info') });
    }
  }
}

export type UnitBinder = (v: UnitView) => void;

/** Доска: клетки, подсветка, фигуры, слой эффектов. y=0 доски — внизу экрана (сторона A). */
export class BoardView extends Container {
  readonly units = new Map<number, UnitView>();
  readonly highlight = new Graphics();
  readonly unitLayer = new Container();
  readonly fxLayer = new Container();
  private readonly enemyVeil = new Container();
  private readonly grid = new Graphics();
  private readonly veilText: Text;
  /** Фигура, для которой показаны клетки хода и атаки. */
  private focused: number | null = null;
  /** true — выбрана тапом (не сбрасывается при уходе курсора). */
  private pinned = false;
  /** Вызывается при смене выбранной фигуры (для панели информации). */
  onFocusChange: (v: UnitView | null) => void = () => {};

  constructor(readonly rules: Rules) {
    super();
    const grid = this.grid;
    this.applySkin(null);
    // Тап по пустому полю снимает выделение.
    grid.eventMode = 'static';
    grid.hitArea = new Rectangle(0, 0, this.pixelWidth, this.pixelHeight);
    grid.on('pointertap', () => this.clearFocus());

    // Затемнение половины соперника во время подготовки.
    const veil = new Graphics()
      .rect(PAD, PAD, this.cols * CELL, (this.rows / 2) * CELL)
      .fill({ color: px('bg'), alpha: 0.55 });
    const veilText = (this.veilText = new Text({
      text: t('play.enemyHidden'),
      style: { fontFamily: tokens.font.family, fontSize: 15, fill: px('textMuted') },
    }));
    veilText.anchor.set(0.5);
    veilText.position.set(this.pixelWidth / 2, PAD + (this.rows / 4) * CELL);
    // В Pixi v8 детей могут иметь только Container, не Graphics.
    this.enemyVeil.addChild(veil, veilText);
    this.enemyVeil.visible = false;

    this.addChild(grid, this.enemyVeil, this.highlight, this.unitLayer, this.fxLayer);
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

  /** Обновить надписи после смены языка. */
  relabel(): void {
    this.veilText.text = t('play.enemyHidden');
  }

  /** Скин доски (косметика): цвета клеток; null — из дизайн-токенов. */
  applySkin(skin: BoardSkin | null): void {
    const color = (hex: string | undefined, token: Parameters<typeof px>[0]) =>
      hex ? parseInt(hex.slice(1), 16) : px(token);
    const g = this.grid.clear();
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const p = this.toScreen({ x, y });
        const own = y < this.rows / 2;
        const light = (x + y) % 2 === 0;
        const base = own
          ? light
            ? color(skin?.ownLight, 'boardOwnLight')
            : color(skin?.ownDark, 'boardOwnDark')
          : light
            ? color(skin?.enemyLight, 'boardEnemyLight')
            : color(skin?.enemyDark, 'boardEnemyDark');
        g.rect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL).fill({ color: base });
      }
    }
    // Линия фронта.
    const midY = PAD + (this.rows / 2) * CELL;
    g.rect(PAD, midY - 1, this.cols * CELL, 2).fill({ color: px('border'), alpha: 0.18 });
  }

  set veiled(v: boolean) {
    this.enemyVeil.visible = v;
  }

  toScreen(p: Vec): { x: number; y: number } {
    return {
      x: PAD + p.x * CELL + CELL / 2,
      y: PAD + (this.rows - 1 - p.y) * CELL + CELL / 2,
    };
  }

  /** Клетка доски под точкой (в координатах доски) или null. */
  cellAt(x: number, y: number): Vec | null {
    const cx = Math.floor((x - PAD) / CELL);
    const cy = this.rows - 1 - Math.floor((y - PAD) / CELL);
    return cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows ? { x: cx, y: cy } : null;
  }

  /**
   * Пересоздать фигуры. binder — свои обработчики (подготовка);
   * по умолчанию — подсветка по наведению/тапу (бой).
   */
  setUnits(looks: readonly UnitLook[], binder?: UnitBinder): void {
    for (const v of this.units.values()) v.destroy({ children: true });
    this.units.clear();
    this.fxLayer.removeChildren().forEach((c) => c.destroy());
    for (const s of looks) {
      if (s.hp <= 0) continue;
      const v = new UnitView(s);
      const p = this.toScreen(s.pos);
      v.base.x = p.x;
      v.base.y = p.y;
      v.sync();
      v.eventMode = 'static';
      v.cursor = 'pointer';
      v.hitArea = new Circle(0, 0, CELL * 0.45);
      (binder ?? ((u) => this.bindHighlight(u)))(v);
      this.units.set(s.id, v);
      this.unitLayer.addChild(v);
    }
    this.refreshHighlight();
  }

  // ---------- Подсветка хода и атаки ----------

  private bindHighlight(v: UnitView): void {
    const id = v.look.id;
    // Наведение — только для мыши; на таче наведения нет, там работает тап.
    v.on('pointerover', (e) => {
      if (e.pointerType === 'mouse' && !this.pinned) this.focus(id);
    });
    v.on('pointerout', (e) => {
      if (e.pointerType === 'mouse' && !this.pinned) this.clearFocus();
    });
    v.on('pointertap', () => this.toggleFocus(id));
  }

  /** Тап по фигуре: выбрать или снять выбор. */
  toggleFocus(id: number): void {
    if (this.pinned && this.focused === id) {
      this.clearFocus();
    } else {
      this.pinned = true;
      this.focus(id);
    }
  }

  focus(id: number): void {
    this.focused = id;
    this.refreshHighlight();
    this.onFocusChange(this.units.get(id) ?? null);
  }

  clearFocus(): void {
    const had = this.focused !== null;
    this.focused = null;
    this.pinned = false;
    this.highlight.clear();
    if (had) this.onFocusChange(null);
  }

  /** Перерисовать подсветку по текущим клеткам фигур (вызывается после ходов и смертей). */
  refreshHighlight(): void {
    if (this.focused === null) return;
    const v = this.units.get(this.focused);
    if (!v) {
      this.clearFocus();
      return;
    }
    const def = getUnit(v.look.defId);
    const side = v.side;
    const others = [...this.units.values()].filter((u) => u !== v);
    const occupied = (p: Vec) => others.some((u) => u.cell.x === p.x && u.cell.y === p.y);
    const enemyAt = (p: Vec) =>
      others.some((u) => u.side !== side && u.cell.x === p.x && u.cell.y === p.y);

    const g = this.highlight.clear();
    const half = CELL / 2;
    const own = this.toScreen(v.cell);
    g.rect(own.x - half + 2, own.y - half + 2, CELL - 4, CELL - 4).stroke({
      color: px('accent'),
      width: 3,
    });
    for (const p of moveTargets(def.move, v.cell, side, this.rules, occupied)) {
      const c = this.toScreen(p);
      g.rect(c.x - half, c.y - half, CELL, CELL).fill({ color: px('border'), alpha: 0.07 });
      g.circle(c.x, c.y, 7).fill({ color: px('border'), alpha: 0.45 });
    }
    for (const p of attackZone(def.attack, v.cell, side, this.rules, occupied)) {
      const c = this.toScreen(p);
      const hit = enemyAt(p);
      g.rect(c.x - half + 3, c.y - half + 3, CELL - 6, CELL - 6)
        .fill({ color: px('fxTelegraph'), alpha: hit ? 0.35 : 0.16 })
        .stroke({ color: px('danger'), width: 2, alpha: hit ? 0.95 : 0.5 });
    }
  }
}

/** Скамейка под доской: слоты в ряд. */
export class BenchView extends Container {
  readonly units = new Map<number, UnitView>();
  private readonly slotsG = new Graphics();
  private readonly title: Text;

  constructor(
    readonly slots: number,
    private readonly areaWidth: number,
  ) {
    super();
    this.title = new Text({
      text: t('play.bench'),
      style: { fontFamily: tokens.font.family, fontSize: 11, fill: px('textMuted') },
    });
    this.title.position.set(PAD, 0);
    this.addChild(this.slotsG, this.title);
    this.draw(-1);
  }

  get pixelHeight(): number {
    return CELL + 18;
  }

  /** Обновить надписи после смены языка. */
  relabel(): void {
    this.title.text = t('play.bench');
  }

  slotCenter(i: number): { x: number; y: number } {
    const total = this.slots * CELL + (this.slots - 1) * 8;
    const x0 = (this.areaWidth - total) / 2;
    return { x: x0 + i * (CELL + 8) + CELL / 2, y: 16 + CELL / 2 };
  }

  /** Индекс слота под точкой (в координатах скамейки) или null. */
  slotAt(x: number, y: number): number | null {
    for (let i = 0; i < this.slots; i++) {
      const c = this.slotCenter(i);
      if (Math.abs(x - c.x) <= CELL / 2 + 4 && Math.abs(y - c.y) <= CELL / 2 + 4) return i;
    }
    return null;
  }

  /** hovered — слот, над которым тащат фигуру (-1 — нет). */
  draw(hovered: number): void {
    this.slotsG.clear();
    for (let i = 0; i < this.slots; i++) {
      const c = this.slotCenter(i);
      this.slotsG
        .roundRect(c.x - CELL / 2, c.y - CELL / 2, CELL, CELL, 10)
        .fill({ color: i === hovered ? px('surfaceHover') : px('surface') })
        .stroke({ color: px('border'), alpha: i === hovered ? 0.4 : 0.08, width: 1 });
    }
  }

  setUnits(looks: readonly (UnitLook | null)[], binder: UnitBinder): void {
    for (const v of this.units.values()) v.destroy({ children: true });
    this.units.clear();
    looks.forEach((look, i) => {
      if (!look) return;
      const v = new UnitView(look);
      const c = this.slotCenter(i);
      v.base.x = c.x;
      v.base.y = c.y;
      v.sync();
      v.eventMode = 'static';
      v.cursor = 'grab';
      v.hitArea = new Circle(0, 0, CELL * 0.45);
      binder(v);
      this.units.set(look.id, v);
      this.addChild(v);
    });
  }
}
