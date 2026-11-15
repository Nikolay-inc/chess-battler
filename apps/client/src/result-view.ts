import { analyzeBattle } from '@chess-battler/sim';
import { t, unitName } from './i18n';
import type { BattleMoment, BattleResult, Side } from '@chess-battler/sim';

/** Сторона игрока: пока игрок всегда снизу. */
export const PLAYER_SIDE: Side = 'A';

/** «Таран: цепочка ×3, 9 урона, убил 1» — описание момента для экрана итога. */
export function describeMoment(m: BattleMoment, unitName: (id: number) => string): string {
  const parts: string[] = [];
  if (m.chain >= 2) parts.push(t('result.momentChain', { n: m.chain }));
  parts.push(t('count.damage', { n: m.damage }));
  if (m.kills > 0) parts.push(t('result.momentKills', { n: m.kills }));
  return t('result.moment', {
    attacker: unitName(m.unit),
    target: unitName(m.target),
    parts: parts.join(', '),
  });
}

export interface ResultButton {
  readonly label: string;
  readonly primary?: boolean;
  onClick(): void;
}

export interface ResultOptions {
  readonly buttons: readonly ResultButton[];
  /** Строка под статистикой (например, жизни и победы забега). */
  readonly footer?: string;
}

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function appendButtons(root: HTMLElement, buttons: readonly ResultButton[]): void {
  const row = el('div', 'result-buttons');
  for (const b of buttons) {
    const btn = el('button', b.primary ? 'fight' : 'secondary', b.label) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', b.onClick);
    row.append(btn);
  }
  root.append(row);
}

/** Заполняет карточку итога боя. Игрок — сторона PLAYER_SIDE. */
export function renderResult(root: HTMLElement, r: BattleResult, opts: ResultOptions): void {
  const summary = analyzeBattle(r, PLAYER_SIDE);
  const best = summary.best ?? analyzeBattle(r).best;
  const enemy: Side = PLAYER_SIDE === 'A' ? 'B' : 'A';
  const outcome = r.winner === null ? 'draw' : r.winner === PLAYER_SIDE ? 'win' : 'loss';
  const title = t(`result.${outcome}`);
  const reason =
    r.reason === 'timeout'
      ? t('result.timeout', { ticks: t('count.ticks', { n: r.rules.maxTicks }) })
      : outcome === 'win'
        ? t('result.enemyBroken')
        : outcome === 'loss'
          ? t('result.yourBroken')
          : t('result.bothBroken');
  const nameOf = (id: number) => unitName(r.initial[id]!.defId);
  const mine = summary.survivors[PLAYER_SIDE];
  const theirs = summary.survivors[enemy];

  root.replaceChildren();
  root.dataset.outcome = outcome;
  root.append(el('h2', 'result-title', title), el('p', 'result-reason', reason));

  const stats = el('div', 'result-stats');
  const stat = (value: string, label: string) => {
    const s = el('div', 'stat');
    s.append(el('strong', '', value), el('span', '', label));
    return s;
  };
  stats.append(
    stat(`${mine.alive}/${mine.total}`, t('result.yourAlive')),
    stat(`${theirs.alive}/${theirs.total}`, t('result.enemyAlive')),
    stat(String(r.ticks), t('count.ticksWord', { n: r.ticks })),
  );
  root.append(stats);

  if (best) {
    const moment = el('div', 'result-moment');
    const own = best.side === PLAYER_SIDE;
    moment.append(
      el(
        'span',
        'moment-label',
        t(own ? 'result.bestMoment' : 'result.bestMomentEnemy', { tick: best.tick }),
      ),
      el('p', 'moment-text', describeMoment(best, nameOf)),
    );
    root.append(moment);
  }

  if (opts.footer) root.append(el('p', 'result-footer', opts.footer));
  appendButtons(root, opts.buttons);
  root.hidden = false;
}

export interface RunEndInfo {
  readonly won: boolean;
  readonly wins: number;
  readonly losses: number;
  readonly rounds: number;
}

const FEEDBACK_KEY = 'chess-battler.feedback';

/** Отвечал ли игрок на опрос по этому забегу (чтобы не спрашивать дважды после перезагрузки). */
export function feedbackGiven(seed: number): boolean {
  try {
    return (JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '[]') as number[]).includes(seed);
  } catch {
    return false;
  }
}

export function markFeedbackGiven(seed: number): void {
  try {
    const list = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '[]') as number[];
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify([...list.slice(-49), seed]));
  } catch {
    // без хранилища опрос может показаться снова — не страшно
  }
}

export interface FeedbackOptions {
  readonly answered: boolean;
  onSubmit(rating: number, annoyed: string): void;
}

/** Опрос: оценка 1–5 и «Что раздражало?». Необязательный. */
function feedbackForm(fb: FeedbackOptions): HTMLElement {
  const box = el('form', 'feedback') as HTMLFormElement;
  if (fb.answered) {
    box.append(el('p', 'feedback-thanks', t('feedback.thanks')));
    return box;
  }
  box.append(el('p', 'feedback-title', t('feedback.title')));
  let rating = 0;
  const stars = el('div', 'feedback-stars');
  stars.setAttribute('role', 'radiogroup');
  stars.setAttribute('aria-label', t('feedback.rating'));
  const buttons: HTMLButtonElement[] = [];
  for (let i = 1; i <= 5; i++) {
    const b = el('button', 'star', '★') as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', t('feedback.star', { n: i }));
    b.setAttribute('aria-checked', 'false');
    b.addEventListener('click', () => {
      rating = i;
      buttons.forEach((x, j) => {
        x.classList.toggle('on', j < i);
        x.setAttribute('aria-checked', String(j === i - 1));
      });
      send.disabled = false;
    });
    buttons.push(b);
    stars.append(b);
  }
  const text = el('textarea', 'feedback-text') as HTMLTextAreaElement;
  text.placeholder = t('feedback.placeholder');
  text.maxLength = 1000;
  text.rows = 2;
  text.setAttribute('aria-label', t('feedback.annoyed'));
  const send = el('button', 'secondary feedback-send', t('feedback.send')) as HTMLButtonElement;
  send.type = 'submit';
  send.disabled = true;
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    if (rating < 1) return;
    fb.onSubmit(rating, text.value);
    box.replaceChildren(el('p', 'feedback-thanks', t('feedback.thanks')));
  });
  box.append(stars, text, send);
  return box;
}

/** Экран конца забега. */
export function renderRunEnd(
  root: HTMLElement,
  info: RunEndInfo,
  onNewRun: () => void,
  feedback?: FeedbackOptions,
): void {
  root.replaceChildren();
  root.dataset.outcome = info.won ? 'win' : 'loss';
  root.append(
    el('h2', 'result-title', t(info.won ? 'runEnd.won' : 'runEnd.lost')),
    el('p', 'result-reason', t(info.won ? 'runEnd.wonReason' : 'runEnd.lostReason')),
  );
  const stats = el('div', 'result-stats');
  const stat = (value: string, label: string) => {
    const s = el('div', 'stat');
    s.append(el('strong', '', value), el('span', '', label));
    return s;
  };
  stats.append(
    stat(String(info.wins), t('count.winsWord', { n: info.wins })),
    stat(String(info.losses), t('count.lossesWord', { n: info.losses })),
    stat(String(info.rounds), t('count.roundsWord', { n: info.rounds })),
  );
  root.append(stats);
  if (feedback) root.append(feedbackForm(feedback));
  appendButtons(root, [{ label: t('runEnd.newRun'), primary: true, onClick: onNewRun }]);
  root.hidden = false;
}
