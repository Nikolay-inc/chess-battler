import { LOCALES, t } from '../i18n';
import type { Locale } from '../i18n';
import type { Settings, SettingsStore, Speed } from '../settings';
import { $, el } from '../ui';

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
export interface SettingsContext {
  readonly version: string;
  /** Подпись аккаунта: ник/email или «Гость». */
  readonly accountLabel: string;
  openProfile(): void;
}

export function renderSettings(store: SettingsStore, ctx: SettingsContext): void {
  const s: Settings = store.current;
  const root = $('settings');
  root.replaceChildren();
  const redraw = (patch: Partial<Settings>) => {
    store.update(patch);
    renderSettings(store, ctx);
  };

  // Язык: «Авто» + названия языков на них самих (их не переводим).
  const lang = el('select', 'select') as HTMLSelectElement;
  lang.setAttribute('aria-label', t('settings.language'));
  const options: { value: Locale | ''; label: string }[] = [
    { value: '', label: t('languages.auto') },
    ...LOCALES.map((l) => ({ value: l, label: t(`languages.${l}`) })),
  ];
  for (const o of options) {
    const opt = el('option', '', o.label) as HTMLOptionElement;
    opt.value = o.value;
    opt.selected = (s.locale ?? '') === o.value;
    lang.append(opt);
  }
  // Смена языка перерисовывает всё через onLocaleChange (в т.ч. этот экран).
  lang.addEventListener('change', () =>
    store.update({ locale: (lang.value || null) as Locale | null }),
  );

  const speed = el('div', 'segmented');
  speed.setAttribute('role', 'radiogroup');
  speed.setAttribute('aria-label', t('settings.speedAria'));
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
    el('h2', 'section-title', t('settings.game')),
    row(t('settings.language'), lang),
    row(t('settings.speed'), speed, t('settings.speedHint')),
    row(
      t('settings.sound'),
      toggle(t('settings.sound'), s.sound, (v) => redraw({ sound: v })),
    ),
    row(
      t('settings.music'),
      toggle(t('settings.music'), s.music, (v) => redraw({ music: v })),
      t('settings.musicHint'),
    ),
    row(
      t('settings.vibration'),
      toggle(t('settings.vibration'), s.vibration, (v) => redraw({ vibration: v })),
    ),
  );

  const account = el('section', 'page-section');
  const link = el('button', 'secondary', t('settings.link'));
  link.type = 'button';
  link.addEventListener('click', () => ctx.openProfile());
  account.append(
    el('h2', 'section-title', t('settings.account')),
    row(ctx.accountLabel, link, t('settings.linkHint')),
  );

  root.append(
    game,
    account,
    el('p', 'hint center', t('settings.version', { version: ctx.version })),
  );
}
