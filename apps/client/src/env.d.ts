/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_ANALYTICS_DEV?: string;
  /** 1 — вход через Supabase Auth включён. */
  readonly VITE_AUTH_ENABLED?: string;
  /** 1 — тестовая оплата скинов (только dev + локальный стек). */
  readonly VITE_DEV_PURCHASES?: string;
  /** Версия сборки (в CI — SHA коммита). */
  readonly VITE_APP_VERSION?: string;
  /** Окружение деплоя Vercel: production | preview | development. На GitHub Pages не задано. */
  readonly VITE_DEPLOY_ENV?: string;
}
