import { analyzeBattle } from '@chess-battler/sim';
import type { BattleMoment, BattleResult, Side } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';

/** Сторона игрока: пока игрок всегда снизу. */
export const PLAYER_SIDE: Side = 'A';

export const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** «Таран: цепочка ×3, 9 урона, убил 1» — описание момента для экрана итога. */
export function describeMoment(m: BattleMoment, unitName: (id: number) => string): string {
  const parts: string[] = [];
  if (m.chain >= 2) parts.push(`цепочка ×${m.chain}`);
  parts.push(`${m.damage} ${plural(m.damage, 'урон', 'урона', 'урона')}`);
  if (m.kills > 0) parts.push(`разбито фигур: ${m.kills}`);
  return `${unitName(m.unit)} → ${unitName(m.target)}: ${parts.join(', ')}`;
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
  const title = { win: 'Победа', loss: 'Поражение', draw: 'Ничья' }[outcome];
  const reason =
    r.reason === 'timeout'
      ? `Время вышло (${r.rules.maxTicks} тактов) — решила сумма HP`
      : outcome === 'win'
        ? 'Армия соперника разбита'
        : outcome === 'loss'
          ? 'Ваша армия разбита'
          : 'Обе армии разбиты';
  const unitName = (id: number) => getUnit(r.initial[id]!.defId).name;
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
    stat(`${mine.alive}/${mine.total}`, 'ваших выжило'),
    stat(`${theirs.alive}/${theirs.total}`, 'у соперника'),
    stat(String(r.ticks), plural(r.ticks, 'такт', 'такта', 'тактов')),
  );
  root.append(stats);

  if (best) {
    const moment = el('div', 'result-moment');
    const own = best.side === PLAYER_SIDE;
    moment.append(
      el('span', 'moment-label', `★ Лучший момент${own ? '' : ' соперника'} · такт ${best.tick}`),
      el('p', 'moment-text', describeMoment(best, unitName)),
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

/** Экран конца забега. */
export function renderRunEnd(root: HTMLElement, info: RunEndInfo, onNewRun: () => void): void {
  root.replaceChildren();
  root.dataset.outcome = info.won ? 'win' : 'loss';
  root.append(
    el('h2', 'result-title', info.won ? 'Забег пройден!' : 'Забег окончен'),
    el('p', 'result-reason', info.won ? 'Десять побед — армия непобедима' : 'Жизни закончились'),
  );
  const stats = el('div', 'result-stats');
  const stat = (value: string, label: string) => {
    const s = el('div', 'stat');
    s.append(el('strong', '', value), el('span', '', label));
    return s;
  };
  stats.append(
    stat(String(info.wins), plural(info.wins, 'победа', 'победы', 'побед')),
    stat(String(info.losses), plural(info.losses, 'поражение', 'поражения', 'поражений')),
    stat(String(info.rounds), plural(info.rounds, 'раунд', 'раунда', 'раундов')),
  );
  root.append(stats);
  appendButtons(root, [{ label: 'Новый забег', primary: true, onClick: onNewRun }]);
  root.hidden = false;
}
