import type { ArmySlot } from '@chess-battler/sim';
import { getUnit } from './units';

/** Армия в сериализуемом виде (id фигур + локальные координаты) — так её хранит сервер. */
export interface ArmyData {
  readonly id: string;
  readonly slots: readonly { readonly unit: string; readonly x: number; readonly y: number }[];
}

export const resolveArmy = (army: ArmyData): ArmySlot[] =>
  army.slots.map((s) => ({ def: getUnit(s.unit), x: s.x, y: s.y }));

/** Локальные координаты: y=0 — задний ряд, y=2 — передний. */
export const DEMO_ARMY_A: ArmyData = {
  id: 'iron_line',
  slots: [
    { unit: 'warden', x: 0, y: 0 },
    { unit: 'adept', x: 2, y: 0 },
    { unit: 'ram', x: 4, y: 0 },
    { unit: 'rider', x: 1, y: 1 },
    { unit: 'lancer', x: 3, y: 1 },
    { unit: 'shieldbearer', x: 1, y: 2 },
    { unit: 'legionnaire', x: 2, y: 2 },
    { unit: 'shieldbearer', x: 3, y: 2 },
  ],
};

export const DEMO_ARMY_B: ArmyData = {
  id: 'eastern_storm',
  slots: [
    { unit: 'stormcaller', x: 1, y: 0 },
    { unit: 'adept', x: 3, y: 0 },
    { unit: 'ram', x: 2, y: 1 },
    { unit: 'rider', x: 0, y: 1 },
    { unit: 'lancer', x: 4, y: 1 },
    { unit: 'legionnaire', x: 0, y: 2 },
    { unit: 'legionnaire', x: 2, y: 2 },
    { unit: 'legionnaire', x: 4, y: 2 },
  ],
};
