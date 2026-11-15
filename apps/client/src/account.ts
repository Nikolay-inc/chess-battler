import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Аккаунт игрока на Supabase Auth.
 * - Гость по умолчанию: анонимный пользователь (signInAnonymously) при первом запуске.
 * - Привязка: email (magic link через updateUser) или Google (linkIdentity) — id не меняется,
 *   поэтому профиль и история гостя сохраняются.
 * - Вход в уже существующий аккаунт: magic link (signInWithOtp, без создания нового).
 * - Выход: снова гость. Удаление: Edge Function delete-account, затем новый гость.
 * Если вход выключен (VITE_AUTH_ENABLED) или сервер недоступен — status 'disabled'/'offline',
 * игра работает локально.
 */
export type AccountStatus = 'disabled' | 'loading' | 'ready' | 'offline';
export type Provider = 'email' | 'google' | 'apple';

export interface AccountState {
  readonly status: AccountStatus;
  readonly userId: string | null;
  readonly anonymous: boolean;
  readonly email: string | null;
  /** Привязанные способы входа (кроме анонимного). */
  readonly providers: readonly Provider[];
}

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface AccountOptions {
  readonly url?: string;
  readonly key?: string;
  readonly enabled: boolean;
  /** Куда вернуть пользователя после magic link / OAuth. */
  readonly redirectTo: string;
}

const INITIAL: AccountState = {
  status: 'loading',
  userId: null,
  anonymous: true,
  email: null,
  providers: [],
};

/** Состояние из пользователя Supabase. */
export function stateFromUser(user: User | null, status: AccountStatus): AccountState {
  if (!user) return { ...INITIAL, status };
  const providers = (user.identities ?? [])
    .map((i) => i.provider)
    .filter((p): p is Provider => p === 'email' || p === 'google' || p === 'apple');
  return {
    status,
    userId: user.id,
    anonymous: user.is_anonymous ?? providers.length === 0,
    email: user.email ?? null,
    providers: [...new Set(providers)],
  };
}

export class Account {
  /** Клиент Supabase; создаётся в init() (библиотека грузится лениво, только если вход включён). */
  client: SupabaseClient | null = null;
  private value: AccountState;
  private readonly listeners: ((s: AccountState) => void)[] = [];
  private readonly on: boolean;

  constructor(private readonly opts: AccountOptions) {
    this.on = opts.enabled && !!opts.url && !!opts.key;
    this.value = this.on ? INITIAL : { ...INITIAL, status: 'disabled' };
  }

  get state(): AccountState {
    return this.value;
  }

  onChange(cb: (s: AccountState) => void): void {
    this.listeners.push(cb);
  }

  private set(next: AccountState): void {
    this.value = next;
    for (const cb of this.listeners) cb(next);
  }

  /** Восстановить сессию или войти гостем. Ошибки сети → offline (игра продолжается локально). */
  async init(): Promise<void> {
    if (!this.on) return;
    let c: SupabaseClient;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      c = this.client = createClient(this.opts.url!, this.opts.key!, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'chess-battler.auth' },
      });
    } catch {
      this.set({ ...INITIAL, status: 'offline' });
      return;
    }
    c.auth.onAuthStateChange((_event, session) => {
      // После magic link / OAuth (в т.ч. в другой вкладке) состояние обновится само.
      if (session?.user) this.set(stateFromUser(session.user, 'ready'));
    });
    try {
      const { data } = await c.auth.getSession();
      if (data.session?.user) {
        // Обновить данные пользователя (привязки могли измениться на сервере).
        const fresh = await c.auth.getUser();
        this.set(stateFromUser(fresh.data.user ?? data.session.user, 'ready'));
        return;
      }
      await this.guest();
    } catch {
      this.set({ ...INITIAL, status: 'offline' });
    }
  }

  private async guest(): Promise<void> {
    const { data, error } = await this.client!.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('anonymous sign-in failed');
    this.set(stateFromUser(data.user, 'ready'));
  }

  private async run(
    fn: () => Promise<{ error: { message: string } | null }>,
  ): Promise<ActionResult> {
    if (!this.client || this.value.status !== 'ready') return { ok: false, error: 'unavailable' };
    try {
      const { error } = await fn();
      return error ? { ok: false, error: error.message } : { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Привязать email: письмо со ссылкой подтверждения; после перехода гость становится аккаунтом. */
  linkEmail(email: string): Promise<ActionResult> {
    return this.run(() =>
      this.client!.auth.updateUser({ email }, { emailRedirectTo: this.opts.redirectTo }),
    );
  }

  /** Привязать Google (OAuth-редирект). Пока провайдер не настроен — вернёт ошибку. */
  linkGoogle(): Promise<ActionResult> {
    return this.run(() =>
      this.client!.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: this.opts.redirectTo },
      }),
    );
  }

  /** Войти в существующий аккаунт по ссылке из письма (новый аккаунт не создаётся). */
  signInWithEmail(email: string): Promise<ActionResult> {
    return this.run(() =>
      this.client!.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: this.opts.redirectTo },
      }),
    );
  }

  /** Выйти; сразу входим новым гостем. Данные гостя на сервере остаются за старым id. */
  async signOut(): Promise<ActionResult> {
    const r = await this.run(() => this.client!.auth.signOut());
    if (!r.ok) return r;
    try {
      await this.guest();
      return { ok: true };
    } catch (e) {
      this.set({ ...INITIAL, status: 'offline' });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Удалить аккаунт со всеми данными на сервере, затем — новый гость. */
  async deleteAccount(): Promise<ActionResult> {
    const r = await this.run(async () => {
      const { error } = await this.client!.functions.invoke('delete-account', { method: 'POST' });
      return { error: error ? { message: error.message } : null };
    });
    if (!r.ok) return r;
    // Пользователя на сервере уже нет: сбросить локальную сессию и войти новым гостем.
    await this.client!.auth.signOut({ scope: 'local' }).catch(() => undefined);
    try {
      await this.guest();
    } catch {
      this.set({ ...INITIAL, status: 'offline' });
    }
    return { ok: true };
  }
}
