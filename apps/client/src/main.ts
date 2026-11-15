import { Application } from 'pixi.js';
import { RUN_CONFIG } from '@chess-battler/content';
import { DEFAULT_RULES, createRun } from '@chess-battler/sim';
import type { RunState } from '@chess-battler/sim';
import { Analytics, deviceId, sessionTracker } from './analytics';
import { feedbackRow, runId, snapshotRow } from './telemetry';
import { BENCH_GAP, BenchView, BoardView } from './board-view';
import { Game } from './game';
import { BattlePlayer } from './player';
import { Tweener } from './tween';
import { Router } from './router';
import type { Route } from './router';
import { CollectionScreen } from './screens/collection';
import { renderHome } from './screens/home';
import { renderProfile } from './screens/profile';
import { renderSettings } from './screens/settings';
import { renderStore } from './screens/store';
import { SettingsStore } from './settings';
import { loadRun, saveRun } from './storage';
import { $, hideInfo } from './ui';
import { version } from '../package.json';
import { applyTokens, px } from './theme/tokens';
import './style.css';

const SPEEDS = [1, 2, 4];

async function main(): Promise<void> {
  applyTokens();
  const rules = DEFAULT_RULES;
  const board = new BoardView(rules);
  const bench = new BenchView(RUN_CONFIG.benchSlots, board.pixelWidth);
  bench.y = board.pixelHeight + BENCH_GAP - 10;

  const app = new Application();
  await app.init({
    width: board.pixelWidth,
    height: bench.y + bench.pixelHeight,
    background: px('bg'),
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    autoDensity: true,
  });
  // Canvas вписывается в свободную область (ширина и высота) с сохранением пропорций:
  // на невысоких экранах поле уже, но страница не прокручивается.
  const stage = $('stage');
  stage.appendChild(app.canvas);
  const ratio = app.screen.width / app.screen.height;
  const fitCanvas = () => {
    const r = stage.getBoundingClientRect();
    let w = r.width;
    let h = w / ratio;
    if (h > r.height) {
      h = r.height;
      w = h * ratio;
    }
    app.canvas.style.width = `${Math.floor(w)}px`;
    app.canvas.style.height = `${Math.floor(h)}px`;
  };
  new ResizeObserver(fitCanvas).observe(stage);
  fitCanvas();
  app.stage.addChild(board, bench);

  const settings = new SettingsStore();
  let speedIdx = SPEEDS.indexOf(settings.current.speed);
  const tweener = new Tweener(app.ticker, () => SPEEDS[speedIdx]!);
  const tickEl = $('tick');
  const player = new BattlePlayer(board, tweener, (tick) => {
    tickEl.textContent = tick > 0 ? `Такт ${tick} / ${rules.maxTicks}` : 'Начало боя';
  });

  const speedBtn = $<HTMLButtonElement>('speed');
  speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
  speedBtn.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
  });
  $('skip').addEventListener('click', () => {
    $<HTMLButtonElement>('skip').disabled = true;
    player.skip();
  });

  // Версия: номер из package.json + короткий хэш коммита сборки (в dev — «dev»).
  const build = (import.meta.env.VITE_APP_VERSION || 'dev').slice(0, 7);
  const appVersion = `${version}+${build}`;
  // Превью-деплои Vercel помечены и не пишут аналитику, чтобы не смешивать с тестерами.
  const deployEnv = import.meta.env.VITE_DEPLOY_ENV || 'production';
  const isPreview = deployEnv !== 'production';
  const versionText = `v${version} · ${build}${isPreview ? ` · ${deployEnv}` : ''}`;
  $('version').textContent = versionText;

  // Аналитика: в проде отправляется в Supabase, в dev — только в консоль.
  const analytics = new Analytics({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_KEY,
    enabled: (import.meta.env.PROD && !isPreview) || import.meta.env.VITE_ANALYTICS_DEV === '1',
    deviceId: deviceId(),
    sessionId: sessionTracker(),
    appVersion,
  });
  analytics.autoFlush();

  // Продолжаем сохранённый забег, если он есть.
  const saved = loadRun(RUN_CONFIG);
  const initial: RunState =
    saved ?? createRun(crypto.getRandomValues(new Uint32Array(1))[0]!, RUN_CONFIG);
  const game: Game = new Game(app, board, bench, player, initial, {
    save: saveRun,
    onRunStart: (s) => analytics.track('run_start', runId(s), { seed: s.seed }),
    onRoundEnd: (before, after, outcome, result) => {
      analytics.track('round_end', runId(before), {
        round: before.round,
        result: outcome,
        // Как закончился бой: elimination — армия разбита, timeout — 30 тактов.
        reason: result.reason,
        // Время подготовки раунда: от начала раунда до нажатия «В бой».
        duration_ms: game.roundElapsedMs(),
        battle_ticks: result.ticks,
        wins: after.wins,
        lives: after.lives,
      });
      // Снимок армии перед боем — будущий пул призраков (пока не используется).
      analytics.send('army_snapshots', snapshotRow(before, outcome));
    },
    onRunEnd: (s) => {
      analytics.track('run_end', runId(s), {
        result: s.status,
        wins: s.wins,
        losses: s.losses,
        rounds: s.history.length,
      });
      void analytics.flush();
    },
    onFeedback: (s, rating, annoyed) => {
      analytics.send('run_feedback', feedbackRow(s, rating, annoyed));
      void analytics.flush();
    },
    // Каждый бой начинается со скорости по умолчанию из настроек.
    onBattleStart: () => {
      speedIdx = Math.max(0, SPEEDS.indexOf(settings.current.speed));
      speedBtn.textContent = `×${SPEEDS[speedIdx]}`;
    },
  });
  if (!saved) {
    saveRun(initial);
    analytics.track('run_start', runId(initial), { seed: initial.seed });
  }
  game.start();

  // ---------- Навигация ----------
  const router = new Router();
  const collection = new CollectionScreen();
  const show: Record<Route, () => void> = {
    home: () =>
      renderHome(game.current, RUN_CONFIG, {
        onPlay: () => router.go('play'),
        onNewRun: () => {
          game.newRun();
          router.go('play');
        },
      }),
    play: () => {
      // Пока экран был скрыт, поле имело размер 0 — пересчитать сразу, не ждать ResizeObserver.
      fitCanvas();
      game.enter();
    },
    collection: () => collection.show(),
    shop: () => renderStore(),
    profile: () => renderProfile(),
    settings: () => renderSettings(settings, versionText),
  };
  router.onChange((route) => {
    document.body.dataset.route = route;
    hideInfo($('info'));
    for (const tab of document.querySelectorAll<HTMLElement>('.tab')) {
      if (tab.dataset.route === route) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
    show[route]();
  });
  $('play-back').addEventListener('click', () => router.go('home'));
  router.sync();

  // Отладочный доступ в dev-сборке: ручная прокрутка тикера, замеры темпа.
  if (import.meta.env.DEV)
    Object.assign(window, {
      __debug: { app, player, game, board, bench, analytics, router, settings },
    });
}

void main();
