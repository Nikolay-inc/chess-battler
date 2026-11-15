import type { Family, RunState } from '@chess-battler/sim';
import { getUnit } from '@chess-battler/content';
import type { Account, AccountState } from './account';
import type { Settings, SettingsStore } from './settings';
import { parseSettings } from './settings';

/** Законченный забег для истории и статистики профиля. */
export interface RunRecord {
  readonly run_id: string;
  readonly finished_at: string;
  readonly result: 'won' | 'lost';
  readonly wins: number;
  readonly losses: number;
  readonly rounds: number;
  /** Сколько фигур каждой семьи было на поле в конце. */
  readonly families: Partial<Record<Family, number>>;
  readonly app_version: string;
}

export interface Profile {
  readonly nickname: string | null;
  readonly avatar: string | null;
}

export interface ProfileStats {
  readonly runs: number;
  readonly wins: number;
  /** Лучший забег по числу побед (null — забегов нет). */
  readonly best: RunRecord | null;
  readonly favorite: Family | null;
}

export const HISTORY_LIMIT = 20;
const LOCAL_KEY = 'chess-battler.history.v1';
const PROFILE_KEY = 'chess-battler.profile.v1';

export const AVATARS = [
  'pawn-accent',
  'knight-accent',
  'bishop-accent',
  'rook-accent',
  'pawn-a',
  'knight-a',
  'bishop-a',
  'rook-a',
  'pawn-b',
  'knight-b',
  'bishop-b',
  'rook-b',
] as const;
export type AvatarId = (typeof AVATARS)[number];

/** Ник: 2–20 символов, буквы любых алфавитов, цифры, пробел, _ и -. */
export function validNickname(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  return /^[\p{L}\p{N} _-]{2,20}$/u.test(s) ? s : null;
}

/** Запись истории из законченного забега. */
export function runRecord(
  s: RunState,
  runId: string,
  appVersion: string,
  now = new Date(),
): RunRecord {
  const families: Partial<Record<Family, number>> = {};
  for (const b of s.board) {
    const f = getUnit(b.unit).family;
    families[f] = (families[f] ?? 0) + 1;
  }
  return {
    run_id: runId,
    finished_at: now.toISOString(),
    result: s.status === 'won' ? 'won' : 'lost',
    wins: s.wins,
    losses: s.losses,
    rounds: s.history.length,
    families,
    app_version: appVersion,
  };
}

/** Статистика профиля по истории. */
export function profileStats(history: readonly RunRecord[]): ProfileStats {
  let best: RunRecord | null = null;
  const fam = new Map<Family, number>();
  let wins = 0;
  for (const r of history) {
    wins += r.wins;
    if (!best || r.wins > best.wins || (r.wins === best.wins && r.result === 'won')) best = r;
    for (const [f, n] of Object.entries(r.families) as [Family, number][])
      fam.set(f, (fam.get(f) ?? 0) + n);
  }
  let favorite: Family | null = null;
  for (const [f, n] of fam) if (!favorite || n > fam.get(favorite)!) favorite = f;
  return { runs: history.length, wins, best, favorite };
}

interface LocalHistory {
  /** Чья это история (id пользователя); null — до входа. */
  owner: string | null;
  runs: RunRecord[];
  /** run_id, ещё не отправленные на сервер. */
  pending: string[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // без хранилища — только в памяти
  }
}

const byTimeDesc = (a: RunRecord, b: RunRecord) => b.finished_at.localeCompare(a.finished_at);

/**
 * Профиль, история и синхронизация настроек.
 * Локально: кэш истории и профиля (работает и без сервера). На сервере: profiles, run_history.
 */
export class ProfileStore {
  private local: LocalHistory = readJson<LocalHistory>(LOCAL_KEY, {
    owner: null,
    runs: [],
    pending: [],
  });
  private profileValue: Profile = readJson<Profile>(PROFILE_KEY, { nickname: null, avatar: null });
  private listeners: (() => void)[] = [];
  private syncingSettings = false;

  constructor(
    private readonly account: Account,
    private readonly settings: SettingsStore,
  ) {
    account.onChange((s) => void this.onAccount(s));
    settings.onChange((s) => {
      if (!this.syncingSettings) void this.pushSettings(s);
    });
  }

  get profile(): Profile {
    return this.profileValue;
  }

  get history(): readonly RunRecord[] {
    return this.local.runs;
  }

  get stats(): ProfileStats {
    return profileStats(this.local.runs);
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  private emit(): void {
    writeJson(LOCAL_KEY, this.local);
    writeJson(PROFILE_KEY, this.profileValue);
    for (const cb of this.listeners) cb();
  }

  /** Сменился пользователь — подтянуть его профиль, историю и настройки. */
  private async onAccount(s: AccountState): Promise<void> {
    if (s.status !== 'ready' || !s.userId) return;
    if (this.local.owner && this.local.owner !== s.userId) {
      // Другой аккаунт: локальный кэш принадлежал прежнему — заменяем серверными данными.
      this.local = { owner: s.userId, runs: [], pending: [] };
      this.profileValue = { nickname: null, avatar: null };
    }
    this.local.owner = s.userId;
    await this.pull();
  }

  private get db() {
    const s = this.account.state;
    return s.status === 'ready' && s.userId ? this.account.client : null;
  }

  /** Загрузить профиль и историю с сервера; доотправить несинхронизированные забеги. */
  async pull(): Promise<void> {
    const db = this.db;
    if (!db) return;
    await this.flushPending();
    const [profile, runs] = await Promise.all([
      db.from('profiles').select('nickname, avatar, locale, settings').maybeSingle(),
      db
        .from('run_history')
        .select('run_id, finished_at, result, wins, losses, rounds, families, app_version')
        .order('finished_at', { ascending: false })
        .limit(HISTORY_LIMIT),
    ]);
    if (profile.data) {
      this.profileValue = { nickname: profile.data.nickname, avatar: profile.data.avatar };
      const server = profile.data.settings as Partial<Settings> | null;
      if (server && Object.keys(server).length > 0) {
        // На сервере уже есть настройки — они главнее (вход на новом устройстве).
        this.syncingSettings = true;
        this.settings.update(
          parseSettings(JSON.stringify({ ...server, locale: profile.data.locale })),
        );
        this.syncingSettings = false;
      } else {
        await this.pushSettings(this.settings.current);
      }
    }
    if (runs.data) {
      // Локальный кэш того же владельца + сервер: забег, записанный во время загрузки,
      // не потеряется (кэш другого владельца уже сброшен в onAccount).
      const merged = new Map<string, RunRecord>();
      for (const r of [...(runs.data as RunRecord[]), ...this.local.runs]) merged.set(r.run_id, r);
      this.local.runs = [...merged.values()].sort(byTimeDesc).slice(0, HISTORY_LIMIT);
    }
    this.emit();
  }

  private async flushPending(): Promise<void> {
    const db = this.db;
    if (!db || this.local.pending.length === 0) return;
    const rows = this.local.runs.filter((r) => this.local.pending.includes(r.run_id));
    const { error } = await db
      .from('run_history')
      .upsert(rows, { onConflict: 'user_id,run_id', ignoreDuplicates: true });
    if (!error) this.local.pending = [];
  }

  /** Записать законченный забег: сразу локально, на сервер — когда получится. */
  async recordRun(rec: RunRecord): Promise<void> {
    this.local.runs = [rec, ...this.local.runs.filter((r) => r.run_id !== rec.run_id)]
      .sort(byTimeDesc)
      .slice(0, HISTORY_LIMIT);
    this.local.pending = [...new Set([...this.local.pending, rec.run_id])];
    this.emit();
    await this.flushPending();
    writeJson(LOCAL_KEY, this.local);
  }

  /** Сохранить ник и/или аватар. */
  async saveProfile(patch: Partial<Profile>): Promise<boolean> {
    this.profileValue = { ...this.profileValue, ...patch };
    this.emit();
    const db = this.db;
    if (!db) return true;
    const { error } = await db
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', this.account.state.userId!);
    return !error;
  }

  private async pushSettings(s: Settings): Promise<void> {
    const db = this.db;
    if (!db) return;
    const { locale, ...rest } = s;
    await db
      .from('profiles')
      .update({ settings: rest, locale, updated_at: new Date().toISOString() })
      .eq('id', this.account.state.userId!);
  }
}
