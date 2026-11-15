/** Событие аналитики в формате таблицы public.analytics_events. */
export interface AnalyticsRow {
  readonly event: 'run_start' | 'round_end' | 'run_end';
  readonly device_id: string;
  readonly run_id: string | null;
  readonly props: Readonly<Record<string, string | number | boolean | null>>;
  readonly client_ts: string;
  readonly app_version: string;
}

export type Transport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

export interface AnalyticsOptions {
  /** URL проекта Supabase; без него и ключа события только логируются. */
  readonly url?: string;
  readonly key?: string;
  /** false — не отправлять (dev): события пишутся в консоль. */
  readonly enabled: boolean;
  readonly deviceId: string;
  readonly appVersion: string;
  readonly transport?: Transport;
  readonly now?: () => Date;
  readonly log?: (row: AnalyticsRow) => void;
}

const MAX_QUEUE = 200;

/**
 * Простая аналитика без аккаунтов: события копятся в очереди и уходят пачкой
 * в Supabase REST (insert). При ошибке остаются в очереди до следующей попытки.
 */
export class Analytics {
  private queue: AnalyticsRow[] = [];
  private sending = false;

  constructor(private readonly opts: AnalyticsOptions) {}

  get pending(): number {
    return this.queue.length;
  }

  private get active(): boolean {
    return this.opts.enabled && !!this.opts.url && !!this.opts.key;
  }

  track(event: AnalyticsRow['event'], runId: string | null, props: AnalyticsRow['props']): void {
    const row: AnalyticsRow = {
      event,
      device_id: this.opts.deviceId,
      run_id: runId,
      props,
      client_ts: (this.opts.now?.() ?? new Date()).toISOString(),
      app_version: this.opts.appVersion,
    };
    (this.opts.log ?? ((r) => console.info('[analytics]', r.event, r.props)))(row);
    if (!this.active) return;
    this.queue.push(row);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  /** Отправить накопленное. keepalive — чтобы запрос пережил закрытие вкладки. */
  async flush(): Promise<void> {
    if (!this.active || this.sending || this.queue.length === 0) return;
    const batch = this.queue.slice();
    this.sending = true;
    try {
      const send = this.opts.transport ?? ((u, i) => fetch(u, i));
      const res = await send(`${this.opts.url}/rest/v1/analytics_events`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: this.opts.key!,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(batch),
      });
      // 4xx (кроме 408/429) — данные не примут и при повторе: выбрасываем, чтобы не копить.
      const retry = !res.ok && (res.status >= 500 || res.status === 408 || res.status === 429);
      if (res.ok || !retry) this.queue.splice(0, batch.length);
      if (!res.ok) console.warn(`[analytics] отправка не удалась: HTTP ${res.status}`);
    } catch {
      // Сеть недоступна — попробуем позже.
    } finally {
      this.sending = false;
    }
  }

  /** Периодическая отправка и отправка при сворачивании/закрытии страницы. */
  autoFlush(intervalMs = 10_000): void {
    setInterval(() => void this.flush(), intervalMs);
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => void this.flush());
  }
}

/** Анонимный id устройства (без аккаунтов), хранится в localStorage. */
export function deviceId(): string {
  const KEY = 'chess-battler.device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
