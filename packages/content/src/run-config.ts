import type { RunConfig } from '@chess-battler/sim';
import { UNIT_LIST } from './units';

// Раздел 5 документа. Пул общий и бесконечный.
export const RUN_CONFIG: RunConfig = {
  lives: 3,
  winsToFinish: 10,
  goldPerRound: 10,
  rerollCost: 1,
  sellPerCopy: 1,
  shopSlots: 5,
  benchSlots: 4,
  boardCaps: [3, 4, 5, 5, 6, 6, 7, 8],
  tierOdds: [
    { fromRound: 1, weights: [100, 0, 0] },
    { fromRound: 3, weights: [75, 25, 0] },
    { fromRound: 5, weights: [55, 35, 10] },
    { fromRound: 7, weights: [40, 40, 20] },
  ],
  catalog: UNIT_LIST,
};
