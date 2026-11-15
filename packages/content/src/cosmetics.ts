/**
 * Косметика: скины меняют только отрисовку — sim их не видит, на бой не влияют.
 * Цены — в Telegram Stars (XTR). Цена 0 — стандартный скин (есть у всех, надет по умолчанию).
 * Названия — locales/*.json (cosmetic.<id>). Наличие и цены на сервере —
 * таблица products (supabase/migrations/…_payments.sql); тест сверяет её с этим каталогом.
 */
export type CosmeticKind = 'board' | 'frame' | 'pushFx';

export interface BoardSkin {
  readonly ownLight: string;
  readonly ownDark: string;
  readonly enemyLight: string;
  readonly enemyDark: string;
}

export interface Cosmetic {
  readonly id: string;
  readonly kind: CosmeticKind;
  readonly priceXtr: number;
  /** null у стандартных — берутся цвета из дизайн-токенов. */
  readonly board?: BoardSkin | null;
  /** Цвет обводки своих фигур. */
  readonly frame?: string | null;
  /** Цвета стрелки толчка и волны цепочки. */
  readonly pushFx?: { readonly arrow: string; readonly chain: string } | null;
}

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'board_default', kind: 'board', priceXtr: 0, board: null },
  {
    id: 'board_marble',
    kind: 'board',
    priceXtr: 50,
    board: { ownLight: '#5b6170', ownDark: '#454a57', enemyLight: '#6b5f63', enemyDark: '#55494d' },
  },
  {
    id: 'board_emerald',
    kind: 'board',
    priceXtr: 50,
    board: { ownLight: '#1f4d3c', ownDark: '#183d30', enemyLight: '#4a3a2a', enemyDark: '#3b2e21' },
  },
  { id: 'frame_default', kind: 'frame', priceXtr: 0, frame: null },
  { id: 'frame_gold', kind: 'frame', priceXtr: 75, frame: '#f2c14e' },
  { id: 'push_default', kind: 'pushFx', priceXtr: 0, pushFx: null },
  {
    id: 'push_lilac',
    kind: 'pushFx',
    priceXtr: 40,
    pushFx: { arrow: '#d7b8ff', chain: '#b57bff' },
  },
];

export const COSMETIC_KINDS: readonly CosmeticKind[] = ['board', 'frame', 'pushFx'];

export const DEFAULT_COSMETICS: Readonly<Record<CosmeticKind, string>> = {
  board: 'board_default',
  frame: 'frame_default',
  pushFx: 'push_default',
};

export function getCosmetic(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

export const isDefaultCosmetic = (id: string): boolean =>
  Object.values(DEFAULT_COSMETICS).includes(id);
