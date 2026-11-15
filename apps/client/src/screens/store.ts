import { COSMETICS, COSMETIC_KINDS } from '@chess-battler/content';
import type { Cosmetic } from '@chess-battler/content';
import type { Account } from '../account';
import { cosmeticKindName, cosmeticName, t } from '../i18n';
import type { PaymentProvider } from '../payments/provider';
import type { PurchasesStore } from '../payments/purchases';
import { $, el, toast } from '../ui';

/** Превью скина из его цветов (стандартные — из токенов). */
function preview(c: Cosmetic): HTMLElement {
  const sw = el('div', `swatch swatch-${c.kind}`);
  sw.setAttribute('aria-hidden', 'true');
  if (c.kind === 'board') {
    const b = c.board;
    const [l, d, el2, ed] = b
      ? [b.ownLight, b.ownDark, b.enemyLight, b.enemyDark]
      : [
          'var(--color-board-own-light)',
          'var(--color-board-own-dark)',
          'var(--color-board-enemy-light)',
          'var(--color-board-enemy-dark)',
        ];
    sw.style.background = `conic-gradient(${ed} 0 25%, ${el2} 0 50%, ${d} 0 75%, ${l} 0)`;
    sw.style.backgroundSize = '24px 24px';
  } else if (c.kind === 'frame') {
    const ring = el('span', 'swatch-ring', '♞');
    ring.style.borderColor = c.frame ?? 'var(--color-side-a)';
    sw.append(ring);
  } else {
    const fx = c.pushFx;
    const arrow = el('span', 'swatch-arrow', '➜');
    arrow.style.color = fx?.arrow ?? 'var(--color-fx-spark)';
    arrow.style.textShadow = `0 0 12px ${fx?.chain ?? 'var(--color-fx-collision)'}`;
    sw.append(arrow);
  }
  return sw;
}

/**
 * Витрина скинов: покупка через PaymentProvider (Telegram Stars в Telegram, тестовая
 * оплата локально), «Надеть», «Восстановить покупки». Покупки только косметические.
 */
export class StoreScreen {
  private busy = false;

  constructor(
    private readonly account: Account,
    private readonly purchases: PurchasesStore,
    private readonly provider: () => PaymentProvider | null,
    private readonly isVisible: () => boolean,
  ) {
    const refresh = () => {
      if (this.isVisible()) this.render();
    };
    purchases.onChange(refresh);
    account.onChange(refresh);
  }

  render(): void {
    const root = $('store');
    const scroll = root.scrollTop;
    root.replaceChildren();
    root.append(el('p', 'notice', t('store.cosmeticOnly')));

    const s = this.account.state;
    const provider = this.provider();
    const canBuy = s.status === 'ready' && !!provider;
    if (s.status !== 'ready') root.append(el('p', 'hint', t('store.unavailable')));
    else if (!provider) root.append(el('p', 'hint', t('store.needTelegram')));
    else {
      if (s.anonymous) root.append(el('p', 'hint', t('store.guestHint')));
      if (provider.id === 'dev') root.append(el('p', 'hint', t('store.devProvider')));
    }

    for (const kind of COSMETIC_KINDS) {
      const section = el('section', 'store-section');
      section.append(el('h2', 'section-title', cosmeticKindName(kind)));
      const grid = el('div', 'store-grid');
      for (const c of COSMETICS.filter((x) => x.kind === kind)) grid.append(this.card(c, canBuy));
      section.append(grid);
      root.append(section);
    }

    const restore = el('button', 'secondary wide', t('store.restore'));
    restore.type = 'button';
    restore.disabled = s.status !== 'ready' || this.busy;
    restore.addEventListener(
      'click',
      () =>
        void this.act(async () => {
          const n = await this.purchases.load();
          toast(t('store.restored', { n }));
        }),
    );
    root.append(restore);
    root.scrollTop = scroll;
  }

  private card(c: Cosmetic, canBuy: boolean): HTMLElement {
    const card = el('div', 'store-card');
    const owned = this.purchases.owns(c.id);
    const equipped = this.purchases.equipped[c.kind] === c.id;
    const price = c.priceXtr === 0 ? t('store.free') : `⭐ ${c.priceXtr}`;
    card.append(
      preview(c),
      el('strong', '', cosmeticName(c.id)),
      el('span', 'muted', owned ? t('store.owned') : price),
    );

    const btn = el('button', equipped ? 'secondary' : owned ? 'secondary' : 'fight');
    btn.type = 'button';
    if (equipped) {
      btn.textContent = t('store.equipped');
      btn.disabled = true;
    } else if (owned) {
      btn.textContent = t('store.equip');
      btn.disabled = this.busy;
      btn.addEventListener(
        'click',
        () =>
          void this.act(async () => {
            if (!(await this.purchases.equip(c.id))) toast(t('store.equipFailed'));
          }),
      );
    } else {
      btn.textContent = t('store.buy', { price: c.priceXtr });
      btn.disabled = !canBuy || this.busy;
      btn.addEventListener('click', () => void this.buy(c));
    }
    card.append(btn);
    return card;
  }

  private async buy(c: Cosmetic): Promise<void> {
    const provider = this.provider();
    if (!provider) return;
    await this.act(async () => {
      const r = await provider.purchase(c);
      if (r.status === 'paid') {
        await this.purchases.load();
        await this.purchases.equip(c.id);
        toast(t('store.done', { name: cosmeticName(c.id) }));
      } else if (r.status === 'pending') {
        toast(t('store.pending'));
        // Вебхук записывает покупку за секунды — перечитать чуть позже.
        setTimeout(() => void this.purchases.load(), 3000);
      } else if (r.status === 'cancelled') {
        toast(t('store.cancelled'));
      } else {
        toast(t('store.failed', { error: r.error }));
      }
    });
  }

  private async act(fn: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.render();
    try {
      await fn();
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
