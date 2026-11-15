import type { RunConfig, RunState } from '@chess-battler/sim';
import { $, el } from '../ui';

/** Есть ли у забега прогресс, который стоит продолжить. */
export function runInProgress(s: RunState): boolean {
  return (
    s.status === 'shop' && (s.round > 1 || s.board.length > 0 || s.bench.some((b) => b !== null))
  );
}

export interface HomeActions {
  onPlay(): void;
  onNewRun(): void;
}

/** Главная: кнопка «Играть» / «Продолжить» и сводка текущего забега. */
export function renderHome(s: RunState, cfg: RunConfig, actions: HomeActions): void {
  const info = $('home-run');
  const play = $<HTMLButtonElement>('home-play');
  const fresh = $<HTMLButtonElement>('home-new');
  info.replaceChildren();
  const hearts = '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, cfg.lives - s.lives));

  if (runInProgress(s)) {
    info.append(
      el('span', 'home-run-label', 'Текущий забег'),
      el('strong', '', `Раунд ${s.round} · ${hearts} · 🏆 ${s.wins}/${cfg.winsToFinish}`),
    );
    play.textContent = 'Продолжить';
    fresh.hidden = false;
  } else if (s.status !== 'shop') {
    info.append(
      el('span', 'home-run-label', 'Последний забег'),
      el('strong', '', s.status === 'won' ? `Пройден! 🏆 ${s.wins}` : `Побед: ${s.wins}`),
    );
    play.textContent = 'Новый забег';
    fresh.hidden = true;
  } else {
    play.textContent = 'Играть';
    fresh.hidden = true;
  }
  info.hidden = info.childElementCount === 0;
  play.onclick = () => (s.status === 'shop' ? actions.onPlay() : actions.onNewRun());
  fresh.onclick = () => {
    if (confirm('Начать новый забег? Текущий будет потерян.')) actions.onNewRun();
  };
}
