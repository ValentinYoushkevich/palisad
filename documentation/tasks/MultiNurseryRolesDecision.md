# MultiNursery · Решение по ролям — роли сотрудников остаются per-nursery

> Этап 1 v2 · задача 3/5. Связано с [`MultiNurseryBackendCore.md`](MultiNurseryBackendCore.md).
> Общий дизайн — там же.

## Чего хотим достичь

Зафиксировать архитектурное решение по ролям при нескольких питомниках на аккаунте и
**подтвердить тестом**, что текущая модель ему уже соответствует. Кода-изменений минимум —
это решение + проверка инвариантов.

## Решение (зафиксировано)

**Роли сотрудников остаются per-nursery** (рекомендация роадмапа,
[`v2-roadmap-proposal.md`](../v2-roadmap-proposal.md), раздел «Этап 1 → Риски/решения»).

Обоснование:
- `users.nursery_id` уже привязывает каждого пользователя (и его роль) к конкретному питомнику;
  один и тот же человек в разных питомниках — это **разные ряды** `users` с собственными ролями.
- `requireRole` берёт роль из токена (`req.user.role`), а токен отражает **активный** питомник
  (см. модель «активный питомник в токене» в [`MultiNurseryBackendCore.md`](MultiNurseryBackendCore.md)),
  поэтому права автоматически вычисляются в контексте активного питомника — без изменений RBAC.
- Не вводим общие (account-wide) роли: это усложнило бы модель прав и сломало текущую схему `users`.

Следствия:
- Владелец аккаунта является `owner` в каждом своём питомнике (owner-ряд создаётся автоматически
  при `createNursery`).
- Сотрудник, заведённый в питомнике A, **не** появляется и не имеет прав в питомнике B.
- Управление сотрудниками остаётся per-nursery: `/api/nurseries/:nurseryId/users`.

## Текущее состояние (факты по коду)

- `backend/db/migrations/...init_mvp_schema.js:57` — таблица `users` с `nursery_id`.
- `backend/src/services/staff.service.js` — все операции принимают `nurseryId`; `createUser` пишет
  `nursery_id`; лимит пользователей считается по `findAllByNursery(nurseryId)`.
- `backend/src/middlewares/requireRole.js` — роль из `req.user.role` (токен активного питомника).

## План

### Шаг 1. Тест-инвариант изоляции ролей (TDD)

Создать `backend/tests/multiNurseryRoles.test.js`:

```js
import { describe, expect, it } from 'vitest';

import {
  api, createOwnerWithNursery, createStaff, db, setFreePlan, toCookieHeader,
} from './helpers.js';

describe('MultiNursery — изоляция ролей per-nursery', () => {
  it('сотрудник питомника A отсутствует в питомнике B', async () => {
    await setFreePlan({ nursery_limit: 5, user_limit: 50 });
    const ctx = await createOwnerWithNursery(); // активен питомник A (ctx.nurseryId)

    // сотрудник в A
    const { user: agroA } = await createStaff(ctx, 'agronomist');

    // создаём питомник B (становится активным), запоминаем его cookie/id
    const createB = await api()
      .post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'B' });
    const cookieB = toCookieHeader(createB.headers['set-cookie']);
    const nurseryB = createB.body;

    // список сотрудников B не содержит agroA
    const usersB = await api()
      .get(`/api/nurseries/${nurseryB.id}/users`).set('Cookie', cookieB);
    expect(usersB.status).toBe(200);
    expect(usersB.body.some((u) => u.id === agroA.id)).toBe(false);

    // владелец — owner в обоих питомниках (отдельные ряды users)
    const ownersA = await db('users').where({ nursery_id: ctx.nurseryId, role: 'owner' });
    const ownersB = await db('users').where({ nursery_id: nurseryB.id, role: 'owner' });
    expect(ownersA.length).toBe(1);
    expect(ownersB.length).toBe(1);
    expect(ownersA[0].id).not.toBe(ownersB[0].id);
  });
});
```

- Run: `cd backend && npx vitest run tests/multiNurseryRoles.test.js`
- Ожидаемо: зелёный (модель уже per-nursery; тест фиксирует инвариант).

### Шаг 2. Зафиксировать решение в доках

- В `documentation/tasks/CURRENT_TASKS.md` отметить пункт чеклиста:
  `- [x] Решение по ролям: роли сотрудников остаются per-nursery (рекомендация роадмапа) — зафиксировать.`
  и сослаться на этот файл.
- В `documentation/backend-overview.md` (раздел про RBAC/сотрудников) добавить 1-2 предложения:
  «При нескольких питомниках на аккаунте роли — per-nursery; права вычисляются в контексте
  активного питомника (роль из токена). См. `tasks/MultiNurseryRolesDecision.md`.»

### Шаг 3. Коммит

```bash
git add backend/tests/multiNurseryRoles.test.js documentation/tasks/CURRENT_TASKS.md documentation/backend-overview.md documentation/tasks/MultiNurseryRolesDecision.md
git commit -m "docs(v2): зафиксировать per-nursery роли + тест изоляции"
```

## Критерии готовности

- [ ] Решение «роли per-nursery» записано в доках и отмечено в `CURRENT_TASKS.md`.
- [ ] Тест изоляции ролей зелёный.
- [ ] Подтверждено: `requireRole` использует роль активного питомника из токена (без изменений).

## Затронутые файлы

- Create: `backend/tests/multiNurseryRoles.test.js`
- Modify: `documentation/tasks/CURRENT_TASKS.md`, `documentation/backend-overview.md`

## Результаты

**Статус:** реализовано (2026-06-14).

Сделано по плану:
- Решение «роли per-nursery» зафиксировано: этот файл + отметка в `CURRENT_TASKS.md` +
  заметка в `backend-overview.md` (пункт RBAC).
- `backend/tests/multiNurseryRoles.test.js` — тест изоляции: сотрудник питомника A отсутствует
  в списке сотрудников B; владелец — отдельные owner-ряды `users` в каждом питомнике.
- Подтверждено: `requireRole` использует роль активного питомника из токена (без изменений RBAC).

Отклонение от плана: в тесте имя второго питомника изменено с `'B'` на `'Nursery B'` —
`createNurserySchema` требует ≥2 символов (поймано на первом прогоне).

Результат проверки: полный прогон бэкенда — **138/138 зелёные**; ESLint — чисто.
