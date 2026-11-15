import { t } from '../i18n';
import type { UiKey } from '../i18n';
import { $, el } from '../ui';

interface SkinStub {
  readonly name: UiKey;
  readonly kind: UiKey;
  /** Токены цветов для превью. */
  readonly swatch: readonly [string, string, string];
}

const SKINS: readonly SkinStub[] = [
  {
    name: 'store.skinMarble',
    kind: 'store.kindBoard',
    swatch: ['--color-text', '--color-text-muted', '--color-surface-raised'],
  },
  {
    name: 'store.skinEmerald',
    kind: 'store.kindBoard',
    swatch: ['--color-riders', '--color-surface', '--color-bg'],
  },
  {
    name: 'store.skinGoldFrame',
    kind: 'store.kindFrame',
    swatch: ['--color-accent', '--color-surface', '--color-bg'],
  },
  {
    name: 'store.skinLilacSmoke',
    kind: 'store.kindPushFx',
    swatch: ['--color-mystics', '--color-fx-storm', '--color-bg'],
  },
];

/** Магазин — каркас: витрина скинов-заглушек; покупка через PaymentProvider — в подэтапе D. */
export function renderStore(): void {
  const root = $('store');
  root.replaceChildren();
  root.append(el('p', 'notice', t('store.cosmeticOnly')));
  const grid = el('div', 'store-grid');
  for (const skin of SKINS) {
    const card = el('div', 'store-card');
    const sw = el('div', 'swatch');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.background = `linear-gradient(135deg, var(${skin.swatch[0]}) 0 33%, var(${skin.swatch[1]}) 33% 66%, var(${skin.swatch[2]}) 66%)`;
    const buy = el('button', 'secondary', t('store.soon'));
    buy.type = 'button';
    buy.disabled = true;
    card.append(sw, el('strong', '', t(skin.name)), el('span', 'muted', t(skin.kind)), buy);
    grid.append(card);
  }
  const restore = el('button', 'secondary wide', t('store.restore'));
  restore.type = 'button';
  restore.disabled = true;
  root.append(grid, restore);
}
