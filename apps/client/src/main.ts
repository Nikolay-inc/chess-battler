import { Application } from 'pixi.js';
import { RUN_CONFIG } from '@chess-battler/content';
import { DEFAULT_RULES, createRun } from '@chess-battler/sim';
import type { RunState } from '@chess-battler/sim';
import { Account } from './account';
import { Analytics, deviceId, sessionTracker } from './analytics';
import { ProfileStore, runRecord } from './profile-store';
import { Sfx } from './sfx';
import { feedbackRow, runId, snapshotRow } from './telemetry';
import { BENCH_GAP, BenchView, BoardView } from './board-view';
import { Game } from './game';
import { BattlePlayer } from './player';
import { Tweener } from './tween';
import { applyStatic, detectLocale, onLocaleChange, setLocale, t } from './i18n';
import type { Locale } from './i18n';
import { Router } from './router';
import type { Route } from './router';
import { CollectionScreen } from './screens/collection';
import { renderHome } from './screens/home';
import { ProfileScreen } from './screens/profile';
import { renderSettings } from './screens/settings';
import { renderStore } from './screens/store';
import { SettingsStore } from './settings';
import { loadRun, saveRun } from './storage';
import { $, hideInfo } from './ui';
import { version } from '../package.json';
import { applyTokens, px } from './theme/tokens';
import './style.css';

const SPEEDS = [1, 2, 4];

/** language_code из Telegram Mini App, если игра открыта в Telegram (SDK — подэтап E). */
function telegramLanguage(): string | undefined {
  const tg = (
    globalThis as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
    }
  ).Telegram;
  return tg?.WebApp?.initDataUnsafe?.user?.language_code;
}

async function main(): Promise<void> {
  applyTokens();
  // Язык: выбранный в настройках, иначе Telegram → браузер → английский.
  const settings = new SettingsStore();
  const resolveLocale = (chosen: Locale | null): Locale =>
    chosen ?? detectLocale(navigator.languages ?? [navigator.language], telegramLanguage());
  setLocale(resolveLocale(settings.current.locale));
  applyStatic();
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

  let speedIdx = SPEEDS.indexOf(settings.current.speed);
  const tweener = new Tweener(app.ticker, () => SPEEDS[speedIdx]!);
  const tickEl = $('tick');
  const player = new BattlePlayer(board, tweener, (tick) => {
    tickEl.textContent =
      tick > 0 ? t('play.tick', { tick, max: rules.maxTicks }) : t('play.battleStart');
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

  // Аккаунт (Supabase Auth): гость по умолчанию; в проде включится на шаге деплоя.
  const account = new Account({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_KEY,
    enabled: import.meta.env.VITE_AUTH_ENABLED === '1',
    // Без hash-маршрута: Supabase дописывает токены в hash, второй «#» их ломает.
    // После входа (см. ниже) открываем профиль и убираем ?auth=callback из адреса.
    redirectTo: `${location.origin}${location.pathname}?auth=callback`,
  });
  const profiles = new ProfileStore(account, settings);
  const sfx = new Sfx(settings);
  player.sound = (s) => sfx.play(s);

  // Аналитика: в проде отправляется в Supabase, в dev — только в консоль.
  const analytics = new Analytics({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_KEY,
    enabled: (import.meta.env.PROD && !isPreview) || import.meta.env.VITE_ANALYTICS_DEV === '1',
    deviceId: deviceId(),
    sessionId: sessionTracker(),
    userId: () => account.state.userId,
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
      // История забегов профиля (локально сразу, на сервер — когда есть вход).
      void profiles.recordRun(runRecord(s, runId(s), appVersion));
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
    onAction: (a) => {
      if (a.type === 'buy') sfx.play('buy');
    },
    onResultShown: (outcome) =>
      sfx.play(outcome === 'win' ? 'win' : outcome === 'loss' ? 'loss' : 'tap'),
  });
  if (!saved) {
    saveRun(initial);
    analytics.track('run_start', runId(initial), { seed: initial.seed });
  }
  game.start();

  // ---------- Навигация ----------
  const router = new Router();
  const collection = new CollectionScreen();
  const profileScreen = new ProfileScreen(account, profiles, () => router.route === 'profile');
  const accountLabel = () => {
    const s = account.state;
    return (
      profiles.profile.nickname ??
      (s.anonymous ? t('settings.guest') : (s.email ?? t('settings.guest')))
    );
  };
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
    profile: () => profileScreen.render(),
    settings: () =>
      renderSettings(settings, {
        version: versionText,
        accountLabel: accountLabel(),
        openProfile: () => router.go('profile'),
      }),
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

  // Смена языка: перерисовать текущий экран, забег и надписи на доске.
  let shownLocale = settings.current.locale;
  settings.onChange((s) => {
    if (s.locale !== shownLocale) {
      shownLocale = s.locale;
      setLocale(resolveLocale(s.locale));
    }
  });
  onLocaleChange(() => {
    board.relabel();
    bench.relabel();
    game.relocalize();
    hideInfo($('info'));
    show[router.route]();
  });
  router.sync();
  // Вход гостем / восстановление сессии — не блокирует игру.
  void account.init().then(() => {
    // Возврат по ссылке из письма / OAuth: supabase-js уже разобрал токены из hash.
    if (new URLSearchParams(location.search).get('auth') === 'callback') {
      history.replaceState(null, '', `${location.pathname}#/profile`);
      router.sync();
    }
  });

  // Отладочный доступ в dev-сборке: ручная прокрутка тикера, замеры темпа.
  if (import.meta.env.DEV)
    Object.assign(window, {
      __debug: { app, player, game, board, bench, analytics, router, settings, account, profiles },
    });
}

void main();
