import { $, el } from '../ui';

interface SkinStub {
  readonly name: string;
  readonly kind: string;
  /** Токены цветов для превью. */
  readonly swatch: readonly [string, string, string];
}

const SKINS: readonly SkinStub[] = [
  {
    name: 'Мрамор',
    kind: 'Тема доски',
    swatch: ['--color-text', '--color-text-muted', '--color-surface-raised'],
  },
  {
    name: 'Изумруд',
    kind: 'Тема доски',
    swatch: ['--color-riders', '--color-surface', '--color-bg'],
  },
  {
    name: 'Золотая рамка',
    kind: 'Рамка фигур',
    swatch: ['--color-accent', '--color-surface', '--color-bg'],
  },
  {
    name: 'Лиловый дым',
    kind: 'Эффект толчка',
    swatch: ['--color-mystics', '--color-fx-storm', '--color-bg'],
  },
];

/** Магазин — каркас: витрина скинов-заглушек; покупка через PaymentProvider — в подэтапе D. */
export function renderStore(): void {
  const root = $('store');
  root.replaceChildren();
  root.append(el('p', 'notice', 'Только косметика: скины не влияют на бой'));
  const grid = el('div', 'store-grid');
  for (const skin of SKINS) {
    const card = el('div', 'store-card');
    const sw = el('div', 'swatch');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.background = `linear-gradient(135deg, var(${skin.swatch[0]}) 0 33%, var(${skin.swatch[1]}) 33% 66%, var(${skin.swatch[2]}) 66%)`;
    const buy = el('button', 'secondary', 'Скоро');
    buy.type = 'button';
    buy.disabled = true;
    card.append(sw, el('strong', '', skin.name), el('span', 'muted', skin.kind), buy);
    grid.append(card);
  }
  const restore = el('button', 'secondary wide', 'Восстановить покупки');
  restore.type = 'button';
  restore.disabled = true;
  root.append(grid, restore);
}
