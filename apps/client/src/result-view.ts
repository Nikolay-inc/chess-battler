import { analyzeBattle } from '@chess-battler/sim';
import type { BattleMoment, BattleResult, Side } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';

/** Сторона игрока: пока игрок всегда снизу. */
export const PLAYER_SIDE: Side = 'A';

const plural = (n: number, one: string, few: string, many: string): string => {
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

export interface ResultActions {
  onReplay(): void;
  onClose(): void;
}

/** Заполняет карточку итога. Игрок — сторона PLAYER_SIDE. */
export function renderResult(root: HTMLElement, r: BattleResult, actions: ResultActions): void {
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

  const el = (tag: string, cls: string, text?: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

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

  const buttons = el('div', 'result-buttons');
  const close = el('button', 'secondary', 'К доске') as HTMLButtonElement;
  const replay = el('button', 'fight', 'Ещё раз') as HTMLButtonElement;
  close.type = replay.type = 'button';
  close.addEventListener('click', actions.onClose);
  replay.addEventListener('click', actions.onReplay);
  buttons.append(close, replay);
  root.append(buttons);
  root.hidden = false;
}
