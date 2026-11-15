import { inBounds, rowsPerSide, toBoard } from './geometry';
import { DEFAULT_RULES } from './types';
import type { BattleSetup, Rules, Side, Stars, SynergyDef, UnitDef, UnitPlacement } from './types';

/** Фигура армии в локальных координатах стороны (y=0 — задний ряд). */
export interface ArmySlot {
  readonly def: UnitDef;
  readonly x: number;
  readonly y: number;
  /** По умолчанию ★1. */
  readonly stars?: Stars;
}

/** Ставит армию на свою половину доски. Бросает ошибку, если слот вне своих рядов. */
export function placeArmy(
  side: Side,
  army: readonly ArmySlot[],
  rules: Rules = DEFAULT_RULES,
): UnitPlacement[] {
  const rows = rowsPerSide(rules);
  return army.map((slot) => {
    if (
      !Number.isInteger(slot.x) ||
      !Number.isInteger(slot.y) ||
      slot.x < 0 ||
      slot.x >= rules.width ||
      slot.y < 0 ||
      slot.y >= rows
    ) {
      throw new Error(
        `${side}: слот (${slot.x}, ${slot.y}) для ${slot.def.id} вне своей половины поля`,
      );
    }
    const pos = toBoard(side, { x: slot.x, y: slot.y }, rules);
    return slot.stars
      ? { def: slot.def, side, pos, stars: slot.stars }
      : { def: slot.def, side, pos };
  });
}

/** Удобный конструктор боя из двух армий. */
export function createSetup(
  armyA: readonly ArmySlot[],
  armyB: readonly ArmySlot[],
  rules: Rules = DEFAULT_RULES,
  synergies: readonly SynergyDef[] = [],
): BattleSetup {
  return {
    units: [...placeArmy('A', armyA, rules), ...placeArmy('B', armyB, rules)],
    synergies,
  };
}

/** Проверка входа симуляции: клетки на доске и не пересекаются, статы корректны. */
export function validateSetup(setup: BattleSetup, rules: Rules): void {
  const taken = new Set<number>();
  for (const u of setup.units) {
    const { def, pos } = u;
    if (!Number.isInteger(pos.x) || !Number.isInteger(pos.y) || !inBounds(pos, rules)) {
      throw new Error(`${def.id}: клетка (${pos.x}, ${pos.y}) вне поля`);
    }
    const key = pos.y * rules.width + pos.x;
    if (taken.has(key)) throw new Error(`Две фигуры на клетке (${pos.x}, ${pos.y})`);
    taken.add(key);
    for (const stat of ['hp', 'atk', 'initiative', 'push', 'armor', 'pushResist'] as const) {
      const v = def[stat] ?? 0;
      if (!Number.isInteger(v) || v < 0) {
        throw new Error(`${def.id}: ${stat} должен быть целым ≥ 0`);
      }
    }
    if (def.hp <= 0) throw new Error(`${def.id}: hp должен быть > 0`);
    if (u.stars !== undefined && ![1, 2, 3].includes(u.stars)) {
      throw new Error(`${def.id}: звёзды должны быть 1, 2 или 3`);
    }
  }
}
