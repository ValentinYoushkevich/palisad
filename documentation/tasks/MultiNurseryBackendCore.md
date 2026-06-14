# MultiNursery · Backend core — снять предположение «один питомник на аккаунт»

> Этап 1 v2 · задача 1/5. Файлы-соседи: [`MultiNurseryPlanLimit.md`](MultiNurseryPlanLimit.md),
> [`MultiNurseryRolesDecision.md`](MultiNurseryRolesDecision.md),
> [`MultiNurseryFrontendSwitcher.md`](MultiNurseryFrontendSwitcher.md),
> [`MultiNurseryOffline.md`](MultiNurseryOffline.md).

## Чего хотим достичь

Аккаунт может иметь несколько питомников (`nurseries.account_id` 1:N — схема готова).
Снимаем в бизнес-логике предположение «один питомник на аккаунт»:

- `createNursery` больше не возвращает 409 на второй питомник;
- `login`/`refresh` выбирают **активный** питомник (а не случайный `.first()`);
- появляется endpoint **переключения** активного питомника с перевыпуском access-токена;
- появляются endpoint'ы **списка** питомников и **получения по id**.

## Общий дизайн (общий для всех 5 файлов)

- Актор — владелец аккаунта (логина для сотрудников в MVP нет, см. `auth.router.js`).
- В каждом питомнике — свой ряд `users` с ролью (owner создаётся автоматически при создании питомника).
  Роли **per-nursery** (см. [`MultiNurseryRolesDecision.md`](MultiNurseryRolesDecision.md)).
- **Активный питомник кодируется в access-токене** `{ accountId, userId, nurseryId, role }`, где
  `userId/role` — ряд `users` активного питомника. Переключение = перевыпуск токена.
- `requireNurseryAccess` (сравнение `req.user.nurseryId === :nurseryId`) и `requireRole`
  (роль из токена) **не меняются** — модель «активный питомник в токене» сохраняет их корректность.
- «Последний активный питомник» хранится в `accounts.last_active_nursery_id`.

## Текущее состояние (факты по коду)

- `backend/app.js:41-49` — роуты `/api/nurseries/:nurseryId/...` уже параметризованы для всех ресурсов.
- `backend/src/middlewares/requireNurseryAccess.js` — сравнивает `req.user.nurseryId !== nurseryId`.
- `backend/src/services/auth.service.js:60` — `login` берёт `userRepo.findOwnerByAccountId(account.id)`
  (внутри `.first()` — недетерминированно при нескольких питомниках); то же в `refresh` (строка 106).
- `backend/src/services/nursery.service.js:19-45` — `createNursery` жёстко блокирует второй питомник (409).
- `backend/src/routes/nursery.router.js` — только `GET /my`, `POST /`, `PATCH /my`.
- `backend/src/repositories/nursery.repository.js` — есть `findByAccountId().first()`, `countByAccountId`.

## План

### Шаг 1. Миграция: `accounts.last_active_nursery_id`

Создать `backend/db/migrations/20260614120000_add_last_active_nursery_to_accounts.js`:

```js
export async function up(knex) {
  await knex.schema.alterTable('accounts', (table) => {
    table
      .uuid('last_active_nursery_id')
      .nullable()
      .references('id')
      .inTable('nurseries')
      .onDelete('SET NULL');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('accounts', (table) => {
    table.dropColumn('last_active_nursery_id');
  });
}
```

Применить и проверить:

- Run: `cd backend && npm run migrate:latest` (или команда миграций из `package.json`).
- Ожидаемо: миграция применяется без ошибок; столбец `last_active_nursery_id` присутствует
  (`nullable`, FK на `nurseries.id`, `ON DELETE SET NULL`).

### Шаг 2. Репозитории

**`backend/src/repositories/nursery.repository.js`** — добавить:

```js
export function findAllByAccountId(accountId) {
  return db('nurseries').where({ account_id: accountId }).orderBy('created_at', 'asc');
}

export function findByIdAndAccount(id, accountId) {
  return db('nurseries').where({ id, account_id: accountId }).first();
}

export function findFirstByAccountId(accountId) {
  return db('nurseries')
    .where({ account_id: accountId })
    .orderBy('created_at', 'asc')
    .first();
}
```

**`backend/src/repositories/user.repository.js`** — добавить:

```js
export function findOwnerByAccountAndNursery(accountId, nurseryId) {
  return db('users')
    .join('nurseries', 'users.nursery_id', 'nurseries.id')
    .where('nurseries.account_id', accountId)
    .where('users.nursery_id', nurseryId)
    .where('users.role', 'owner')
    .select('users.*')
    .first();
}
```

### Шаг 3. `auth.service` — активный питомник в login/refresh + `activateNursery`

В `backend/src/services/auth.service.js`:

- добавить импорт `import * as nurseryRepo from '@/repositories/nursery.repository.js';`
- добавить приватный резолвер активного контекста:

```js
async function resolveActiveContext(accountId) {
  const account = await accountRepo.findById(accountId);
  let nursery = null;
  if (account?.last_active_nursery_id) {
    nursery = await nurseryRepo.findByIdAndAccount(account.last_active_nursery_id, accountId);
  }
  if (!nursery) {
    nursery = await nurseryRepo.findFirstByAccountId(accountId);
  }
  const user = nursery
    ? await userRepo.findOwnerByAccountAndNursery(accountId, nursery.id)
    : null;
  return { account, nursery, user };
}
```

- в `login` заменить `const user = await userRepo.findOwnerByAccountId(account.id);` на
  `const { user } = await resolveActiveContext(account.id);` (payload уже использует
  `user?.nursery_id`, `user?.id`, `user?.role` — без изменений).
- в `refresh` — аналогично заменить `findOwnerByAccountId` на `resolveActiveContext`.
- добавить экспортируемую функцию активации (используется switch и create):

```js
export async function activateNursery(accountId, nurseryId, res) {
  const nursery = await nurseryRepo.findByIdAndAccount(nurseryId, accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }

  const user = await userRepo.findOwnerByAccountAndNursery(accountId, nurseryId);
  const account = await accountRepo.findById(accountId);

  const accessToken = signAccess({
    accountId,
    userId: user?.id,
    nurseryId: nursery.id,
    role: user?.role,
  });
  const refreshToken = signRefresh({ accountId });
  setTokenCookies(res, accessToken, refreshToken);

  await accountRepo.updateById(accountId, { last_active_nursery_id: nursery.id });

  return { user: mapAuthUser(user, account), nursery };
}
```

(`signAccess`, `signRefresh`, `setTokenCookies`, `mapAuthUser`, `accountRepo`, `userRepo` уже в модуле.)

### Шаг 4. `nursery.service` — N питомников, список, by-id, update по id

В `backend/src/services/nursery.service.js`:

- `getMyNursery` → активный питомник (по id из токена, с фолбэком):

```js
export async function getMyNursery(accountId, activeNurseryId) {
  let nursery = activeNurseryId
    ? await nurseryRepo.findByIdAndAccount(activeNurseryId, accountId)
    : null;
  if (!nursery) {
    nursery = await nurseryRepo.findFirstByAccountId(accountId);
  }
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }
  return nursery;
}
```

- добавить список и by-id:

```js
export function listNurseries(accountId) {
  return nurseryRepo.findAllByAccountId(accountId);
}

export async function getNurseryById(accountId, nurseryId) {
  const nursery = await nurseryRepo.findByIdAndAccount(nurseryId, accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }
  return nursery;
}
```

- `createNursery` — **убрать блок 409** (строки 20-23: `const existing = ...; if (existing) throw 409`).
  Остальное (проверка лимита, создание nursery + owner-user) оставить как есть — рефактор лимита
  отдельной задачей [`MultiNurseryPlanLimit.md`](MultiNurseryPlanLimit.md). Активацией нового питомника
  (перевыпуск токена) занимается контроллер (шаг 5).

- `updateNursery` → принимать `nurseryId` и проверять принадлежность:

```js
export async function updateNursery(accountId, nurseryId, data) {
  const nursery = await nurseryRepo.findByIdAndAccount(nurseryId, accountId);
  if (!nursery) {
    throw new AppError('Питомник не найден', 404);
  }
  return nurseryRepo.updateById(nursery.id, data);
}
```

### Шаг 5. Контроллер — прокинуть активный питомник, switch, list, by-id

В `backend/src/controllers/nursery.controller.js`:

```js
import * as authService from '@/services/auth.service.js';
import * as nurseryService from '@/services/nursery.service.js';

export async function listNurseries(req, res, next) {
  try {
    return res.json(await nurseryService.listNurseries(req.user.accountId));
  } catch (err) {
    return next(err);
  }
}

export async function getMyNursery(req, res, next) {
  try {
    return res.json(await nurseryService.getMyNursery(req.user.accountId, req.user.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function getNurseryById(req, res, next) {
  try {
    return res.json(await nurseryService.getNurseryById(req.user.accountId, req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function createNursery(req, res, next) {
  try {
    const nursery = await nurseryService.createNursery(req.user.accountId, req.body);
    await authService.activateNursery(req.user.accountId, nursery.id, res);
    return res.status(201).json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function updateMyNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(
      req.user.accountId,
      req.user.nurseryId,
      req.body
    );
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function updateNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(
      req.user.accountId,
      req.params.nurseryId,
      req.body
    );
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function switchNursery(req, res, next) {
  try {
    const result = await authService.activateNursery(
      req.user.accountId,
      req.params.nurseryId,
      res
    );
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
```

### Шаг 6. Роутер

В `backend/src/routes/nursery.router.js` добавить импорт
`import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';`
и переписать маршруты (статические — до `/:nurseryId`; switch — до `/:nurseryId`):

```js
const router = Router();

router.use(requireAuth);

router.get('/', nurseryController.listNurseries);
router.get('/my', nurseryController.getMyNursery);
router.post('/', validate(createNurserySchema), nurseryController.createNursery);
router.patch('/my', validate(updateNurserySchema), nurseryController.updateMyNursery);

router.post('/:nurseryId/switch', nurseryController.switchNursery);
router.get('/:nurseryId', requireNurseryAccess, nurseryController.getNurseryById);
router.patch(
  '/:nurseryId',
  requireNurseryAccess,
  validate(updateNurserySchema),
  nurseryController.updateNursery
);

export default router;
```

> Примечание: `POST /:nurseryId/switch` идёт **без** `requireNurseryAccess` (он бы заблокировал
> переключение на другой питомник — токен ещё указывает на старый). Принадлежность аккаунту
> проверяет `activateNursery` через `findByIdAndAccount`.

### Шаг 7. Тесты (TDD)

В `backend/tests/nursery.test.js`:

- **Заменить** тест `повторное создание питомника → 409` (строки 37-44) на сценарий успеха:

```js
import {
  api, createOwnerWithNursery, db, loginCookie, register,
  setFreePlan, STRONG_PASSWORD, toCookieHeader, uniqueEmail,
} from './helpers.js';

it('создание второго питомника → 201 и он становится активным', async () => {
  const ctx = await createOwnerWithNursery();
  await setFreePlan({ nursery_limit: 5 });

  const res = await api()
    .post('/api/nurseries')
    .set('Cookie', ctx.cookie)
    .send({ name: 'Second Nursery', address: 'St 2' });
  expect(res.status).toBe(201);

  const cookie2 = toCookieHeader(res.headers['set-cookie']);
  const my = await api().get('/api/nurseries/my').set('Cookie', cookie2);
  expect(my.body.name).toBe('Second Nursery');
});
```

- Добавить:

```js
it('GET /nurseries возвращает все питомники аккаунта', async () => {
  const ctx = await createOwnerWithNursery();
  await setFreePlan({ nursery_limit: 5 });
  await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'Second' });

  const res = await api().get('/api/nurseries').set('Cookie', ctx.cookie);
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(2);
});

it('switch переключает активный питомник', async () => {
  const ctx = await createOwnerWithNursery();
  await setFreePlan({ nursery_limit: 5 });
  const created = await api()
    .post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'Second' });
  const cookie2 = toCookieHeader(created.headers['set-cookie']);

  const sw = await api()
    .post(`/api/nurseries/${ctx.nurseryId}/switch`).set('Cookie', cookie2);
  expect(sw.status).toBe(200);

  const cookieBack = toCookieHeader(sw.headers['set-cookie']);
  const my = await api().get('/api/nurseries/my').set('Cookie', cookieBack);
  expect(my.body.id).toBe(ctx.nurseryId);
});

it('switch на чужой питомник → 404', async () => {
  const a = await createOwnerWithNursery();
  const b = await createOwnerWithNursery();
  const res = await api()
    .post(`/api/nurseries/${b.nurseryId}/switch`).set('Cookie', a.cookie);
  expect(res.status).toBe(404);
});

it('доступ к ресурсам неактивного своего питомника без switch → 403', async () => {
  const ctx = await createOwnerWithNursery();
  await setFreePlan({ nursery_limit: 5 });
  const created = await api()
    .post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'Second' });
  const cookie2 = toCookieHeader(created.headers['set-cookie']); // активен второй

  const res = await api()
    .get(`/api/nurseries/${ctx.nurseryId}/plants`).set('Cookie', cookie2);
  expect(res.status).toBe(403);
});
```

- Прогнать: `cd backend && npx vitest run tests/nursery.test.js`. Ожидаемо: все зелёные.
- Прогнать весь бэкенд (на регрессии auth/switch): `cd backend && npx vitest run`.

### Шаг 8. Коммит

```bash
git add backend/db/migrations backend/src backend/tests/nursery.test.js
git commit -m "feat(backend): несколько питомников на аккаунт + переключение активного"
```

## Критерии готовности

- [ ] Миграция `last_active_nursery_id` применяется и откатывается.
- [ ] `createNursery` создаёт N питомников (без 409), новый становится активным (токен перевыпущен).
- [ ] `GET /nurseries` (список), `GET /:nurseryId`, `POST /:nurseryId/switch` работают.
- [ ] `login`/`refresh` восстанавливают активный питомник из `last_active_nursery_id`.
- [ ] `requireNurseryAccess` блокирует доступ к неактивному питомнику до `switch`.
- [ ] Все тесты бэкенда зелёные (включая обновлённый `nursery.test.js`).

## Затронутые файлы

- Create: `backend/db/migrations/20260614120000_add_last_active_nursery_to_accounts.js`
- Modify: `backend/src/repositories/nursery.repository.js`, `backend/src/repositories/user.repository.js`,
  `backend/src/services/auth.service.js`, `backend/src/services/nursery.service.js`,
  `backend/src/controllers/nursery.controller.js`, `backend/src/routes/nursery.router.js`
- Test: `backend/tests/nursery.test.js`

## Результаты

**Статус:** реализовано (2026-06-14).

Сделано по плану:
- Миграция `20260614120000_add_last_active_nursery_to_accounts.js` — `accounts.last_active_nursery_id`
  (nullable FK → `nurseries.id`, ON DELETE SET NULL). Применена к dev (Batch 3) и тестовой БД (через `globalSetup`).
- Репозитории: `nurseryRepo.findAllByAccountId`/`findByIdAndAccount`/`findFirstByAccountId`,
  `userRepo.findOwnerByAccountAndNursery`.
- `auth.service`: приватный `resolveActiveContext` (активный питомник из `last_active_nursery_id`
  с фолбэком на первый), `login`/`refresh` переведены на него; экспортируемый `activateNursery`
  (перевыпуск access+refresh токена + запись `last_active_nursery_id`).
- `nursery.service`: `getMyNursery(accountId, activeNurseryId)`, `listNurseries`, `getNurseryById`,
  `createNursery` без блока 409, `updateNursery(accountId, nurseryId, data)` (устойчив к пустому nurseryId → 404).
- `nursery.controller` + `nursery.router`: `GET /`, `GET /my`, `POST /`, `PATCH /my`,
  `POST /:nurseryId/switch`, `GET /:nurseryId`, `PATCH /:nurseryId` (switch — без `requireNurseryAccess`).

Отклонение от плана: в `updateNursery` добавлена защита от `nurseryId === undefined`
(`PATCH /my` без активного питомника) — иначе knex `.where({ id: undefined })` давал 500 вместо 404
(поймано регресс-тестом `coverage-extra.test.js`).

Результат проверки: `nursery.test.js` — 10/10; полный прогон бэкенда — **134/134 зелёные**;
ESLint по изменённым файлам — чисто.
