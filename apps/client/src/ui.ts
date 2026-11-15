import { FAMILY_NAMES, SYNERGIES, getUnit } from '@chess-battler/content';
import { DEFAULT_RULES, activeSynergies, starScaledDef, unitCost } from '@chess-battler/sim';
import type {
  ActiveSynergy,
  Family,
  RunConfig,
  RunState,
  Stars,
  UnitDef,
} from '@chess-battler/sim';
import { GLYPH } from './board-view';
import { patternPreview } from './pattern-preview';
import type { PreviewCell } from './pattern-preview';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const PATTERN_TEXT: Record<Family, string> = {
  legion: 'ходит вперёд и вбок на 1, бьёт вперёд по диагонали',
  riders: 'ходит и бьёт буквой «Г», перепрыгивает фигуры',
  mystics: 'ходит и бьёт по диагоналям',
  guards: 'ходит и бьёт по прямым',
};

// ---------- HUD ----------

export function renderHud(root: HTMLElement, s: RunState, cfg: RunConfig): void {
  const hearts = '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, cfg.lives - s.lives));
  root.querySelector('.hud-round')!.textContent = `Раунд ${s.round}`;
  root.querySelector('.hud-lives')!.textContent = hearts;
  root.querySelector('.hud-wins')!.textContent = `🏆 ${s.wins}/${cfg.winsToFinish}`;
  root.querySelector('.hud-gold')!.textContent = `${s.gold}`;
}

// ---------- Синергии ----------

export function boardSynergies(s: RunState): ActiveSynergy[] {
  const units = s.board.map((b) => ({ def: getUnit(b.unit), side: 'A' as const }));
  return activeSynergies(units, 'A', SYNERGIES);
}

export function renderSynergies(
  root: HTMLElement,
  s: RunState,
  onTap: (family: Family) => void,
): void {
  root.replaceChildren();
  const active = boardSynergies(s);
  if (active.length === 0) {
    root.append(el('span', 'syn-empty', 'Синергии семей: 2 и 4 фигуры одной семьи на поле'));
    return;
  }
  for (const a of active) {
    const def = SYNERGIES.find((d) => d.family === a.family)!;
    const next = def.tiers.find((t) => t.count > a.count)?.count ?? def.tiers.at(-1)!.count;
    const chip = el('button', `syn-chip ${a.tiers.length ? 'active' : ''}`);
    chip.type = 'button';
    chip.dataset.family = a.family;
    chip.textContent = `${GLYPH[a.family]} ${FAMILY_NAMES[a.family]} ${a.count}/${next}`;
    chip.addEventListener('click', () => onTap(a.family));
    root.append(chip);
  }
}

// ---------- Магазин ----------

export function renderShop(root: HTMLElement, s: RunState, onTap: (slot: number) => void): void {
  root.replaceChildren();
  root.classList.toggle('frozen', s.frozen);
  s.shop.forEach((id, slot) => {
    if (!id) {
      root.append(el('div', 'shop-card empty'));
      return;
    }
    const def = getUnit(id);
    const cost = unitCost(def);
    const card = el('button', `shop-card fam-${def.family}${cost > s.gold ? ' poor' : ''}`);
    card.type = 'button';
    card.dataset.slot = String(slot);
    card.setAttribute('aria-label', `${def.name}, цена ${cost}`);
    card.append(
      el('span', 'card-glyph', GLYPH[def.family]),
      el('span', 'card-name', def.name),
      el('span', 'card-stats', `${def.hp}♥ ${def.atk}⚔️`),
      el('span', 'card-cost', `${cost}`),
    );
    card.addEventListener('click', () => onTap(slot));
    root.append(card);
  });
}

// ---------- Карточка фигуры ----------

const CELL_LABEL: Record<PreviewCell, string> = {
  self: 'фигура',
  move: 'ход',
  attack: 'удар',
  both: 'ход и удар',
  empty: '',
};

/** Мини-схема 5×5: куда фигура ходит (точки) и куда бьёт (красные клетки). */
function patternGrid(def: UnitDef): HTMLElement {
  const grid = el('div', 'pattern');
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `Схема хода и атаки: ${PATTERN_TEXT[def.family]}`);
  for (const row of patternPreview(def)) {
    for (const cell of row) {
      const c = el('span', `pc pc-${cell}`, cell === 'self' ? GLYPH[def.family] : '');
      if (cell !== 'empty') c.title = CELL_LABEL[cell];
      grid.append(c);
    }
  }
  return grid;
}

export interface UnitCardOptions {
  /** Переключатель ★1/★2/★3 (справочник в коллекции). */
  readonly pickStars?: boolean;
  /** Сколько вернёт продажа (фигура игрока) или null. */
  readonly sell?: number | null;
  /** Покупка из магазина. */
  readonly buy?: { readonly cost: number; readonly affordable: boolean; onBuy(): void };
}

/** Карточка фигуры: схема хода и атаки, статы с учётом звёзд, способность. */
export function showUnitCard(
  root: HTMLElement,
  unitId: string,
  stars: Stars,
  opts: UnitCardOptions = {},
): void {
  const base = getUnit(unitId);
  const d: UnitDef = starScaledDef(base, stars, DEFAULT_RULES);
  root.replaceChildren();
  const head = el('div', 'info-head');
  head.append(
    el('strong', '', `${GLYPH[d.family]} ${d.name} ${'★'.repeat(stars)}`),
    el('span', 'info-sub', `${FAMILY_NAMES[d.family]} · уровень ${base.cost ?? '—'}`),
  );
  const close = el('button', 'info-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => hideInfo(root));
  head.append(close);
  if (opts.pickStars) {
    const pick = el('div', 'segmented star-pick');
    pick.setAttribute('role', 'tablist');
    pick.setAttribute('aria-label', 'Уровень звёзд');
    for (const n of [1, 2, 3] as const) {
      const b = el('button', '', '★'.repeat(n));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(n === stars));
      b.addEventListener('click', () => showUnitCard(root, unitId, n, opts));
      pick.append(b);
    }
    head.append(pick);
  }

  const stats = el('div', 'info-stats');
  const stat = (k: string, v: number | string) => {
    const s = el('span');
    s.append(el('b', '', String(v)), ` ${k}`);
    stats.append(s);
  };
  stat('HP', d.hp);
  stat('ATK', d.atk);
  if (d.armor) stat('броня', d.armor);
  stat('иниц.', d.initiative);
  stat('толчок', d.push);

  const body = el('div', 'info-body');
  const text = el('div', 'info-col');
  text.append(stats, el('p', 'info-text', PATTERN_TEXT[d.family]));
  if (d.description) text.append(el('p', 'info-text ability', d.description));
  const legend = el('p', 'pattern-legend');
  legend.append(el('span', 'lg lg-move'), ' ход  ', el('span', 'lg lg-attack'), ' удар');
  const schema = el('div', 'info-schema');
  schema.append(patternGrid(base), legend);
  body.append(schema, text);
  root.append(head, body);

  if (opts.buy) {
    const buy = el('button', 'fight info-buy', `Купить · ${opts.buy.cost}`);
    buy.type = 'button';
    buy.disabled = !opts.buy.affordable;
    if (!opts.buy.affordable) buy.textContent = `Не хватает золота · ${opts.buy.cost}`;
    buy.addEventListener('click', () => opts.buy!.onBuy());
    root.append(buy);
  } else if (opts.sell !== undefined && opts.sell !== null) {
    root.append(el('p', 'info-hint', `Перетащите на магазин, чтобы продать: +${opts.sell}`));
  }
  root.hidden = false;
}

export function showSynergyInfo(root: HTMLElement, family: Family, count: number): void {
  const def = SYNERGIES.find((s) => s.family === family)!;
  root.replaceChildren();
  const head = el('div', 'info-head');
  head.append(el('strong', '', `${GLYPH[family]} ${FAMILY_NAMES[family]}: ${count} на поле`));
  const close = el('button', 'info-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => hideInfo(root));
  head.append(close);
  root.append(head);
  for (const t of def.tiers) {
    const p = el('p', `info-text tier ${count >= t.count ? 'on' : ''}`);
    p.append(el('b', '', `${t.count} · ${t.name}: `), t.description);
    root.append(p);
  }
  root.hidden = false;
}

export function hideInfo(root: HTMLElement): void {
  root.hidden = true;
}

// ---------- Сообщения ----------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string): void {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
