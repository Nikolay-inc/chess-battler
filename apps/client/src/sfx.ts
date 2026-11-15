import type { SettingsStore } from './settings';

export type Sound = 'hit' | 'collision' | 'death' | 'storm' | 'buy' | 'win' | 'loss' | 'tap';

interface Tone {
  readonly freq: number;
  /** Конечная частота (скольжение). */
  readonly to?: number;
  readonly ms: number;
  readonly type: OscillatorType;
  readonly gain: number;
  /** Задержка от начала звука. */
  readonly at?: number;
}

/** Звуки — короткие синтезированные тона (WebAudio), без файлов-ассетов. */
const SOUNDS: Record<Sound, readonly Tone[]> = {
  hit: [{ freq: 520, to: 260, ms: 70, type: 'square', gain: 0.05 }],
  collision: [{ freq: 140, to: 60, ms: 120, type: 'triangle', gain: 0.12 }],
  death: [{ freq: 300, to: 80, ms: 220, type: 'sawtooth', gain: 0.05 }],
  storm: [{ freq: 90, to: 400, ms: 380, type: 'sawtooth', gain: 0.04 }],
  buy: [
    { freq: 660, ms: 60, type: 'sine', gain: 0.08 },
    { freq: 990, ms: 80, type: 'sine', gain: 0.08, at: 60 },
  ],
  win: [
    { freq: 523, ms: 120, type: 'triangle', gain: 0.1 },
    { freq: 659, ms: 120, type: 'triangle', gain: 0.1, at: 120 },
    { freq: 784, ms: 220, type: 'triangle', gain: 0.1, at: 240 },
  ],
  loss: [
    { freq: 392, ms: 160, type: 'triangle', gain: 0.1 },
    { freq: 311, ms: 260, type: 'triangle', gain: 0.1, at: 160 },
  ],
  tap: [{ freq: 880, ms: 30, type: 'sine', gain: 0.04 }],
};

/** Вибрация для событий (мс; Android, в Telegram — HapticFeedback в подэтапе E). */
const VIBRATION: Partial<Record<Sound, number | number[]>> = {
  collision: 25,
  death: [30, 40, 30],
  win: [40, 60, 40],
  loss: 120,
};

/**
 * Звук и вибрация с учётом настроек. AudioContext создаётся по первому жесту
 * пользователя (требование браузеров). Музыки пока нет — переключатель только хранится.
 */
/** Вибрация платформы (Telegram HapticFeedback); null — navigator.vibrate. */
export type Haptic = (sound: Sound) => void;

export class Sfx {
  private ctx: AudioContext | null = null;
  /** Задаётся в Telegram: HapticFeedback вместо navigator.vibrate (на iOS иначе вибрации нет). */
  haptic: Haptic | null = null;

  constructor(private readonly settings: SettingsStore) {
    const unlock = () => {
      if (!this.ctx && typeof AudioContext !== 'undefined') this.ctx = new AudioContext();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
  }

  play(sound: Sound): void {
    const s = this.settings.current;
    if (s.vibration && VIBRATION[sound]) {
      if (this.haptic) this.haptic(sound);
      else if (typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATION[sound]!);
    }
    const ctx = this.ctx;
    if (!s.sound || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    for (const tone of SOUNDS[sound]) {
      const start = t0 + (tone.at ?? 0) / 1000;
      const end = start + tone.ms / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      gain.gain.setValueAtTime(tone.gain, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}
