import type { SynergyEffect, UnitDef } from '@chess-battler/sim';
import bg from '../locales/bg.json';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import uk from '../locales/uk.json';

/**
 * Тексты контента (названия и описания фигур, синергий, семей) на всех языках.
 * Числа в описаниях — подстановки {имя}: их значения дают unitTextParams/synergyTextParams
 * (с учётом звёзд, если передан starScaledDef). Форматирует клиентский i18n.
 */
export const CONTENT_TEXTS = { ru, uk, bg, en } as const;
export type ContentLocale = keyof typeof CONTENT_TEXTS;
export type ContentTexts = typeof ru;

type Params = Record<string, number>;

const numericFields = (o: object): Params =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number')) as Params;

/** Подстановки для описания фигуры: числа её способностей + устойчивость и броня. */
export function unitTextParams(def: UnitDef): Params {
  const params: Params = {};
  for (const a of def.abilities ?? []) Object.assign(params, numericFields(a));
  if (def.pushResist) params.pushResist = def.pushResist;
  if (def.armor) params.armor = def.armor;
  return params;
}

/** Подстановки для описания ступени синергии: числа её эффекта. */
export const synergyTextParams = (effect: SynergyEffect): Params => numericFields(effect);
