# MODULE_0 — Backend: Инициализация проекта

**Зависит от:** —

---

## Шаг 1. Структура папок

Создать структуру вручную:

```
palisad/
  backend/
    src/
      config/        — knex, logger, env-валидация
      constants/     — UPPER_SNAKE_CASE константы
      controllers/   — тонкий слой: получить данные из req, вызвать service, отдать res
      middlewares/   — auth, rbac, errorHandler, validate
      repositories/  — запросы к БД через knex
      routes/        — express-роутеры
      services/      — бизнес-логика
      utils/         — вспомогательные функции
    db/
      migrations/    — knex-миграции
      seeds/         — начальные данные
    logs/            — файлы логов (в .gitignore)
    .env
    .env.example
    .gitignore
    app.js
    server.js
    knexfile.cjs
    package.json
```

---

## Шаг 2. Инициализация и зависимости

```bash
cd backend
npm init -y
```

Зависимости:

```bash
npm install express dotenv cors helmet morgan cookie-parser \
  knex pg argon2 jsonwebtoken \
  zod winston module-alias nanoid
```

Dev-зависимости:

```bash
npm install -D nodemon eslint
```

`package.json` — добавить:

```json
{
  "type": "module",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "migrate": "knex --knexfile knexfile.cjs migrate:latest",
    "migrate:rollback": "knex --knexfile knexfile.cjs migrate:rollback",
    "seed": "knex --knexfile knexfile.cjs seed:run"
  },
  "_moduleAliases": {
    "@": "./src"
  }
}
```

> `knexfile.cjs` — CommonJS-файл, потому что knex CLI не поддерживает ESM-конфиг напрямую при `"type": "module"`.

---

## Шаг 3. Docker — PostgreSQL

`docker-compose.yml` в корне монорепы (`palisad/`):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: palisad_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: palisad
      POSTGRES_USER: palisad_user
      POSTGRES_PASSWORD: palisad_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

```bash
docker compose up -d
```

---

## Шаг 4. Переменные окружения

`.env`:

```env
NODE_ENV=development
PORT=3100

DB_HOST=localhost
DB_PORT=5432
DB_NAME=palisad
DB_USER=palisad_user
DB_PASSWORD=palisad_pass

CLIENT_URL=http://localhost:5173

JWT_SECRET=замени_на_случайную_строку_минимум_32_символа
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=замени_на_другую_случайную_строку
JWT_REFRESH_EXPIRES_IN=7d
```

`.env.example` — то же без значений. `.env` добавить в `.gitignore`.

---

## Шаг 5. Конфигурация Knex

`src/config/knex.js`:

```js
import knex from 'knex';
import 'dotenv/config';

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  pool: { min: 2, max: 10 },
});

export default db;
```

`knexfile.cjs` в корне `backend/`:

```js
require('dotenv').config();

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    migrations: { directory: './db/migrations' },
    seeds: { directory: './db/seeds' },
  },
};
```

---

## Шаг 6. Winston

`src/config/logger.js`:

```js
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

export default logger;
```

---

## Шаг 7. errorHandler middleware

`src/middlewares/errorHandler.js`:

```js
import logger from '@/config/logger.js';

export default function errorHandler(err, req, res, _next) {
  logger.error(err.message, { stack: err.stack, path: req.path });

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({ error: message });
}
```

Вспомогательный класс для HTTP-ошибок — `src/utils/AppError.js`:

```js
export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
```

---

## Шаг 8. app.js

```js
import 'module-alias/register.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

import healthRouter from '@/routes/health.router.js';
import errorHandler from '@/middlewares/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.use('/api', healthRouter);

app.use(errorHandler);

export default app;
```

---

## Шаг 9. server.js

```js
import 'module-alias/register.js';
import 'dotenv/config';
import app from './app.js';
import db from '@/config/knex.js';
import logger from '@/config/logger.js';

const PORT = process.env.PORT || 3100;

async function start() {
  try {
    await db.raw('SELECT 1');
    logger.info('PostgreSQL connected');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to connect to DB', { error: err.message });
    process.exit(1);
  }
}

start();
```

---

## Шаг 10. Health-check роут

`src/routes/health.router.js`:

```js
import { Router } from 'express';
import db from '@/config/knex.js';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

export default router;
```

---

## Шаг 11. ESLint

`.eslintrc.json`:

```json
{
  "env": { "node": true, "es2022": true },
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module" },
  "rules": {
    "eqeqeq": ["error", "always"],
    "no-var": "error",
    "prefer-const": "error",
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-param-reassign": "error"
  }
}
```

---

## Шаг 12. .gitignore

```
node_modules/
.env
logs/
dist/
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | PostgreSQL запущен | `docker ps` → контейнер `palisad_db` со статусом `Up` |
| 2 | Сервер стартует | `npm run dev` → `Server running on port 3100` в логах |
| 3 | БД подключена | В логах: `PostgreSQL connected` |
| 4 | Health-check отвечает | `GET /api/health` → `{ "status": "ok", "db": "connected" }` |
| 5 | Алиас `@` работает | Импорты `@/config/...` резолвятся без ошибок |
| 6 | Логгер пишет файлы | После старта появляются `logs/error.log` и `logs/combined.log` |
| 7 | Структура папок полная | Все директории из Шага 1 присутствуют |

Реализовано