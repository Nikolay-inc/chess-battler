import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '@chess-battler/content';
import { applyAction, createRun } from '@chess-battler/sim';
import { tutorialStep } from './tutorial';

describe('шаг обучения', () => {
  it('купить → поставить → в бой', () => {
    let s = createRun(1, RUN_CONFIG);
    expect(tutorialStep(s)).toBe('buy');
    s = applyAction(s, { type: 'buy', slot: 0 }, RUN_CONFIG);
    expect(tutorialStep(s)).toBe('place');
    s = applyAction(
      s,
      { type: 'move', from: { area: 'bench', index: 0 }, to: { area: 'board', x: 2, y: 2 } },
      RUN_CONFIG,
    );
    expect(tutorialStep(s)).toBe('fight');
  });
});
