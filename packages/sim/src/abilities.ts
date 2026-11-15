import type {
  Ability,
  Family,
  Rules,
  Side,
  Stars,
  SynergyDef,
  SynergyEffect,
  SynergyTier,
  UnitDef,
} from './types';

/** n × tenths / 10 с округлением до ближайшего целого, половина вверх. Только целые. */
export const scaleTenths = (n: number, tenths: number): number =>
  Math.floor((2 * n * tenths + 10) / 20);

function scaleAbility(a: Ability, tenths: number): Ability {
  switch (a.kind) {
    case 'auraArmor':
    case 'auraAtk':
    case 'heal':
    case 'shieldStrongest':
      return { ...a, amount: scaleTenths(a.amount, tenths) };
    case 'rally':
      return { ...a, atk: scaleTenths(a.atk, tenths) };
    default:
      return a;
  }
}

/** Описание фигуры с учётом звёзд: HP, ATK и числа способностей. Толчок и инициатива — как есть. */
export function starScaledDef(def: UnitDef, stars: Stars, rules: Rules): UnitDef {
  if (stars === 1) return def;
  const i = stars - 1;
  return {
    ...def,
    hp: scaleTenths(def.hp, rules.stars.hp[i]!),
    atk: scaleTenths(def.atk, rules.stars.atk[i]!),
    abilities: def.abilities?.map((a) => scaleAbility(a, rules.stars.ability[i]!)),
  };
}

export function findAbility<K extends Ability['kind']>(
  def: UnitDef,
  kind: K,
): Extract<Ability, { kind: K }> | undefined {
  return def.abilities?.find((a): a is Extract<Ability, { kind: K }> => a.kind === kind);
}

export interface ActiveSynergy {
  readonly family: Family;
  /** Сколько фигур семьи на поле. */
  readonly count: number;
  /** Активные ступени (бонусы суммируются). */
  readonly tiers: readonly SynergyTier[];
}

/**
 * Активные синергии стороны: считаются фигуры на поле, каждая копия отдельно.
 * Возвращает все семьи, у которых есть хотя бы одна фигура (для интерфейса).
 */
export function activeSynergies(
  units: readonly { readonly def: UnitDef; readonly side: Side }[],
  side: Side,
  synergies: readonly SynergyDef[],
): ActiveSynergy[] {
  const out: ActiveSynergy[] = [];
  for (const syn of synergies) {
    const count = units.filter((u) => u.side === side && u.def.family === syn.family).length;
    if (count === 0) continue;
    out.push({ family: syn.family, count, tiers: syn.tiers.filter((t) => count >= t.count) });
  }
  return out;
}

/** Таблица «семья → эффекты активных ступеней» для быстрого поиска в бою. */
export type SynergyTable = ReadonlyMap<Family, readonly SynergyEffect[]>;

export function synergyTable(active: readonly ActiveSynergy[]): SynergyTable {
  return new Map(active.map((a) => [a.family, a.tiers.map((t) => t.effect)]));
}
