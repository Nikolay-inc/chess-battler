import { Application } from 'pixi.js';
import { RUN_CONFIG } from '@chess-battler/content';
import { DEFAULT_RULES, createRun } from '@chess-battler/sim';
import type { RunState } from '@chess-battler/sim';
import { BENCH_GAP, BenchView, BoardView } from './board-view';
import { Game } from './game';
import { BattlePlayer } from './player';
import { Tweener } from './tween';
import { loadRun, saveRun } from './storage';
import { $ } from './ui';
import './style.css';

const SPEEDS = [1, 2, 4];

async function main(): Promise<void> {
  const rules = DEFAULT_RULES;
  const board = new BoardView(rules);
  const bench = new BenchView(RUN_CONFIG.benchSlots, board.pixelWidth);
  bench.y = board.pixelHeight + BENCH_GAP - 10;

  const app = new Application();
  await app.init({
    width: board.pixelWidth,
    height: bench.y + bench.pixelHeight,
    background: 0x14161c,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  // autoDensity ставит ширину в px — растягиваем по контейнеру, сохраняя пропорции.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  app.canvas.style.aspectRatio = `${app.screen.width} / ${app.screen.height}`;
  $('stage').appendChild(app.canvas);
  app.stage.addChild(board, bench);

  let speedIdx = 0;
  const tweener = new Tweener(app.ticker, () => SPEEDS[speedIdx]!);
  const tickEl = $('tick');
  const player = new BattlePlayer(board, tweener, (tick) => {
    tickEl.textContent = tick > 0 ? `Такт ${tick} / ${rules.maxTicks}` : 'Начало боя';
  });

  const speedBtn = $<HTMLButtonElement>('speed');
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
  });
  $('skip').addEventListener('click', () => {
    $<HTMLButtonElement>('skip').disabled = true;
    player.skip();
  });

  // Продолжаем сохранённый забег, если он есть.
  const saved = loadRun(RUN_CONFIG);
  const initial: RunState =
    saved ?? createRun(crypto.getRandomValues(new Uint32Array(1))[0]!, RUN_CONFIG);
  const game = new Game(app, board, bench, player, initial, {
    save: saveRun,
    onRunStart: () => {},
    onRoundEnd: () => {},
    onRunEnd: () => {},
  });
  if (!saved) saveRun(initial);
  game.start();

  // Отладочный доступ в dev-сборке: ручная прокрутка тикера, замеры темпа.
  if (import.meta.env.DEV) Object.assign(window, { __debug: { app, player, game, board, bench } });
}

void main();
