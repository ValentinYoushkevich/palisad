# Палисад

Offline-first PWA для учёта питомников растений: реестр растений с QR-кодами,
журнал операций, движения, этикетки PDF, лента активности, работа в поле без интернета.

Подробное ТЗ — [`general.md`](general.md), обзорная документация — [`documentation/`](documentation/),
текущие задачи — [`documentation/tasks/CURRENT_TASKS.md`](documentation/tasks/CURRENT_TASKS.md).

## Стек

| Часть | Технологии |
|-------|------------|
| Frontend | Vue 3, PrimeVue, Pinia, Vite, Tailwind, Dexie.js (IndexedDB), Workbox, zxing-js |
| Backend | Node.js (ESM), Express 5, PostgreSQL 16, Knex.js, Argon2id, JWT (HttpOnly cookie), Zod, Winston, pdfkit + qrcode, GBIF API |

## Быстрый старт

### 1. База данных (Docker)

```bash
docker compose up -d postgres
```

Postgres 16 поднимается на порту **5433** (юзер/БД/пароль — `palisad_user` / `palisad` / `palisad_pass`,
см. `docker-compose.yml`).

### 2. Backend

```bash
cd backend
cp .env.example .env     # заполнить секреты (DB_*, JWT_*)
npm install
npm run migrate          # миграции Knex
npm run seed             # план free, системные типы движений/контейнеров, dev-аккаунт
npm run dev              # nodemon, http://localhost:3100
```

Health-check: `GET http://localhost:3100/api/health` → `{"status":"ok","db":"connected"}`.

Прочие команды: `npm run start` (без nodemon), `npm run migrate:rollback`, `npm run lint`,
`npm test` / `npm run test:coverage` (интеграционные тесты, см. ниже).

Сид в dev-режиме создаёт аккаунт `admin.owner@palisad.local` / `dev12345`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev              # Vite, http://localhost:5173 (проксирует /api на :3100)
```

Прочие команды: `npm run build`, `npm run preview`, `npm run lint`.

### Всё в Docker

`docker compose up -d` поднимает Postgres и backend (порт 3100); frontend запускается локально через Vite.

## Структура репозитория

```
palisad/
  docker-compose.yml         # Postgres + backend
  general.md                 # продуктовое ТЗ (RU)
  documentation/             # обзоры, roadmap v2, задачи (tasks/)
  backend/                   # Express API
    db/migrations, db/seeds  # Knex
    documentation/           # модули MODULE_0..13, schema.sql
    scripts/acceptance-check.mjs  # приёмочный прогон критериев модулей (см. ниже)
    src/                     # routes → controllers → services → repositories
  frontend/                  # Vue 3 PWA
    documentation/           # модули MODULE_0..12
    src/                     # pages, stores, db (Dexie), composables
```

## Тесты backend

### Интеграционные тесты (Vitest + supertest)

```bash
cd backend
npm test                 # vitest run (нужен только запущенный Postgres :5433)
npm run test:coverage    # + отчёт покрытия v8
```

130 тестов покрывают модули 2–13 через реальный Express (supertest) и отдельную тестовую БД
`palisad_test` (создаётся и мигрируется автоматически в `tests/globalSetup.js`; внешний GBIF API
замокан). Покрытие: строки/функции — 93.8% / 98.1%, ветки — 82.7%. Backend поднимать **не нужно**
(`app.js` импортируется напрямую), только Postgres.

### Приёмочный прогон против живого API

При запущенных Postgres и backend:

```bash
cd backend
node --loader ./alias-loader.mjs scripts/acceptance-check.mjs
```

Прогоняет ~80 критериев приёмки модулей 2–13 (auth, RBAC, лимиты планов, реестр растений,
операции, движения, PDF-этикетки, лента активности) против живого API и БД.
Скрипт идемпотентен: чистит свои тестовые данные и возвращает план `free` к исходным значениям.
