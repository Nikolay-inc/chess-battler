import { describe, expect, it } from 'vitest';
import { createRng } from '../src';

describe('seed-RNG', () => {
  it('один seed — одна последовательность', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => a.nextUint32());
    const seqB = Array.from({ length: 10 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(10);
  });

  it('разные seed — разные последовательности', () => {
    expect(createRng(1).nextUint32()).not.toBe(createRng(2).nextUint32());
  });

  it('int возвращает значения в границах и покрывает диапазон', () => {
    const r = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('состояние можно сохранить и восстановить', () => {
    const r = createRng(123);
    r.nextUint32();
    const resumed = createRng(r.state);
    expect(resumed.nextUint32()).toBe(r.nextUint32());
  });
});
