import type { Locale } from './i18n';
import { LOCALES } from './i18n';

export type { Locale };
export type Speed = 1 | 2 | 4;

export interface Settings {
  /** null — определить автоматически (подэтап B). */
  readonly locale: Locale | null;
  readonly sound: boolean;
  readonly music: boolean;
  /** Скорость боя по умолчанию. */
  readonly speed: Speed;
  readonly vibration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: null,
  sound: true,
  music: true,
  speed: 1,
  vibration: true,
};

export const SETTINGS_KEY = 'chess-battler.settings.v1';
const SPEEDS: readonly Speed[] = [1, 2, 4];

/** Разбор сохранённых настроек: неизвестные и битые поля → значения по умолчанию. */
export function parseSettings(json: string | null): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    raw = json ? (JSON.parse(json) as typeof raw) : {};
  } catch {
    raw = {};
  }
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    locale: (LOCALES as readonly string[]).includes(raw.locale as string)
      ? (raw.locale as Locale)
      : null,
    sound: bool(raw.sound, DEFAULT_SETTINGS.sound),
    music: bool(raw.music, DEFAULT_SETTINGS.music),
    speed: SPEEDS.includes(raw.speed as Speed) ? (raw.speed as Speed) : DEFAULT_SETTINGS.speed,
    vibration: bool(raw.vibration, DEFAULT_SETTINGS.vibration),
  };
}

/** Настройки игрока: localStorage сейчас, профиль Supabase — в подэтапе C. */
export class SettingsStore {
  private value: Settings;
  private listeners: ((s: Settings) => void)[] = [];

  constructor() {
    let json: string | null = null;
    try {
      json = localStorage.getItem(SETTINGS_KEY);
    } catch {
      // хранилище недоступно — работаем на значениях по умолчанию
    }
    this.value = parseSettings(json);
  }

  get current(): Settings {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.value));
    } catch {
      // без хранилища настройки живут до перезагрузки
    }
    for (const cb of this.listeners) cb(this.value);
  }

  onChange(cb: (s: Settings) => void): void {
    this.listeners.push(cb);
  }
}
