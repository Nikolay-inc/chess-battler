import type { RunConfig, RunState } from '@chess-battler/sim';
import { t } from '../i18n';
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
      el('span', 'home-run-label', t('home.currentRun')),
      el(
        'strong',
        '',
        t('home.runSummary', { round: s.round, hearts, wins: s.wins, target: cfg.winsToFinish }),
      ),
    );
    play.textContent = t('home.continue');
    fresh.hidden = false;
  } else if (s.status !== 'shop') {
    info.append(
      el('span', 'home-run-label', t('home.lastRun')),
      el('strong', '', t(s.status === 'won' ? 'home.runWon' : 'home.runWins', { wins: s.wins })),
    );
    play.textContent = t('home.newRun');
    fresh.hidden = true;
  } else {
    play.textContent = t('home.play');
    fresh.hidden = true;
  }
  fresh.textContent = t('home.newRun');
  info.hidden = info.childElementCount === 0;
  play.onclick = () => (s.status === 'shop' ? actions.onPlay() : actions.onNewRun());
  fresh.onclick = () => {
    if (confirm(t('home.confirmNewRun'))) actions.onNewRun();
  };
}
