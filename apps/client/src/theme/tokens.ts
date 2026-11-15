/**
 * Дизайн-токены — единственный источник визуального стиля.
 * Из них при старте генерируются CSS-переменные (applyTokens), их же читает Pixi (px()).
 * Новая тема = замена значений в этом файле.
 *
 * CSS: var(--color-accent), полупрозрачность — rgb(var(--color-accent-rgb) / 0.2),
 * размеры — var(--space-md), var(--radius-lg), var(--font-size-sm) и т.д.
 */
export const tokens = {
  color: {
    // Поверхности и текст
    bg: '#14161c',
    surface: '#1d2029',
    surfaceRaised: '#262a35',
    surfaceHover: '#2f3a4f',
    text: '#e8e9ee',
    textMuted: '#8a8f9e',
    textOnAccent: '#1b1b1b',
    border: '#ffffff',
    shadow: '#000000',
    // Смысловые
    accent: '#f2c14e',
    danger: '#ff5b5b',
    success: '#5ad17a',
    info: '#7fd8ff',
    infoText: '#bfe9ff',
    // Стороны боя
    sideA: '#4da3ff',
    sideB: '#ff6b5b',
    // Семьи (глифы в магазине и коллекции)
    legion: '#c9b28a',
    riders: '#8ac9a0',
    mystics: '#b59cf0',
    guards: '#8ab4e6',
    // Доска
    boardOwnLight: '#2a3242',
    boardOwnDark: '#232a38',
    boardEnemyLight: '#3a2c30',
    boardEnemyDark: '#312529',
    unitBody: '#1d2029',
    unitLabel: '#c8cad3',
    schemaSelf: '#3a4560',
    starOff: '#3a3f4d',
    // Эффекты боя
    fxDamage: '#ff4d4d',
    fxCollision: '#ffa53a',
    fxSpark: '#fff1a8',
    fxTelegraph: '#ff3b3b',
    fxStun: '#d7b8ff',
    fxCurse: '#c07bff',
    fxStorm: '#b57bff',
    fxThorns: '#ff8a65',
  },
  space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { xs: 3, sm: 6, md: 10, lg: 12, xl: 16, pill: 999 },
  font: {
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    glyph: 'serif',
  },
  fontSize: {
    xxs: 10,
    xs: 11,
    s: 12,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    h3: 24,
    h2: 26,
    h1: 30,
  },
  size: { touch: 44, tabbar: 58, maxWidth: 480 },
  shadow: {
    card: '0 12px 40px rgb(0 0 0 / 0.5)',
    pop: '0 8px 24px rgb(0 0 0 / 0.45)',
  },
  duration: { fast: 150, normal: 250 },
} as const;

export type ColorToken = keyof typeof tokens.color;

/** Цвет токена для Pixi (0xRRGGBB). */
export const px = (name: ColorToken): number => parseInt(tokens.color[name].slice(1), 16);

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const rgbChannels = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** CSS-переменные из токенов: имя → значение. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens.color)) {
    vars[`--color-${kebab(k)}`] = v;
    vars[`--color-${kebab(k)}-rgb`] = rgbChannels(v);
  }
  for (const [k, v] of Object.entries(tokens.space)) vars[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.fontSize)) vars[`--font-size-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.size)) vars[`--size-${kebab(k)}`] = `${v}px`;
  for (const [k, v] of Object.entries(tokens.shadow)) vars[`--shadow-${k}`] = v;
  for (const [k, v] of Object.entries(tokens.duration)) vars[`--duration-${k}`] = `${v}ms`;
  vars['--font-family'] = tokens.font.family;
  vars['--font-glyph'] = tokens.font.glyph;
  return vars;
}

/** Записать токены в CSS-переменные корня документа (до первой отрисовки). */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(cssVariables())) root.style.setProperty(k, v);
}
