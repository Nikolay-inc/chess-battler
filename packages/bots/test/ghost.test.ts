import { describe, expect, it } from 'vitest';
import { RUN_CONFIG, SYNERGIES } from '@chess-battler/content';
import { DEFAULT_RULES, boardCap, createSetup, simulate } from '@chess-battler/sim';
import { generateGhost } from '../src';

describe('армия-призрак', () => {
  it('детерминирована по раунду, сложности и seed', () => {
    const a = generateGhost({ round: 5, difficulty: 0.5, seed: 123 });
    const b = generateGhost({ round: 5, difficulty: 0.5, seed: 123 });
    expect(a).toEqual(b);
    expect(generateGhost({ round: 5, difficulty: 0.5, seed: 124 }).army).not.toEqual(a.army);
  });

  it('заполняет поле до лимита раунда и стоит на своих рядах', () => {
    for (const round of [3, 6, 10]) {
      const g = generateGhost({ round, difficulty: 0.8, seed: round * 7 });
      expect(g.army.length).toBe(boardCap(round, RUN_CONFIG));
      for (const s of g.army) {
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThan(3);
      }
      const cells = new Set(g.army.map((s) => `${s.x},${s.y}`));
      expect(cells.size).toBe(g.army.length);
    }
  });

  it('в раундах 1–2 призрак слабее: на 1 фигуру меньше и без ★2', () => {
    for (const round of [1, 2]) {
      for (let seed = 0; seed < 40; seed++) {
        const g = generateGhost({ round, difficulty: 1, seed });
        expect(g.army.length).toBe(boardCap(round, RUN_CONFIG) - 1);
        expect(g.army.every((s) => (s.stars ?? 1) === 1)).toBe(true);
      }
    }
    // Без ослабления в раунде 2 сильный бот иногда собирает ★2.
    const strong = Array.from({ length: 40 }, (_, seed) =>
      generateGhost({ round: 2, difficulty: 1, seed, weakRounds: 0 }),
    );
    expect(strong.every((g) => g.army.length === boardCap(2, RUN_CONFIG))).toBe(true);
    expect(strong.some((g) => g.army.some((s) => (s.stars ?? 1) > 1))).toBe(true);
  });

  it('стили различаются между seed', () => {
    const styles = new Set(
      Array.from(
        { length: 20 },
        (_, i) => generateGhost({ round: 1, difficulty: 0.5, seed: i }).style,
      ),
    );
    expect(styles.size).toBeGreaterThan(1);
  });

  it('к поздним раундам появляются звёзды', () => {
    const stars = Array.from({ length: 10 }, (_, i) =>
      generateGhost({ round: 10, difficulty: 1, seed: 1000 + i }).army.some(
        (s) => (s.stars ?? 1) > 1,
      ),
    );
    expect(stars.some(Boolean)).toBe(true);
  });

  it('армии двух ботов дают законченный бой', () => {
    const a = generateGhost({ round: 6, difficulty: 0.7, seed: 1 }).army;
    const b = generateGhost({ round: 6, difficulty: 0.7, seed: 2 }).army;
    const r = simulate(createSetup(a, b, DEFAULT_RULES, SYNERGIES));
    expect(r.events.at(-1)?.type).toBe('end');
  });
});
