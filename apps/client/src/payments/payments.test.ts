import { describe, expect, it, vi } from 'vitest';
import { getCosmetic } from '@chess-battler/content';
import { DevProvider, StubProvider, TelegramStarsProvider, pickProvider } from './provider';
import type { InvokeFn, TelegramWebAppPayments } from './provider';
import { normalizeEquipped } from './purchases';

const marble = getCosmetic('board_marble')!;

describe('способы оплаты', () => {
  it('выбирается первый доступный; заглушки магазинов недоступны', () => {
    const dev = new DevProvider(async () => ({ data: null, error: null }));
    const stars = new TelegramStarsProvider(
      async () => ({ data: null, error: null }),
      () => undefined,
    );
    const stubs = [
      new StubProvider('app_store'),
      new StubProvider('google_play'),
      new StubProvider('stripe'),
    ];
    expect(pickProvider([stars, ...stubs])).toBeNull();
    expect(pickProvider([stars, null, dev, ...stubs])).toBe(dev);
  });

  it('Telegram Stars: счёт с сервера → openInvoice; «paid» → ждём запись вебхуком', async () => {
    const invoke = vi.fn<InvokeFn>(async () => ({
      data: { link: 'https://t.me/$inv' },
      error: null,
    }));
    const webApp: TelegramWebAppPayments = {
      initData: 'query_id=1',
      openInvoice: (url, cb) => {
        expect(url).toBe('https://t.me/$inv');
        cb?.('paid');
      },
    };
    const p = new TelegramStarsProvider(invoke, () => webApp);
    expect(p.isAvailable()).toBe(true);
    expect(await p.purchase(marble)).toEqual({ status: 'pending' });
    expect(invoke).toHaveBeenCalledWith('stars-invoice', { productId: 'board_marble' });
  });

  it('Telegram Stars: отмена и ошибка счёта', async () => {
    const cancel: TelegramWebAppPayments = {
      initData: 'x',
      openInvoice: (_u, cb) => cb?.('cancelled'),
    };
    const ok = async () => ({ data: { link: 'L' }, error: null });
    expect(await new TelegramStarsProvider(ok, () => cancel).purchase(marble)).toEqual({
      status: 'cancelled',
    });
    const fail = async () => ({ data: null, error: { message: 'boom' } });
    expect(await new TelegramStarsProvider(fail, () => cancel).purchase(marble)).toEqual({
      status: 'failed',
      error: 'boom',
    });
  });

  it('тестовая оплата вызывает dev-purchase', async () => {
    const invoke = vi.fn<InvokeFn>(async () => ({ data: { ok: true }, error: null }));
    expect(await new DevProvider(invoke).purchase(marble)).toEqual({ status: 'paid' });
    expect(invoke).toHaveBeenCalledWith('dev-purchase', { productId: 'board_marble' });
  });
});

describe('надетые скины', () => {
  it('некупленные, чужого вида и неизвестные заменяются стандартными', () => {
    const owned = new Set(['board_marble']);
    expect(
      normalizeEquipped(
        { board: 'board_marble', frame: 'frame_gold', pushFx: 'board_emerald' },
        owned,
      ),
    ).toEqual({
      board: 'board_marble',
      frame: 'frame_default',
      pushFx: 'push_default',
    });
    expect(normalizeEquipped(null, owned)).toEqual({
      board: 'board_default',
      frame: 'frame_default',
      pushFx: 'push_default',
    });
  });
});
