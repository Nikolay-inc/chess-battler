import { Graphics, Text } from 'pixi.js';
import type { BattleEvent, BattleResult, BuffStat, Vec } from '@chess-battler/sim';
import type { BoardView, UnitView } from './board-view';
import { CELL } from './board-view';
import { t } from './i18n';
import { PACING, groupByTick, involvedUnits, staggerMs } from './timeline';
import type { ActionGroup } from './timeline';
import type { Tweener } from './tween';
import { easeInOutQuad, easeOutCubic } from './tween';
import { px, tokens } from './theme/tokens';

/** Состояние анимации одного действия. */
interface ActionContext {
  /** Фигуры, над которыми уже показана стрелка толчка. */
  readonly arrowed: Set<number>;
  /** Самое длинное звено цепочки, о котором уже сообщили надписью. */
  chainShown: number;
}

const COLOR = {
  arrow: px('fxSpark'),
  chain: px('fxCollision'),
  heal: px('success'),
  shield: px('info'),
  buff: px('accent'),
  stun: px('fxStun'),
  curse: px('fxCurse'),
  promote: px('accent'),
  thorns: px('fxThorns'),
  storm: px('fxStorm'),
} as const;

const buffText = (stat: BuffStat, n: number): string =>
  t(
    stat === 'atk'
      ? 'battle.buffAtk'
      : stat === 'armor'
        ? 'battle.buffArmor'
        : 'battle.buffInitiative',
    { n },
  );

/** Длительности анимаций на ×1, мс. */
const MS = {
  telegraph: 140,
  move: 240,
  lunge: 170,
  damageBeat: 60,
  floatText: 650,
  push: 160,
  arrow: 380,
  storm: 450,
  shockwave: 420,
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

  /** Звук события боя (подключается снаружи; в тестах и без звука — пустая функция). */
  sound: (s: 'hit' | 'collision' | 'death' | 'storm') => void = () => {};

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
    const ctx: ActionContext = { arrowed: new Set(), chainShown: 0 };
    for (const e of action.events) await this.apply(e, ctx);
  }

  private async apply(e: BattleEvent, ctx: ActionContext): Promise<void> {
    switch (e.type) {
      case 'move':
        return this.slide(e.unit, e.to, MS.move, easeInOutQuad);
      case 'push':
        return this.push(e.unit, e.from, e.to, e.depth, ctx);
      case 'attack':
        if (!this.skipping) this.sound('hit');
        return this.attack(e.unit, e.target);
      case 'damage':
        return this.damage(e.unit, e.amount, e.hp, e.source, e.absorbed ?? 0);
      case 'heal':
        return this.heal(e.unit, e.amount, e.hp);
      case 'shield':
        return this.shieldUp(e.unit, e.amount);
      case 'buff':
        return this.status(e.unit, buffText(e.stat, e.amount), COLOR.buff, 40);
      case 'support':
        return this.pulse(e.unit, COLOR.heal);
      case 'stun': {
        this.unit(e.unit)?.setBadge('💫');
        return this.status(e.unit, t('battle.stunned'), COLOR.stun, 80);
      }
      case 'stunned': {
        this.unit(e.unit)?.setBadge('');
        return this.status(e.unit, t('battle.skipTurn'), COLOR.stun, 220);
      }
      case 'curse':
        return this.status(e.unit, t('battle.curse', { armor: e.armor }), COLOR.curse, 60);
      case 'promote':
        return this.promote(e.unit, e.hp);
      case 'storm':
        if (!this.skipping) this.sound('storm');
        return this.storm(e.atk);
      case 'collision':
        if (!this.skipping) this.sound('collision');
        this.chain(e.unit, e.depth, ctx);
        return this.collision(e.unit, e.other, e.at);
      case 'death':
        if (!this.skipping) this.sound('death');
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

  /** Отбрасывание: стрелка направления (один раз за толчок) и резкий сдвиг. */
  private push(id: number, from: Vec, to: Vec, depth: number, ctx: ActionContext): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    if (!ctx.arrowed.has(id)) {
      ctx.arrowed.add(id);
      this.arrow(v, { x: to.x - from.x, y: to.y - from.y });
    }
    this.chain(id, depth, ctx);
    return this.slide(id, to, MS.push, easeOutCubic);
  }

  /** Стрелка направления толчка поверх фигуры. dir — в координатах доски. */
  private arrow(v: UnitView, dir: Vec): void {
    // На экране y растёт вниз, на доске — вверх.
    const angle = Math.atan2(-dir.y, dir.x);
    const len = CELL * 0.62;
    const g = new Graphics()
      .moveTo(-len / 2, 0)
      .lineTo(len / 2 - 10, 0)
      .stroke({ color: COLOR.arrow, width: 6, cap: 'round' })
      .poly([len / 2, 0, len / 2 - 16, -11, len / 2 - 16, 11])
      .fill({ color: COLOR.arrow });
    g.rotation = angle;
    g.position.set(v.base.x, v.base.y);
    this.board.fxLayer.addChild(g);
    const x0 = v.base.x;
    const y0 = v.base.y;
    void this.tw
      .run(MS.arrow, (t) => {
        if (g.destroyed) return;
        const shift = easeOutCubic(t) * CELL * 0.5;
        g.position.set(x0 + Math.cos(angle) * shift, y0 + Math.sin(angle) * shift);
        g.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      })
      .then(() => !g.destroyed && g.destroy());
  }

  /** Цепочка (2+ толчка за удар): ударная волна на звене и надпись «Цепочка ×N». */
  private chain(id: number, depth: number, ctx: ActionContext): void {
    if (depth < 1) return;
    const v = this.unit(id);
    if (!v) return;
    const wave = new Graphics().circle(0, 0, CELL * 0.4).stroke({ color: COLOR.chain, width: 5 });
    wave.position.set(v.base.x, v.base.y);
    this.board.fxLayer.addChild(wave);
    void this.tw
      .run(MS.shockwave, (t) => {
        if (wave.destroyed) return;
        wave.scale.set(1 + easeOutCubic(t) * 0.9);
        wave.alpha = 1 - t;
      })
      .then(() => !wave.destroyed && wave.destroy());
    const links = depth + 1;
    if (links > ctx.chainShown) {
      ctx.chainShown = links;
      this.floatText(
        t('battle.chain', { n: links }),
        v.base.x,
        v.base.y - CELL * 0.55,
        COLOR.chain,
        18,
      );
    }
  }

  /** «Телеграф»: короткая вспышка-прицел на цели перед ударом. */
  private async telegraph(target: UnitView): Promise<void> {
    const ring = new Graphics()
      .circle(0, 0, CELL * 0.44)
      .stroke({ color: px('fxTelegraph'), width: 4 })
      .circle(0, 0, CELL * 0.44)
      .fill({ color: px('fxTelegraph'), alpha: 0.18 });
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
        fontFamily: tokens.font.family,
        fontSize: size,
        fontWeight: '800',
        fill: color,
        stroke: { color: px('shadow'), width: 4 },
      },
    });
    label.anchor.set(0.5);
    // Не даём надписи вылезти за край доски.
    const half = label.width / 2 + 4;
    x = Math.min(this.board.pixelWidth - half, Math.max(half, x));
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

  private damage(
    id: number,
    amount: number,
    hp: number,
    source: 'attack' | 'collision' | 'thorns',
    absorbed: number,
  ): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    if (absorbed > 0) v.setShield(v.shield - absorbed);
    v.setHp(hp);
    const color =
      source === 'collision'
        ? px('fxCollision')
        : source === 'thorns'
          ? COLOR.thorns
          : px('fxDamage');
    const text = absorbed >= amount ? `🛡${amount}` : `-${amount - absorbed}`;
    this.floatText(
      text,
      v.base.x,
      v.base.y - CELL * 0.3,
      absorbed >= amount ? COLOR.shield : color,
    );
    return this.tw.wait(MS.damageBeat);
  }

  private heal(id: number, amount: number, hp: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    v.setHp(hp);
    this.floatText(`+${amount}`, v.base.x, v.base.y - CELL * 0.3, COLOR.heal);
    return this.pulse(id, COLOR.heal);
  }

  private shieldUp(id: number, amount: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    v.setShield(v.shield + amount);
    this.floatText(`🛡 +${amount}`, v.base.x, v.base.y - CELL * 0.45, COLOR.shield, 16);
    return this.pulse(id, COLOR.shield);
  }

  /** Короткая надпись над фигурой; ждём waitMs, чтобы надписи не слипались. */
  private status(id: number, text: string, color: number, waitMs: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return Promise.resolve();
    this.floatText(text, v.base.x, v.base.y - CELL * 0.5, color, 14);
    return this.tw.wait(waitMs);
  }

  /** Расходящееся кольцо вокруг фигуры. */
  private async pulse(id: number, color: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    const ring = new Graphics().circle(0, 0, CELL * 0.42).stroke({ color, width: 4 });
    ring.position.set(v.base.x, v.base.y);
    this.board.fxLayer.addChild(ring);
    await this.tw.run(260, (t) => {
      if (ring.destroyed) return;
      ring.scale.set(1 + t * 0.35);
      ring.alpha = 1 - t;
    });
    if (!ring.destroyed) ring.destroy();
  }

  /** «Буря»: вспышка на всё поле и надпись с суммарной прибавкой ATK. */
  private async storm(atk: number): Promise<void> {
    const b = this.board;
    const flash = new Graphics()
      .rect(0, 0, b.pixelWidth, b.pixelHeight)
      .fill({ color: COLOR.storm, alpha: 0.28 });
    b.fxLayer.addChild(flash);
    this.floatText(
      t('battle.storm', { atk }),
      b.pixelWidth / 2,
      b.pixelHeight / 2,
      COLOR.storm,
      26,
    );
    await this.tw.run(MS.storm, (t) => {
      if (!flash.destroyed) flash.alpha = 1 - t;
    });
    if (!flash.destroyed) flash.destroy();
  }

  private async promote(id: number, hp: number): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    v.setHp(hp, v.maxHp + (hp - v.hp));
    this.floatText(t('battle.promote'), v.base.x, v.base.y - CELL * 0.55, COLOR.promote, 18);
    await this.pulse(id, COLOR.promote);
  }

  private async collision(id: number, otherId: number | null, at: Vec): Promise<void> {
    const v = this.unit(id);
    if (!v) return;
    // Вспышка в точке удара: между фигурой и клеткой, куда её толкнули.
    const dst = this.board.toScreen(at);
    const spark = new Graphics()
      .star(0, 0, 6, CELL * 0.22, CELL * 0.1)
      .fill({ color: px('fxSpark') });
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
