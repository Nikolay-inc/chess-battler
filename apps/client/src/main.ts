import { Application } from 'pixi.js';
import { DEFAULT_RULES, createSetup, simulate } from '@chess-battler/sim';
import { DEMO_ARMY_A, DEMO_ARMY_B, resolveArmy } from '@chess-battler/content';
import { BoardView } from './board-view';
import { BattlePlayer } from './player';
import { renderResult } from './result-view';
import { Tweener } from './tween';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPEEDS = [1, 2, 4];

async function main(): Promise<void> {
  const rules = DEFAULT_RULES;
  const board = new BoardView(rules);

  const app = new Application();
  await app.init({
    width: board.pixelWidth,
    height: board.pixelHeight,
    background: 0x1a1d25,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  // autoDensity ставит ширину в px — растягиваем по контейнеру, сохраняя пропорции.
  app.canvas.style.width = '100%';
  app.canvas.style.height = 'auto';
  app.canvas.style.aspectRatio = `${board.pixelWidth} / ${board.pixelHeight}`;
  $('stage').appendChild(app.canvas);
  app.stage.addChild(board);

  let speedIdx = 0;
  const tweener = new Tweener(app.ticker, () => SPEEDS[speedIdx]!);

  const tickEl = $('tick');
  const resultEl = $('result');
  const fightBtn = $<HTMLButtonElement>('fight');
  const speedBtn = $<HTMLButtonElement>('speed');
  const skipBtn = $<HTMLButtonElement>('skip');
  $('army-a').textContent = DEMO_ARMY_A.name;
  $('army-b').textContent = DEMO_ARMY_B.name;

  const player = new BattlePlayer(board, tweener, (tick) => {
    tickEl.textContent = `Такт ${tick} / ${rules.maxTicks}`;
  });

  const setup = createSetup(resolveArmy(DEMO_ARMY_A), resolveArmy(DEMO_ARMY_B), rules);
  // Бой детерминирован: результат можно посчитать заранее, а расстановку взять из него.
  const result = simulate(setup, rules);
  board.setUnits(result.initial);

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
  });

  // Отладочный доступ в dev-сборке: ручная прокрутка тикера, замеры темпа.
  if (import.meta.env.DEV) Object.assign(window, { __debug: { app, player, result } });

  skipBtn.addEventListener('click', () => {
    skipBtn.disabled = true;
    player.skip();
  });

  async function fight(): Promise<void> {
    fightBtn.disabled = true;
    skipBtn.disabled = false;
    resultEl.hidden = true;
    board.clearFocus();
    await player.play(result);
    skipBtn.disabled = true;
    fightBtn.textContent = 'Ещё раз';
    fightBtn.disabled = false;
    renderResult(resultEl, result, {
      onReplay: () => void fight(),
      onClose: () => (resultEl.hidden = true),
    });
  }

  fightBtn.addEventListener('click', () => void fight());
}

void main();
