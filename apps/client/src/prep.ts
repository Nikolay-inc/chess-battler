import { Graphics, Point } from 'pixi.js';
import type { Application, FederatedPointerEvent } from 'pixi.js';
import { getUnit } from '@chess-battler/content';
import { DEFAULT_RULES, sellValue, starScaledDef } from '@chess-battler/sim';
import type { Location, OwnedUnit, RunAction, RunConfig, RunState, Vec } from '@chess-battler/sim';
import type { BenchView, BoardView, UnitLook, UnitView } from './board-view';
import { CELL } from './board-view';
import { px } from './theme/tokens';

/** Сдвиг (в CSS-пикселях), после которого касание считается перетаскиванием. */
const DRAG_THRESHOLD = 8;

interface Drag {
  readonly view: UnitView;
  readonly from: Location;
  readonly unit: OwnedUnit;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  dragging: boolean;
}

export interface PrepCallbacks {
  /** Применить действие забега; false — действие отклонено. */
  dispatch(action: RunAction): boolean;
  /** Тап по фигуре (без перетаскивания). */
  onTap(unit: OwnedUnit, from: Location): void;
  /** Тащат фигуру: показать/скрыть подсказку продажи. null — не тащат. */
  onDragState(sell: number | null, overShop: boolean): void;
}

/** Расстановка перетаскиванием: доска (свои 3 ряда) ⇄ скамейка, продажа — бросок на магазин. */
export class PrepController {
  private drag: Drag | null = null;
  private state: RunState | null = null;
  private readonly hoverCell = new Graphics();

  constructor(
    private readonly app: Application,
    private readonly board: BoardView,
    private readonly bench: BenchView,
    private readonly shopEl: HTMLElement,
    private readonly cfg: RunConfig,
    private readonly cb: PrepCallbacks,
  ) {
    board.addChildAt(this.hoverCell, 2);
    const canvas = app.canvas;
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onCancel(e));
  }

  private look(u: OwnedUnit, pos: Vec): UnitLook {
    const hp = starScaledDef(getUnit(u.unit), u.stars, DEFAULT_RULES).hp;
    return { id: u.uid, defId: u.unit, side: 'A', pos, hp, maxHp: hp, stars: u.stars };
  }

  /** Перерисовать фигуры игрока по состоянию забега. */
  render(s: RunState): void {
    this.state = s;
    this.drag = null;
    this.hoverCell.clear();
    this.bench.draw(-1);
    const byUid = new Map<number, { unit: OwnedUnit; from: Location }>();
    for (const b of s.board) byUid.set(b.uid, { unit: b, from: { area: 'board', x: b.x, y: b.y } });
    s.bench.forEach(
      (b, index) => b && byUid.set(b.uid, { unit: b, from: { area: 'bench', index } }),
    );
    const bind = (v: UnitView) => {
      const entry = byUid.get(v.look.id)!;
      v.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(v, entry.unit, entry.from, e));
    };
    this.board.setUnits(
      s.board.map((b) => this.look(b, { x: b.x, y: b.y })),
      bind,
    );
    this.bench.setUnits(
      s.bench.map((b) => (b ? this.look(b, { x: -1, y: -1 }) : null)),
      bind,
    );
  }

  private onDown(view: UnitView, unit: OwnedUnit, from: Location, e: FederatedPointerEvent): void {
    if (this.drag || !this.state) return;
    this.drag = {
      view,
      unit,
      from,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
    };
    // Захват указателя: события продолжают приходить, даже если палец ушёл за canvas.
    try {
      this.app.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Некоторые синтетические события не поддерживают захват — перетаскивание всё равно работает над canvas.
    }
  }

  /** Клиентские координаты → координаты сцены Pixi (сцена не масштабируется). */
  private toStage(clientX: number, clientY: number): Point {
    const p = new Point();
    this.app.renderer.events.mapPositionToPoint(p, clientX, clientY);
    return p;
  }

  private overShop(clientX: number, clientY: number): boolean {
    const r = this.shopEl.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.dragging) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
      d.dragging = true;
      this.board.clearFocus();
      this.app.stage.addChild(d.view); // поверх всего
      d.view.scale.set(1.1);
    }
    const p = this.toStage(e.clientX, e.clientY);
    d.view.position.set(p.x, p.y);
    const target = this.targetAt(e.clientX, e.clientY);
    this.drawHover(target);
    const shop = target === 'sell';
    this.cb.onDragState(sellValue(d.unit.stars, this.cfg), shop);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId || !this.state) return;
    this.release(e.pointerId);
    this.cb.onDragState(null, false);
    if (!d.dragging) {
      this.drag = null;
      this.cb.onTap(d.unit, d.from);
      return;
    }
    const target = this.targetAt(e.clientX, e.clientY);
    const action: RunAction | null =
      target === 'sell'
        ? { type: 'sell', from: d.from }
        : target
          ? { type: 'move', from: d.from, to: target }
          : null;
    const ok = action ? this.cb.dispatch(action) : false;
    // При успехе игра перерисует всё сама; иначе — вернуть фигуру на место.
    if (!ok) this.render(this.state);
  }

  private onCancel(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId || !this.state) return;
    this.release(e.pointerId);
    this.cb.onDragState(null, false);
    this.render(this.state);
  }

  private release(pointerId: number): void {
    try {
      if (this.app.canvas.hasPointerCapture(pointerId))
        this.app.canvas.releasePointerCapture(pointerId);
    } catch {
      // см. onDown
    }
  }

  /** Куда упадёт фигура: клетка своих рядов, слот скамейки, продажа или никуда. */
  private targetAt(clientX: number, clientY: number): Location | 'sell' | null {
    if (this.overShop(clientX, clientY)) return 'sell';
    const p = this.toStage(clientX, clientY);
    const local = this.board.toLocal(p);
    const cell = this.board.cellAt(local.x, local.y);
    if (cell) return cell.y < this.board.rows / 2 ? { area: 'board', x: cell.x, y: cell.y } : null;
    const bp = this.bench.toLocal(p);
    const slot = this.bench.slotAt(bp.x, bp.y);
    return slot === null ? null : { area: 'bench', index: slot };
  }

  private drawHover(target: Location | 'sell' | null): void {
    this.hoverCell.clear();
    this.bench.draw(target && target !== 'sell' && target.area === 'bench' ? target.index : -1);
    if (target && target !== 'sell' && target.area === 'board') {
      const c = this.board.toScreen(target);
      this.hoverCell
        .roundRect(c.x - CELL / 2 + 3, c.y - CELL / 2 + 3, CELL - 6, CELL - 6, 8)
        .fill({ color: px('sideA'), alpha: 0.18 })
        .stroke({ color: px('sideA'), width: 2, alpha: 0.8 });
    }
  }
}
