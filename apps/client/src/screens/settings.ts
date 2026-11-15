import type { Settings, SettingsStore, Speed } from '../settings';
import { $, el } from '../ui';

const LANGS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Авто (язык устройства)' },
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'bg', label: 'Български' },
  { value: 'en', label: 'English' },
];

function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const r = el('div', 'setting-row');
  const text = el('div', 'setting-text');
  text.append(el('span', 'setting-label', label));
  if (hint) text.append(el('span', 'hint', hint));
  r.append(text, control);
  return r;
}

function toggle(label: string, on: boolean, change: (v: boolean) => void): HTMLElement {
  const b = el('button', 'switch');
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => change(b.getAttribute('aria-checked') !== 'true'));
  return b;
}

/** Настройки: язык, звук, музыка, скорость боя по умолчанию, вибрация, аккаунт. */
export function renderSettings(store: SettingsStore, version: string): void {
  const s: Settings = store.current;
  const root = $('settings');
  root.replaceChildren();
  const redraw = (patch: Partial<Settings>) => {
    store.update(patch);
    renderSettings(store, version);
  };

  const lang = el('select', 'select') as HTMLSelectElement;
  lang.setAttribute('aria-label', 'Язык');
  for (const l of LANGS) {
    const o = el('option', '', l.label) as HTMLOptionElement;
    o.value = l.value;
    o.selected = (s.locale ?? '') === l.value;
    lang.append(o);
  }
  lang.disabled = true; // переводы — подэтап B

  const speed = el('div', 'segmented');
  speed.setAttribute('role', 'radiogroup');
  speed.setAttribute('aria-label', 'Скорость боя по умолчанию');
  for (const v of [1, 2, 4] as const satisfies readonly Speed[]) {
    const b = el('button', '', `×${v}`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(s.speed === v));
    b.addEventListener('click', () => redraw({ speed: v }));
    speed.append(b);
  }

  const game = el('section', 'page-section');
  game.append(
    el('h2', 'section-title', 'Игра'),
    row('Язык', lang, 'Переводы появятся в следующем обновлении'),
    row('Скорость боя', speed, 'С какой скоростью начинается каждый бой'),
    row(
      'Звук',
      toggle('Звук', s.sound, (v) => redraw({ sound: v })),
    ),
    row(
      'Музыка',
      toggle('Музыка', s.music, (v) => redraw({ music: v })),
    ),
    row(
      'Вибрация',
      toggle('Вибрация', s.vibration, (v) => redraw({ vibration: v })),
    ),
  );

  const account = el('section', 'page-section');
  const link = el('button', 'secondary', 'Привязать');
  link.type = 'button';
  link.disabled = true;
  account.append(
    el('h2', 'section-title', 'Аккаунт'),
    row('Гость', link, 'Вход по email и Google — скоро'),
  );

  root.append(game, account, el('p', 'hint center', `Версия ${version}`));
}
