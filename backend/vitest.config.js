import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const resolvePath = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': resolvePath('./src') },
  },
  test: {
    environment: 'node',
    globals: true,
    // Подменяем БД на тестовую; dotenv в src/config/knex.js не перетирает уже
    // выставленные переменные, поэтому остальные DB_* берутся из .env.
    env: {
      NODE_ENV: 'test',
      DB_NAME: 'palisad_test',
    },
    globalSetup: './tests/globalSetup.js',
    setupFiles: ['./tests/setup.js'],
    // Тесты делят одну БД → запускаем файлы последовательно.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // Инфраструктура/данные вне интеграционного покрытия. Cron-обёртки
      // (cleanupCron/subscriptionCron) покрыты в tests/cronJobs.test.js — не исключаем.
      exclude: [
        'src/config/**',
        'src/constants/**',
      ],
      reporter: ['text-summary', 'text'],
      // Строки/функции/стейтменты держим выше 90%. Ветки — 80% (остаток приходится
      // на защитные/практически недостижимые ветки: маппинг DB-ошибок, health-check,
      // лимит питомников, заблокированный текущим «один питомник на аккаунт»).
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
