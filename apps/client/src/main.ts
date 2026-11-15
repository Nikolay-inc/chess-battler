import { Application } from 'pixi.js';
import { DEFAULT_RULES, createSetup, simulate } from '@chess-battler/sim';
import type { BattleResult } from '@chess-battler/sim';
import { DEMO_ARMY_A, DEMO_ARMY_B, resolveArmy } from '@chess-battler/content';
import { BoardView } from './board-view';
import { BattlePlayer } from './player';
import { Tweener } from './tween';
import './style.css';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPEEDS = [1, 2, 4];

async function main(): Promise<void> {
  const rules = DEFAULT_RULES;
  const board = new BoardView(rules.width, rules.height);

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
  $('army-a').textContent = DEMO_ARMY_A.name;
  $('army-b').textContent = DEMO_ARMY_B.name;

  const player = new BattlePlayer(board, tweener, (tick) => {
    tickEl.textContent = `Такт ${tick} / ${rules.maxTicks}`;
  });

  const setup = createSetup(resolveArmy(DEMO_ARMY_A), resolveArmy(DEMO_ARMY_B), rules);
  // Бой детерминирован: результат можно посчитать заранее, а расстановку взять из него.
  const result = simulate(setup, rules);
  board.setUnits(result.initial);

  function showResult(r: BattleResult): void {
    const title =
      r.winner === null
        ? 'Ничья'
        : `Победа: ${r.winner === 'A' ? DEMO_ARMY_A.name : DEMO_ARMY_B.name}`;
    const reason =
      r.reason === 'elimination' ? 'армия противника уничтожена' : 'по HP после 30 тактов';
    resultEl.innerHTML = '';
    resultEl.append(title);
    const small = document.createElement('small');
    small.textContent = `${reason} · тактов: ${r.ticks}`;
    resultEl.append(small);
    resultEl.hidden = false;
  }

  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
  });

  fightBtn.addEventListener('click', async () => {
    fightBtn.disabled = true;
    resultEl.hidden = true;
    await player.play(result);
    showResult(result);
    fightBtn.textContent = 'Ещё раз';
    fightBtn.disabled = false;
  });
}

void main();
