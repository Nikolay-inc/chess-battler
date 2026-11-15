import { describe, expect, it, vi } from 'vitest';
import { Analytics, SESSION_GAP_MS, sessionTracker } from './analytics';
import type { Transport } from './analytics';

const base = {
  url: 'https://example.supabase.co',
  key: 'sb_publishable_test',
  enabled: true,
  deviceId: '00000000-0000-4000-8000-000000000000',
  sessionId: () => '11111111-1111-4111-8111-111111111111',
  appVersion: '0.3.0+test',
  now: () => new Date('2026-11-15T12:00:00Z'),
  log: () => {},
};

describe('аналитика', () => {
  it('события и строки других таблиц уходят своими пачками с игроком, сессией и версией', async () => {
    const transport = vi.fn<Transport>(async () => ({ ok: true, status: 201 }));
    const a = new Analytics({ ...base, transport });
    a.track('run_start', '42', { seed: 42 });
    a.send('army_snapshots', { round: 1, outcome: 'win', units: [] });
    a.track('round_end', '42', { round: 1, result: 'win', reason: 'elimination' });
    await a.flush();
    expect(transport).toHaveBeenCalledTimes(2);
    const calls = transport.mock.calls.map(([url, init]) => ({
      url,
      rows: JSON.parse(init.body as string),
      headers: init.headers,
      keepalive: init.keepalive,
    }));
    expect(calls[0]!.url).toBe('https://example.supabase.co/rest/v1/analytics_events');
    expect(calls[0]!.rows.map((r: { event: string }) => r.event)).toEqual([
      'run_start',
      'round_end',
    ]);
    expect(calls[0]!.rows[1]).toMatchObject({
      device_id: base.deviceId,
      session_id: '11111111-1111-4111-8111-111111111111',
      app_version: '0.3.0+test',
      run_id: '42',
      props: { round: 1, result: 'win', reason: 'elimination' },
      client_ts: '2026-11-15T12:00:00.000Z',
    });
    expect(calls[0]!.headers).toMatchObject({
      apikey: 'sb_publishable_test',
      Prefer: 'return=minimal',
    });
    expect(calls[0]!.keepalive).toBe(true);
    expect(calls[1]!.url).toBe('https://example.supabase.co/rest/v1/army_snapshots');
    expect(calls[1]!.rows[0]).toMatchObject({ round: 1, device_id: base.deviceId });
    expect(a.pending).toBe(0);
  });

  it('при сбое сети или 5xx строки остаются, при 4xx — выбрасываются; таблицы независимы', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const status: Record<string, number> = { analytics_events: 503, run_feedback: 201 };
    const a = new Analytics({
      ...base,
      transport: async (url) => {
        const s = status[url.split('/').at(-1)!]!;
        return { ok: s < 300, status: s };
      },
    });
    a.track('run_end', '1', { result: 'lost' });
    a.send('run_feedback', { rating: 4 });
    await a.flush();
    expect(a.pending).toBe(1); // событие ждёт, опрос ушёл
    status.analytics_events = 400;
    await a.flush();
    expect(a.pending).toBe(0);
    const offline = new Analytics({
      ...base,
      transport: async () => {
        throw new TypeError('offline');
      },
    });
    offline.track('run_end', '1', {});
    await offline.flush();
    expect(offline.pending).toBe(1);
    warn.mockRestore();
  });

  it('выключенная аналитика ничего не отправляет, но логирует', async () => {
    const transport = vi.fn<Transport>();
    const log = vi.fn();
    const a = new Analytics({ ...base, enabled: false, transport, log });
    a.track('run_start', '1', {});
    await a.flush();
    expect(transport).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('сессии', () => {
  it('сессия продлевается активностью и сменяется после 30 минут тишины', () => {
    const store = new Map<string, string>();
    const kv = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    let t = 1_000_000;
    let n = 0;
    const session = sessionTracker(
      kv,
      () => t,
      () => `s${++n}`,
    );
    expect(session()).toBe('s1');
    t += SESSION_GAP_MS - 1;
    expect(session()).toBe('s1'); // продлена
    t += SESSION_GAP_MS - 1;
    expect(session()).toBe('s1');
    t += SESSION_GAP_MS + 1;
    expect(session()).toBe('s2');
    // Новая вкладка (новый трекер) продолжает ту же сессию.
    const other = sessionTracker(
      kv,
      () => t,
      () => `x${++n}`,
    );
    expect(other()).toBe('s2');
  });

  it('без хранилища сессия живёт в памяти', () => {
    let t = 0;
    const session = sessionTracker(
      null,
      () => t,
      () => crypto.randomUUID(),
    );
    const a = session();
    t += 1000;
    expect(session()).toBe(a);
  });
});
