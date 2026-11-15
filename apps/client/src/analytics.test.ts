import { describe, expect, it, vi } from 'vitest';
import { Analytics } from './analytics';
import type { Transport } from './analytics';

const base = {
  url: 'https://example.supabase.co',
  key: 'sb_publishable_test',
  enabled: true,
  deviceId: '00000000-0000-4000-8000-000000000000',
  appVersion: 'test',
  now: () => new Date('2026-11-15T12:00:00Z'),
  log: () => {},
};

describe('аналитика', () => {
  it('отправляет пачку в Supabase REST с ключом и return=minimal', async () => {
    const transport = vi.fn<Transport>(async () => ({ ok: true, status: 201 }));
    const a = new Analytics({ ...base, transport });
    a.track('run_start', '42', { seed: 42 });
    a.track('round_end', '42', { round: 1, result: 'win', duration_ms: 1234 });
    await a.flush();
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe('https://example.supabase.co/rest/v1/analytics_events');
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_test', Prefer: 'return=minimal' });
    expect(init.keepalive).toBe(true);
    const rows = JSON.parse(init.body as string);
    expect(rows.map((r: { event: string }) => r.event)).toEqual(['run_start', 'round_end']);
    expect(rows[1]).toMatchObject({
      device_id: base.deviceId,
      run_id: '42',
      props: { round: 1, result: 'win', duration_ms: 1234 },
      client_ts: '2026-11-15T12:00:00.000Z',
    });
    expect(a.pending).toBe(0);
  });

  it('при сбое сети или 5xx оставляет события в очереди, при 4xx — выбрасывает', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let status = 503;
    const a = new Analytics({ ...base, transport: async () => ({ ok: status < 300, status }) });
    a.track('run_end', '1', { result: 'lost' });
    await a.flush();
    expect(a.pending).toBe(1);
    const offline = new Analytics({
      ...base,
      transport: async () => {
        throw new TypeError('offline');
      },
    });
    offline.track('run_end', '1', {});
    await offline.flush();
    expect(offline.pending).toBe(1);
    status = 400;
    await a.flush();
    expect(a.pending).toBe(0);
    status = 201;
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
