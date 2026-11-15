/**
 * Баланс: N боёв «бот против бота» (по умолчанию 10 000).
 *   pnpm balance                # 10 000 боёв
 *   pnpm balance --battles 2000 --seed 7
 *   pnpm balance --json report.json
 * Цели — раздел 6 документа «Фигуры, синергии и экономика забега».
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { CONTENT_TEXTS, RUN_CONFIG, SYNERGIES, UNIT_LIST } from '@chess-battler/content';
import {
  DEFAULT_RULES,
  activeSynergies,
  createRng,
  createSetup,
  simulate,
} from '@chess-battler/sim';
import type { ArmySlot, Family, Side } from '@chess-battler/sim';
import { generateGhost } from '../src';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BATTLES = Number(arg('battles') ?? 10_000);
const SEED = Number(arg('seed') ?? 1);
const JSON_OUT = arg('json');
const MAX_ROUND = 10;

interface Tally {
  games: number;
  wins: number;
  draws: number;
}
const tally = (): Tally => ({ games: 0, wins: 0, draws: 0 });
const add = (t: Tally, outcome: 'win' | 'loss' | 'draw') => {
  t.games++;
  if (outcome === 'win') t.wins++;
  if (outcome === 'draw') t.draws++;
};
/** Винрейт, ничья = половина победы. */
const rate = (t: Tally) => (t.games ? (t.wins + t.draws / 2) / t.games : NaN);
const pct = (x: number) => (Number.isNaN(x) ? '   —  ' : `${(x * 100).toFixed(1).padStart(5)}%`);

const byUnit = new Map(UNIT_LIST.map((u) => [u.id, tally()]));
const families: Family[] = ['legion', 'riders', 'mystics', 'guards'];
const byFamily2 = new Map(families.map((f) => [f, tally()]));
const byFamily4 = new Map(families.map((f) => [f, tally()]));
const sides: Record<Side, Tally> = { A: tally(), B: tally() };
let ticks = 0;
let timeouts = 0;
let timeoutDraws = 0;
let reachedStorm = 0;
let withCollision = 0;
const tickHist = new Map<number, number>();

const rng = createRng(SEED);
const started = performance.now();

for (let i = 0; i < BATTLES; i++) {
  const round = 1 + (i % MAX_ROUND);
  const ghost = () =>
    generateGhost({
      round,
      difficulty: rng.int(20, 100) / 100,
      seed: rng.nextUint32(),
    }).army;
  const armies: Record<Side, ArmySlot[]> = { A: ghost(), B: ghost() };
  const r = simulate(createSetup(armies.A, armies.B, DEFAULT_RULES, SYNERGIES));

  ticks += r.ticks;
  tickHist.set(r.ticks, (tickHist.get(r.ticks) ?? 0) + 1);
  if (r.reason === 'timeout') {
    timeouts++;
    if (r.winner === null) timeoutDraws++;
  }
  if (r.events.some((e) => e.type === 'collision')) withCollision++;
  if (r.events.some((e) => e.type === 'storm')) reachedStorm++;

  for (const side of ['A', 'B'] as const) {
    const outcome = r.winner === null ? 'draw' : r.winner === side ? 'win' : 'loss';
    add(sides[side], outcome);
    // Фигура считается один раз на армию, сколько бы копий ни было.
    for (const id of new Set(armies[side].map((s) => s.def.id))) add(byUnit.get(id)!, outcome);
    const units = armies[side].map((s) => ({ def: s.def, side }));
    for (const a of activeSynergies(units, side, SYNERGIES)) {
      if (a.count >= 2) add(byFamily2.get(a.family)!, outcome);
      if (a.count >= 4) add(byFamily4.get(a.family)!, outcome);
    }
  }
}

const seconds = (performance.now() - started) / 1000;
const avgTicks = ticks / BATTLES;
const timeoutDrawShare = timeoutDraws / BATTLES;
const timeoutShare = timeouts / BATTLES;
const collisionShare = withCollision / BATTLES;

// ---------- Отчёт ----------

const ok = (cond: boolean) => (cond ? '✅' : '❌');
console.log(`\nБаланс: ${BATTLES} боёв «бот против бота», раунды 1–${MAX_ROUND}, seed ${SEED}`);
console.log(`Время: ${seconds.toFixed(1)} с\n`);

console.log('Фигуры (винрейт армий, где есть фигура; цель 45–55%)');
console.log('  фигура           ур.  боёв    винрейт');
const unitRows = UNIT_LIST.map((u) => ({ u, t: byUnit.get(u.id)! })).sort(
  (a, b) => rate(b.t) - rate(a.t),
);
for (const { u, t } of unitRows) {
  const r = rate(t);
  console.log(
    `  ${ok(r >= 0.45 && r <= 0.55)} ${CONTENT_TEXTS.ru.unit[u.id as keyof typeof CONTENT_TEXTS.ru.unit].name.padEnd(13)} ${String(u.cost).padStart(2)}  ${String(t.games).padStart(6)}  ${pct(r)}`,
  );
}

console.log('\nСемьи (армии с активной синергией; цель для 4: ≤ 55%)');
console.log('  семья        на 2: боёв  винрейт   на 4: боёв  винрейт');
for (const f of families) {
  const t2 = byFamily2.get(f)!;
  const t4 = byFamily4.get(f)!;
  console.log(
    `  ${ok(!(rate(t4) > 0.55))} ${CONTENT_TEXTS.ru.family[f].padEnd(10)} ${String(t2.games).padStart(10)}  ${pct(rate(t2))}  ${String(t4.games).padStart(10)}  ${pct(rate(t4))}`,
  );
}

console.log('\nБои');
console.log(
  `  ${ok(avgTicks >= 10 && avgTicks <= 20)} средняя длина: ${avgTicks.toFixed(1)} такта (цель 10–20)`,
);
console.log(`  ${ok(timeoutShare < 0.1)} доля боёв до таймаута: ${pct(timeoutShare)} (цель < 10%)`);
console.log(
  `  ${ok(timeoutDrawShare < 0.1)} ничьи по таймауту: ${pct(timeoutDrawShare)} (цель < 10%)`,
);
console.log(
  `     бои, дошедшие до Бури (такт ${DEFAULT_RULES.storm?.startTick ?? '—'}+): ${pct(reachedStorm / BATTLES)}`,
);
console.log(
  `  ${ok(collisionShare > 0.6)} бои со столкновением: ${pct(collisionShare)} (цель > 60%)`,
);
console.log(
  `     сторона A / B: ${pct(rate(sides.A))} / ${pct(rate(sides.B))}  (перекос первого хода)`,
);
const buckets = [
  [1, 5],
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 29],
  [30, 30],
] as const;
console.log(
  '     длина боя: ' +
    buckets
      .map(([lo, hi]) => {
        let n = 0;
        for (const [t, c] of tickHist) if (t >= lo && t <= hi) n += c;
        return `${lo === hi ? lo : `${lo}–${hi}`}: ${pct(n / BATTLES).trim()}`;
      })
      .join(', '),
);

if (JSON_OUT) {
  const report = {
    battles: BATTLES,
    seed: SEED,
    units: Object.fromEntries(unitRows.map(({ u, t }) => [u.id, { ...t, winrate: rate(t) }])),
    families: Object.fromEntries(
      families.map((f) => [f, { two: rate(byFamily2.get(f)!), four: rate(byFamily4.get(f)!) }]),
    ),
    avgTicks,
    timeoutDrawShare,
    timeoutShare,
    stormShare: reachedStorm / BATTLES,
    collisionShare,
    sides: { A: rate(sides.A), B: rate(sides.B) },
    config: { lives: RUN_CONFIG.lives, collisionDamage: DEFAULT_RULES.collisionDamage },
  };
  writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${JSON_OUT}`);
}
