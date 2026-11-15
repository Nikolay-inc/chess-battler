import type { Cosmetic } from '@chess-battler/content';

export type ProviderId = 'telegram_stars' | 'app_store' | 'google_play' | 'stripe' | 'dev';

export type PurchaseResult =
  | { readonly status: 'paid' }
  /** Оплата принята, сервер ещё записывает покупку (вебхук) — обновить список позже. */
  | { readonly status: 'pending' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: string };

/**
 * Способ оплаты. Покупки только косметические; запись о покупке делает сервер
 * после проверки платежа, клиент лишь запускает оплату и затем перечитывает покупки.
 */
export interface PaymentProvider {
  readonly id: ProviderId;
  isAvailable(): boolean;
  purchase(item: Cosmetic): Promise<PurchaseResult>;
}

/** Вызов Edge Function от имени текущего пользователя. */
export type InvokeFn = (
  name: string,
  body: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Заглушка магазина платформы (App Store, Google Play, Stripe) — подключим позже. */
export class StubProvider implements PaymentProvider {
  constructor(readonly id: Exclude<ProviderId, 'telegram_stars' | 'dev'>) {}
  isAvailable(): boolean {
    return false;
  }
  async purchase(): Promise<PurchaseResult> {
    return { status: 'failed', error: 'not_implemented' };
  }
}

/** Тестовая оплата для локального стека (Edge Function dev-purchase, в облаке отключена). */
export class DevProvider implements PaymentProvider {
  readonly id = 'dev' as const;
  constructor(private readonly invoke: InvokeFn) {}
  isAvailable(): boolean {
    return true;
  }
  async purchase(item: Cosmetic): Promise<PurchaseResult> {
    const { error } = await this.invoke('dev-purchase', { productId: item.id });
    return error ? { status: 'failed', error: error.message } : { status: 'paid' };
  }
}

/** Минимальный тип Telegram WebApp для оплаты (полный SDK — подэтап E). */
export interface TelegramWebAppPayments {
  readonly initData: string;
  openInvoice(
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void,
  ): void;
}

/**
 * Telegram Stars (XTR): сервер (Edge Function stars-invoice) создаёт счёт через Bot API
 * createInvoiceLink, клиент открывает его в Telegram. Покупку записывает вебхук бота
 * после successful_payment (подэтап E) — клиент её не создаёт.
 */
export class TelegramStarsProvider implements PaymentProvider {
  readonly id = 'telegram_stars' as const;
  constructor(
    private readonly invoke: InvokeFn,
    private readonly webApp: () => TelegramWebAppPayments | undefined,
  ) {}

  isAvailable(): boolean {
    const w = this.webApp();
    return !!w?.initData && typeof w.openInvoice === 'function';
  }

  async purchase(item: Cosmetic): Promise<PurchaseResult> {
    const w = this.webApp();
    if (!w) return { status: 'failed', error: 'no_telegram' };
    const { data, error } = await this.invoke('stars-invoice', { productId: item.id });
    const link = (data as { link?: string } | null)?.link;
    if (error || !link) return { status: 'failed', error: error?.message ?? 'no_invoice' };
    return new Promise((resolve) =>
      w.openInvoice(link, (status) =>
        resolve(
          status === 'paid'
            ? { status: 'pending' } // запись придёт с вебхуком — перечитаем покупки
            : status === 'failed'
              ? { status: 'failed', error: 'payment_failed' }
              : { status },
        ),
      ),
    );
  }
}

/** Первый доступный способ оплаты по приоритету; null — покупки сейчас недоступны. */
export function pickProvider(
  providers: readonly (PaymentProvider | null)[],
): PaymentProvider | null {
  return providers.find((p): p is PaymentProvider => !!p && p.isAvailable()) ?? null;
}
