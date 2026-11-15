import { describe, expect, it } from 'vitest';
import {
  dataCheckString,
  decodePayload,
  encodePayload,
  signInitData,
  verifyInitData,
} from '../_shared/telegram';

const TOKEN = '123456:TEST-token-for-unit-tests';
const NOW = 1_800_000_000;

async function initData(over: Record<string, string> = {}, token = TOKEN): Promise<string> {
  const p = new URLSearchParams({
    query_id: 'AAE',
    user: JSON.stringify({ id: 42, first_name: 'Ivan', language_code: 'uk' }),
    auth_date: String(NOW - 60),
    ...over,
  });
  p.set('hash', await signInitData(p, token));
  return p.toString();
}

describe('initData Telegram Mini App', () => {
  it('строка проверки: без hash, ключи по алфавиту, через перевод строки', () => {
    const p = new URLSearchParams('user=u&auth_date=1&hash=h&query_id=q');
    expect(dataCheckString(p)).toBe('auth_date=1\nquery_id=q\nuser=u');
  });

  it('подлинные данные проходят', async () => {
    const r = await verifyInitData(await initData(), TOKEN, { now: NOW });
    expect(r).toMatchObject({ ok: true, user: { id: 42, language_code: 'uk' } });
  });

  it('подмена любого поля ломает подпись', async () => {
    const data = new URLSearchParams(await initData());
    data.set('user', JSON.stringify({ id: 43, first_name: 'Ivan' }));
    expect(await verifyInitData(data.toString(), TOKEN, { now: NOW })).toEqual({
      ok: false,
      error: 'bad_signature',
    });
  });

  it('чужой токен и отсутствие подписи не проходят', async () => {
    expect(
      await verifyInitData(await initData({}, '999:other'), TOKEN, { now: NOW }),
    ).toMatchObject({
      error: 'bad_signature',
    });
    expect(await verifyInitData('user=%7B%7D&auth_date=1', TOKEN, { now: NOW })).toMatchObject({
      error: 'no_hash',
    });
  });

  it('старые данные отклоняются', async () => {
    const old = await initData({ auth_date: String(NOW - 2 * 86_400) });
    expect(await verifyInitData(old, TOKEN, { now: NOW })).toEqual({ ok: false, error: 'expired' });
  });

  it('без пользователя — отказ', async () => {
    const p = new URLSearchParams({ auth_date: String(NOW) });
    p.set('hash', await signInitData(p, TOKEN));
    expect(await verifyInitData(p.toString(), TOKEN, { now: NOW })).toEqual({
      ok: false,
      error: 'no_user',
    });
  });
});

describe('payload счёта Stars', () => {
  it('влезает в 128 байт и читается обратно', () => {
    const raw = encodePayload({ u: '6d2e9596-edf5-41f2-afed-ed8e0314e886', p: 'board_emerald' });
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(128);
    expect(decodePayload(raw)).toEqual({
      u: '6d2e9596-edf5-41f2-afed-ed8e0314e886',
      p: 'board_emerald',
    });
    expect(decodePayload('{oops')).toBeNull();
  });
});
