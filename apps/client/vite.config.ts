import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Относительные пути: сборка работает и в корне домена, и в подпапке (GitHub Pages).
  base: './',
  // Туннель cloudflared для Telegram Mini App (pnpm tg:dev) — разрешить его домены.
  server: { port: 5173, allowedHosts: ['.trycloudflare.com'] },
  test: {
    name: 'client',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
