import { DEFAULT_RULES, attackZone, moveTargets } from '@chess-battler/sim';
import type { UnitDef, Vec } from '@chess-battler/sim';

export type PreviewCell = 'self' | 'move' | 'attack' | 'both' | 'empty';

/**
 * Схема хода и атаки фигуры на пустом поле size×size (фигура в центре, вперёд — вверх).
 * Считается теми же функциями sim, что и подсветка на доске. Строки — сверху вниз.
 */
export function patternPreview(def: UnitDef, size = 5): PreviewCell[][] {
  const rules = { ...DEFAULT_RULES, width: size, height: size };
  const c: Vec = { x: (size - 1) / 2, y: (size - 1) / 2 };
  const empty = () => false;
  const key = (p: Vec) => `${p.x},${p.y}`;
  const move = new Set(moveTargets(def.move, c, 'A', rules, empty).map(key));
  const attack = new Set(attackZone(def.attack, c, 'A', rules, empty).map(key));
  const rows: PreviewCell[][] = [];
  for (let y = size - 1; y >= 0; y--) {
    const row: PreviewCell[] = [];
    for (let x = 0; x < size; x++) {
      const k = key({ x, y });
      if (x === c.x && y === c.y) row.push('self');
      else if (move.has(k) && attack.has(k)) row.push('both');
      else if (move.has(k)) row.push('move');
      else if (attack.has(k)) row.push('attack');
      else row.push('empty');
    }
    rows.push(row);
  }
  return rows;
}
