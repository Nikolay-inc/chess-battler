import type { Ticker } from 'pixi.js';

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/** Простой твин на тикере Pixi. speed() читается каждый кадр — скорость можно менять на лету. */
export class Tweener {
  constructor(
    private readonly ticker: Ticker,
    private readonly speed: () => number,
  ) {}

  run(ms: number, update: (t: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const step = (ticker: Ticker) => {
        elapsed += ticker.deltaMS * this.speed();
        const t = Math.min(1, elapsed / ms);
        update(t);
        if (t >= 1) {
          this.ticker.remove(step);
          resolve();
        }
      };
      this.ticker.add(step);
    });
  }

  wait(ms: number): Promise<void> {
    return this.run(ms, () => {});
  }
}
