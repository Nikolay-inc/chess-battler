/**
 * Детерминированный ГПСЧ (mulberry32) для магазина и ботов.
 * В самом бою не используется — бой детерминирован без случайности.
 */
export interface Rng {
  /** Целое в [0, 2^32). */
  nextUint32(): number;
  /** Целое в [min, max] включительно. */
  int(min: number, max: number): number;
  /** Текущее состояние — можно сохранить и восстановить через createRng(state). */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const nextUint32 = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextUint32,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new RangeError(`Bad range [${min}, ${max}]`);
      }
      // Без модульного смещения: отбрасываем хвост диапазона.
      const span = max - min + 1;
      const limit = Math.floor(0x100000000 / span) * span;
      let r = nextUint32();
      while (r >= limit) r = nextUint32();
      return min + (r % span);
    },
    get state() {
      return s;
    },
  };
}
