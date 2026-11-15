import { CONTENT_TEXTS, synergyTextParams, unitTextParams } from '@chess-battler/content';
import type { Family, SynergyEffect, UnitDef } from '@chess-battler/sim';
import bg from './bg.json';
import en from './en.json';
import ru from './ru.json';
import uk from './uk.json';

export const LOCALES = ['ru', 'uk', 'bg', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Значение словаря: строка или формы множественного числа (выбор по Intl.PluralRules). */
type Plural = {
  readonly one?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};
type Tree = { readonly [k: string]: string | Plural | Tree };

/** Все ключи словаря интерфейса («home.play», «count.ticks») — опечатка в ключе не скомпилируется. */
type Keys<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { other: string }
      ? `${P}${K}`
      : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type UiKey = Keys<typeof ru>;
export type Params = Readonly<Record<string, string | number>>;

const UI: Record<Locale, Tree> = { ru, uk, bg, en };

let current: Locale = 'ru';
const listeners: (() => void)[] = [];

export const locale = (): Locale => current;

function lookup(tree: Tree, key: string): string | Plural | undefined {
  let node: string | Plural | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = (node as Tree)[part];
  }
  return node as string | Plural | undefined;
}

function format(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

function render(
  value: string | Plural | undefined,
  loc: Locale,
  params: Params,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return format(value, params);
  const n = Number(params.n ?? 0);
  const cat = new Intl.PluralRules(loc).select(n) as keyof Plural;
  return format(value[cat] ?? value.other, params);
}

/** Строка интерфейса. Нет перевода → русский → сам ключ (видно в интерфейсе, ловят тесты). */
export function t(key: UiKey, params: Params = {}): string {
  return (
    render(lookup(UI[current], key), current, params) ??
    render(lookup(UI.ru, key), 'ru', params) ??
    key
  );
}

// ---------- Тексты контента (packages/content/locales) ----------

const content = () => CONTENT_TEXTS[current];
type UnitId = keyof (typeof CONTENT_TEXTS)['ru']['unit'];

export const familyName = (f: Family): string => content().family[f];

export function unitName(id: string): string {
  return content().unit[id as UnitId]?.name ?? id;
}

/** Описание способности с подстановкой чисел (передайте starScaledDef — числа будут со звёздами). */
export function unitDesc(def: UnitDef): string {
  const tpl = content().unit[def.id as UnitId]?.desc ?? '';
  return format(tpl, unitTextParams(def));
}

export function cosmeticName(id: string): string {
  return (content().cosmetic.item as Record<string, string>)[id] ?? id;
}

export const cosmeticKindName = (kind: 'board' | 'frame' | 'pushFx'): string =>
  content().cosmetic.kind[kind];

export function synergyName(f: Family, count: number): string {
  const fam = content().synergy[f] as Record<string, { name: string; desc: string }>;
  return fam[String(count)]?.name ?? `${f}:${count}`;
}

export function synergyDesc(f: Family, count: number, effect: SynergyEffect): string {
  const fam = content().synergy[f] as Record<string, { name: string; desc: string }>;
  return format(fam[String(count)]?.desc ?? '', synergyTextParams(effect));
}

// ---------- Язык ----------

/**
 * Язык по умолчанию: Telegram language_code → языки браузера → английский.
 * «uk-UA» → uk, «bg» → bg, «ru-RU» → ru; остальные — en.
 */
export function detectLocale(browser: readonly string[], telegram?: string): Locale {
  for (const tag of [telegram, ...browser]) {
    if (!tag) continue;
    const base = tag.toLowerCase().split(/[-_]/)[0]!;
    if ((LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return 'en';
}

/** Перевести статичную разметку: data-i18n, data-i18n-aria, data-i18n-placeholder. */
export function applyStatic(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as UiKey);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as UiKey));
    if (el.title) el.title = t(el.dataset.i18nAria as UiKey);
  }
}

export function setLocale(next: Locale): void {
  current = next;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    applyStatic();
  }
  for (const cb of listeners) cb();
}

export function onLocaleChange(cb: () => void): void {
  listeners.push(cb);
}
