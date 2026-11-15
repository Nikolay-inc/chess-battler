import { SYNERGIES, getUnit } from '@chess-battler/content';
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
import { familyName, synergyDesc, synergyName, t, unitDesc, unitName } from './i18n';
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

/** Шаблон хода и атаки семьи словами. */
const patternText = (f: Family): string => t(`pattern.${f}`);

// ---------- HUD ----------

export function renderHud(root: HTMLElement, s: RunState, cfg: RunConfig): void {
  const hearts = '♥'.repeat(Math.max(0, s.lives)) + '♡'.repeat(Math.max(0, cfg.lives - s.lives));
  root.querySelector('.hud-round')!.textContent = t('play.round', { round: s.round });
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
    root.append(el('span', 'syn-empty', t('synergies.empty')));
    return;
  }
  for (const a of active) {
    const def = SYNERGIES.find((d) => d.family === a.family)!;
    const next = def.tiers.find((tier) => tier.count > a.count)?.count ?? def.tiers.at(-1)!.count;
    const chip = el('button', `syn-chip ${a.tiers.length ? 'active' : ''}`);
    chip.type = 'button';
    chip.dataset.family = a.family;
    chip.textContent = `${GLYPH[a.family]} ${familyName(a.family)} ${a.count}/${next}`;
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
    card.setAttribute('aria-label', t('card.priceAria', { name: unitName(id), cost }));
    card.append(
      el('span', 'card-glyph', GLYPH[def.family]),
      el('span', 'card-name', unitName(id)),
      el('span', 'card-stats', `${def.hp}♥ ${def.atk}⚔️`),
      el('span', 'card-cost', `${cost}`),
    );
    card.addEventListener('click', () => onTap(slot));
    root.append(card);
  });
}

// ---------- Карточка фигуры ----------

const cellLabel = (c: PreviewCell): string =>
  c === 'self'
    ? t('card.self')
    : c === 'move'
      ? t('card.move')
      : c === 'attack'
        ? t('card.attack')
        : c === 'both'
          ? t('card.moveAndAttack')
          : '';

/** Мини-схема 5×5: куда фигура ходит (точки) и куда бьёт (красные клетки). */
function patternGrid(def: UnitDef): HTMLElement {
  const grid = el('div', 'pattern');
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', t('card.schema', { text: patternText(def.family) }));
  for (const row of patternPreview(def)) {
    for (const cell of row) {
      const c = el('span', `pc pc-${cell}`, cell === 'self' ? GLYPH[def.family] : '');
      if (cell !== 'empty') c.title = cellLabel(cell);
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
    el('strong', '', `${GLYPH[d.family]} ${unitName(d.id)} ${'★'.repeat(stars)}`),
    el(
      'span',
      'info-sub',
      t('card.level', { family: familyName(d.family), cost: base.cost ?? '—' }),
    ),
  );
  const close = el('button', 'info-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('card.close'));
  close.addEventListener('click', () => hideInfo(root));
  head.append(close);
  if (opts.pickStars) {
    const pick = el('div', 'segmented star-pick');
    pick.setAttribute('role', 'tablist');
    pick.setAttribute('aria-label', t('card.stars'));
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
  stat(t('card.hp'), d.hp);
  stat(t('card.atk'), d.atk);
  if (d.armor) stat(t('card.armor'), d.armor);
  stat(t('card.initiative'), d.initiative);
  stat(t('card.push'), d.push);

  const body = el('div', 'info-body');
  const text = el('div', 'info-col');
  text.append(stats, el('p', 'info-text', patternText(d.family)));
  // Числа способности — с учётом звёзд (d — starScaledDef).
  const desc = unitDesc(d);
  if (desc) text.append(el('p', 'info-text ability', desc));
  const legend = el('p', 'pattern-legend');
  legend.append(
    el('span', 'lg lg-move'),
    ` ${t('card.move')}  `,
    el('span', 'lg lg-attack'),
    ` ${t('card.attack')}`,
  );
  const schema = el('div', 'info-schema');
  schema.append(patternGrid(base), legend);
  body.append(schema, text);
  root.append(head, body);

  if (opts.buy) {
    const cost = opts.buy.cost;
    const buy = el('button', 'fight info-buy', t('card.buy', { cost }));
    buy.type = 'button';
    buy.disabled = !opts.buy.affordable;
    if (!opts.buy.affordable) buy.textContent = t('card.noGold', { cost });
    buy.addEventListener('click', () => opts.buy!.onBuy());
    root.append(buy);
  } else if (opts.sell !== undefined && opts.sell !== null) {
    root.append(el('p', 'info-hint', t('card.sellHint', { gold: opts.sell })));
  }
  root.hidden = false;
}

export function showSynergyInfo(root: HTMLElement, family: Family, count: number): void {
  const def = SYNERGIES.find((s) => s.family === family)!;
  root.replaceChildren();
  const head = el('div', 'info-head');
  head.append(
    el(
      'strong',
      '',
      `${GLYPH[family]} ${t('synergies.onBoard', { family: familyName(family), n: count })}`,
    ),
  );
  const close = el('button', 'info-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('card.close'));
  close.addEventListener('click', () => hideInfo(root));
  head.append(close);
  root.append(head);
  for (const tier of def.tiers) {
    const p = el('p', `info-text tier ${count >= tier.count ? 'on' : ''}`);
    p.append(
      el('b', '', `${tier.count} · ${synergyName(family, tier.count)}: `),
      synergyDesc(family, tier.count, tier.effect),
    );
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
  const box = $('toast');
  box.textContent = text;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 1800);
}
