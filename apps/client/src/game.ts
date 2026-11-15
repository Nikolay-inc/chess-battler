import { RUN_CONFIG, SYNERGIES, getUnit } from '@chess-battler/content';
import { generateGhost } from '@chess-battler/bots';
import {
  DEFAULT_RULES,
  RunError,
  applyAction,
  createRun,
  createSetup,
  roundSeed,
  runArmy,
  sellValue,
  simulate,
  unitCost,
} from '@chess-battler/sim';
import type { Location, OwnedUnit, RoundOutcome, RunAction, RunState } from '@chess-battler/sim';
import type { BenchView, BoardView } from './board-view';
import type { BattlePlayer } from './player';
import { PrepController } from './prep';
import { Tutorial } from './tutorial';
import { PLAYER_SIDE, renderResult, renderRunEnd } from './result-view';
import {
  $,
  boardSynergies,
  hideInfo,
  renderHud,
  renderShop,
  renderSynergies,
  showSynergyInfo,
  showUnitCard,
  toast,
} from './ui';
import type { Application } from 'pixi.js';

const ERROR_TEXT: Record<string, string> = {
  not_enough_gold: 'Не хватает золота',
  bench_full: 'Скамейка заполнена',
  board_full: 'Поле заполнено — лимит раунда',
  invalid_location: 'Сюда нельзя',
  empty_slot: 'Слот пуст',
  nothing_there: 'Здесь пусто',
  run_over: 'Забег окончен',
};

/** Сложность соперника растёт по раундам. */
export const ghostDifficulty = (round: number): number => Math.min(1, 0.35 + 0.065 * (round - 1));

export interface GameHooks {
  /** Сохранить состояние (localStorage). */
  save(state: RunState): void;
  /** Аналитика: начало забега, конец раунда, конец забега. */
  onRunStart(state: RunState): void;
  onRoundEnd(before: RunState, after: RunState, outcome: RoundOutcome, ticks: number): void;
  onRunEnd(state: RunState): void;
}

export class Game {
  private state: RunState;
  private readonly prep: PrepController;
  private inBattle = false;
  private readonly tutorial: Tutorial;
  private roundStartedAt = performance.now();

  constructor(
    app: Application,
    private readonly board: BoardView,
    private readonly bench: BenchView,
    private readonly player: BattlePlayer,
    initial: RunState,
    private readonly hooks: GameHooks,
  ) {
    this.state = initial;
    const shopEl = $('shop');
    this.prep = new PrepController(app, board, bench, shopEl, RUN_CONFIG, {
      dispatch: (a) => this.dispatch(a),
      onTap: (u, from) => this.tapUnit(u, from),
      onDragState: (sell, over) => {
        shopEl.classList.toggle('sell-target', sell !== null);
        shopEl.classList.toggle('sell-hover', over);
        shopEl.dataset.sell = sell === null ? '' : `Продать +${sell}`;
      },
    });
    board.onFocusChange = (v) => {
      if (v)
        showUnitCard($('info'), v.look.defId, v.look.stars, {
          sell:
            this.inBattle || v.side !== PLAYER_SIDE ? null : sellValue(v.look.stars, RUN_CONFIG),
        });
      else hideInfo($('info'));
    };

    this.tutorial = new Tutorial($('coach'), {
      shop: () => $('shop').getBoundingClientRect(),
      // Поле игрока — нижняя половина доски (верх скамейки ≈ 83% высоты canvas).
      board: () => {
        const c = app.canvas.getBoundingClientRect();
        return new DOMRect(c.left, c.top + c.height * 0.5, c.width, c.height * 0.33);
      },
      fight: () => $('fight').getBoundingClientRect(),
    });

    $('reroll').addEventListener('click', () => this.dispatch({ type: 'reroll' }));
    $('freeze').addEventListener('click', () => this.dispatch({ type: 'freeze' }));
    $('fight').addEventListener('click', () => void this.fight());
    $('new-run').addEventListener('click', () => {
      if (this.inBattle) return;
      if (this.state.status === 'shop' && this.state.round > 1) {
        if (!confirm('Начать новый забег? Текущий будет потерян.')) return;
      }
      this.newRun();
    });
  }

  get current(): RunState {
    return this.state;
  }

  /** Показать текущее состояние (после загрузки или нового забега). */
  start(): void {
    if (this.state.status !== 'shop') this.showRunEnd();
    else this.enterPrep();
  }

  newRun(): void {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.state = createRun(seed, RUN_CONFIG);
    this.hooks.save(this.state);
    this.hooks.onRunStart(this.state);
    $('result').hidden = true;
    this.enterPrep();
  }

  /** Применить действие; ошибки правил — всплывающим сообщением. */
  dispatch(action: RunAction): boolean {
    try {
      this.state = applyAction(this.state, action, RUN_CONFIG, DEFAULT_RULES);
    } catch (e) {
      if (e instanceof RunError) {
        toast(ERROR_TEXT[e.code] ?? e.message);
        return false;
      }
      throw e;
    }
    this.hooks.save(this.state);
    this.renderPrep();
    return true;
  }

  private tapUnit(u: OwnedUnit, from: Location): void {
    if (from.area === 'board') {
      this.board.toggleFocus(u.uid);
    } else {
      this.board.clearFocus();
      showUnitCard($('info'), u.unit, u.stars, { sell: sellValue(u.stars, RUN_CONFIG) });
    }
  }

  /** Тап по фигуре в магазине: карточка с кнопкой «Купить». */
  private openShopCard(slot: number): void {
    const id = this.state.shop[slot];
    if (!id) return;
    this.board.clearFocus();
    const cost = unitCost(getUnit(id));
    showUnitCard($('info'), id, 1, {
      buy: {
        cost,
        affordable: this.state.gold >= cost,
        onBuy: () => {
          if (this.dispatch({ type: 'buy', slot })) hideInfo($('info'));
        },
      },
    });
  }

  private enterPrep(): void {
    this.inBattle = false;
    this.roundStartedAt = performance.now();
    document.body.dataset.phase = 'prep';
    this.board.veiled = true;
    this.bench.alpha = 1;
    this.renderPrep();
  }

  private renderPrep(): void {
    const s = this.state;
    renderHud($('hud'), s, RUN_CONFIG);
    renderSynergies($('synergies'), s, (family) => {
      const count = boardSynergies(s).find((a) => a.family === family)?.count ?? 0;
      this.board.clearFocus();
      showSynergyInfo($('info'), family, count);
    });
    renderShop($('shop'), s, (slot) => this.openShopCard(slot));
    $<HTMLButtonElement>('reroll').disabled = s.gold < RUN_CONFIG.rerollCost;
    $('freeze').classList.toggle('on', s.frozen);
    $('freeze').setAttribute('aria-pressed', String(s.frozen));
    $('fight').textContent = `В бой · раунд ${s.round}`;
    this.prep.render(s);
    this.tutorial.update(s);
  }

  async fight(): Promise<void> {
    if (this.inBattle) return;
    const before = this.state;
    if (before.board.length === 0) {
      toast('Поставьте хотя бы одну фигуру на поле');
      return;
    }
    this.inBattle = true;
    this.tutorial.onFight();
    hideInfo($('info'));
    this.board.clearFocus();

    const ghost = generateGhost({
      round: before.round,
      difficulty: ghostDifficulty(before.round),
      seed: roundSeed(before),
    });
    const result = simulate(
      createSetup(runArmy(before, RUN_CONFIG), ghost.army, DEFAULT_RULES, SYNERGIES),
      DEFAULT_RULES,
    );
    const outcome: RoundOutcome =
      result.winner === null ? 'draw' : result.winner === PLAYER_SIDE ? 'win' : 'loss';
    // Итог раунда фиксируется сразу: перезагрузка во время боя не даёт переиграть.
    const after = applyAction(before, { type: 'roundEnd', outcome }, RUN_CONFIG, DEFAULT_RULES);
    this.state = after;
    this.hooks.save(after);
    this.hooks.onRoundEnd(before, after, outcome, result.ticks);
    if (after.status !== 'shop') this.hooks.onRunEnd(after);

    document.body.dataset.phase = 'battle';
    this.board.veiled = false;
    this.bench.alpha = 0.35;
    $<HTMLButtonElement>('skip').disabled = false;
    await this.player.play(result);
    $<HTMLButtonElement>('skip').disabled = true;

    const hearts = '♥'.repeat(after.lives) + '♡'.repeat(RUN_CONFIG.lives - after.lives);
    renderResult($('result'), result, {
      footer: `${hearts}  ·  Победы ${after.wins}/${RUN_CONFIG.winsToFinish}`,
      buttons: [
        { label: 'К доске', onClick: () => ($('result').hidden = true) },
        {
          label: after.status === 'shop' ? `Раунд ${after.round}` : 'Итоги забега',
          primary: true,
          onClick: () => this.afterBattle(),
        },
      ],
    });
  }

  private afterBattle(): void {
    $('result').hidden = true;
    if (this.state.status !== 'shop') this.showRunEnd();
    else this.enterPrep();
  }

  private showRunEnd(): void {
    const s = this.state;
    this.tutorial.hide();
    document.body.dataset.phase = 'end';
    renderHud($('hud'), s, RUN_CONFIG);
    renderRunEnd(
      $('result'),
      { won: s.status === 'won', wins: s.wins, losses: s.losses, rounds: s.history.length },
      () => this.newRun(),
    );
  }

  /** Сколько длилась подготовка текущего раунда (для аналитики). */
  roundElapsedMs(): number {
    return Math.round(performance.now() - this.roundStartedAt);
  }
}
