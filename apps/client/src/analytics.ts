/** Таблицы Supabase, куда пишет клиент (только вставка, см. supabase/migrations). */
export type Table = 'analytics_events' | 'army_snapshots' | 'run_feedback';

export type EventName = 'run_start' | 'round_end' | 'run_end';
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Row = Readonly<Record<string, Json>>;

export type Transport = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

export interface AnalyticsOptions {
  /** URL проекта Supabase; без него и ключа данные только логируются. */
  readonly url?: string;
  readonly key?: string;
  /** false — не отправлять (dev): данные пишутся в консоль. */
  readonly enabled: boolean;
  /** Анонимный id игрока (UUID из localStorage). */
  readonly deviceId: string;
  /** Текущий id сессии (см. sessionTracker). */
  readonly sessionId: () => string;
  readonly appVersion: string;
  readonly transport?: Transport;
  readonly now?: () => Date;
  readonly log?: (table: Table, row: Row) => void;
}

const MAX_QUEUE = 200;

interface Pending {
  readonly table: Table;
  readonly row: Row;
}

/**
 * Простая аналитика без аккаунтов: строки копятся в очереди и уходят пачками
 * (по таблице) в Supabase REST (insert). При ошибке сети/5xx остаются до следующей попытки.
 * Ко всем строкам добавляются device_id (анонимный id игрока), session_id и app_version.
 */
export class Analytics {
  private queue: Pending[] = [];
  private sending = false;

  constructor(private readonly opts: AnalyticsOptions) {}

  get pending(): number {
    return this.queue.length;
  }

  private get active(): boolean {
    return this.opts.enabled && !!this.opts.url && !!this.opts.key;
  }

  /** Строка в таблицу: общие поля (игрок, сессия, версия) добавляются сами. */
  send(table: Table, fields: Row): void {
    const row: Row = {
      ...fields,
      device_id: this.opts.deviceId,
      session_id: this.opts.sessionId(),
      app_version: this.opts.appVersion,
    };
    (this.opts.log ?? ((t, r) => console.info(`[analytics] ${t}`, r)))(table, row);
    if (!this.active) return;
    this.queue.push({ table, row });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  /** Событие в analytics_events. */
  track(event: EventName, runId: string | null, props: Row): void {
    this.send('analytics_events', {
      event,
      run_id: runId,
      props,
      client_ts: (this.opts.now?.() ?? new Date()).toISOString(),
    });
  }

  /** Отправить накопленное: по пачке на таблицу. keepalive — переживает закрытие вкладки. */
  async flush(): Promise<void> {
    if (!this.active || this.sending || this.queue.length === 0) return;
    this.sending = true;
    try {
      const tables = [...new Set(this.queue.map((p) => p.table))];
      for (const table of tables) {
        const batch = this.queue.filter((p) => p.table === table);
        const done = await this.post(
          table,
          batch.map((p) => p.row),
        );
        if (done) this.queue = this.queue.filter((p) => !batch.includes(p));
      }
    } finally {
      this.sending = false;
    }
  }

  /** true — пачку можно убрать из очереди (принята или не будет принята никогда). */
  private async post(table: Table, rows: Row[]): Promise<boolean> {
    try {
      const send = this.opts.transport ?? ((u, i) => fetch(u, i));
      const res = await send(`${this.opts.url}/rest/v1/${table}`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: this.opts.key!,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
      });
      if (res.ok) return true;
      console.warn(`[analytics] ${table}: send failed, HTTP ${res.status}`);
      // 4xx (кроме 408/429) не примут и при повторе — выбрасываем, чтобы не копить.
      return !(res.status >= 500 || res.status === 408 || res.status === 429);
    } catch {
      return false; // сеть недоступна — попробуем позже
    }
  }

  /** Периодическая отправка и отправка при сворачивании/закрытии страницы. */
  autoFlush(intervalMs = 10_000): void {
    setInterval(() => void this.flush(), intervalMs);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
    window.addEventListener('pagehide', () => void this.flush());
  }
}

const SESSION_KEY = 'chess-battler.session';
/** Пауза, после которой начинается новая сессия. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/**
 * Id сессии: живёт в localStorage, обновляется после SESSION_GAP_MS без активности.
 * Каждый вызов продлевает сессию.
 */
export function sessionTracker(
  storage: KV | null = safeStorage(),
  now: () => number = () => Date.now(),
  newId: () => string = () => crypto.randomUUID(),
): () => string {
  let memory: { id: string; last: number } | null = null;
  return () => {
    const t = now();
    let cur = memory;
    try {
      const raw = storage?.getItem(SESSION_KEY);
      if (raw) cur = JSON.parse(raw) as { id: string; last: number };
    } catch {
      // битое значение — начнём новую сессию
    }
    if (!cur || typeof cur.id !== 'string' || !(t - cur.last <= SESSION_GAP_MS)) {
      cur = { id: newId(), last: t };
    }
    cur = { id: cur.id, last: t };
    memory = cur;
    try {
      storage?.setItem(SESSION_KEY, JSON.stringify(cur));
    } catch {
      // без хранилища сессия живёт до перезагрузки
    }
    return cur.id;
  };
}

function safeStorage(): KV | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Анонимный id игрока (без аккаунтов), хранится в localStorage. */
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
