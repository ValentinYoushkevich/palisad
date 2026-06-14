# MultiNursery · Plan limit — подключить `plans.nursery_limit` к `checkLimit`

> Этап 1 v2 · задача 2/5. Зависит от [`MultiNurseryBackendCore.md`](MultiNurseryBackendCore.md)
> (снятие 409 и N питомников). Общий дизайн — там же.

## Чего хотим достичь

Лимит питомников по тарифу (`plans.nursery_limit`, столбец уже есть — `init_mvp_schema.js:22`)
проверяется при создании питомника через **единый** хелпер `planGuards.checkLimit` — так же, как
лимит растений/пользователей. Убираем дублирующую локальную проверку `checkNurseryLimit`.

## Текущее состояние (факты по коду)

- `backend/src/services/nursery.service.js:56-71` — собственная функция `checkNurseryLimit(accountId)`
  (дубль логики; молча пропускает при отсутствии подписки).
- `backend/src/utils/planGuards.js:13-23` — общий `checkLimit(accountId, resource, currentCount)`:
  бросает 403 при `currentCount >= plan[resource]`, пропускает при `limit === null`,
  бросает 403 при отсутствии активной подписки.
- `plant.service.js` уже использует `checkLimit` (`grep checkLimit`) — берём как образец.
- Подписка создаётся при регистрации (`auth.service.register` → `subscriptionRepo.create` со
  `status: 'trial'`), поэтому активная подписка есть всегда → перехода на `checkLimit` без регрессий.

## План

### Шаг 1. Тест (TDD) — лимит соблюдается

В `backend/tests/nursery.test.js` добавить блок:

```js
describe('M3 — Лимит питомников по плану', () => {
  it('достигнут лимит питомников → 403', async () => {
    await setFreePlan({ nursery_limit: 1 });
    const ctx = await createOwnerWithNursery(); // уже 1 питомник
    const res = await api()
      .post('/api/nurseries')
      .set('Cookie', ctx.cookie)
      .send({ name: 'Second' });
    expect(res.status).toBe(403);
  });

  it('nursery_limit = null → ограничения нет', async () => {
    await setFreePlan({ nursery_limit: null });
    const ctx = await createOwnerWithNursery();
    const r2 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N2' });
    const r3 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N3' });
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
  });

  it('лимит учитывает текущее число питомников', async () => {
    await setFreePlan({ nursery_limit: 2 });
    const ctx = await createOwnerWithNursery(); // 1
    const r2 = await api().post('/api/nurseries').set('Cookie', ctx.cookie).send({ name: 'N2' });
    expect(r2.status).toBe(201); // 2-й в пределах лимита
    const r3 = await api()
      .post('/api/nurseries')
      .set('Cookie', toCookieHeader(r2.headers['set-cookie']))
      .send({ name: 'N3' });
    expect(r3.status).toBe(403); // 3-й сверх лимита
  });
});
```

(Импорты `setFreePlan`, `toCookieHeader` уже добавлены в задаче 1.)

- Run: `cd backend && npx vitest run tests/nursery.test.js`
- Ожидаемо до рефактора: тесты `null` и «учитывает текущее число» могут пройти на старой логике,
  но цель — закрепить поведение перед заменой на общий хелпер.

### Шаг 2. Рефактор `nursery.service` на общий `checkLimit`

В `backend/src/services/nursery.service.js`:

- добавить импорт: `import { checkLimit } from '@/utils/planGuards.js';`
- удалить локальную функцию `checkNurseryLimit` (строки 56-71) и неиспользуемый после этого
  импорт `subscriptionRepo`, если он больше нигде в файле не нужен (проверить — после удаления
  `checkNurseryLimit` он не используется → убрать строку
  `import * as subscriptionRepo from '@/repositories/subscription.repository.js';`).
- в `createNursery` заменить вызов `await checkNurseryLimit(accountId);` на:

```js
const count = await nurseryRepo.countByAccountId(accountId);
await checkLimit(accountId, 'nursery_limit', count);
```

(`nurseryRepo.countByAccountId` уже существует — `nursery.repository.js:26`.)

### Шаг 3. Проверка

- Run: `cd backend && npx vitest run tests/nursery.test.js` — все зелёные.
- Run: `cd backend && npx vitest run` — регрессий нет.

### Шаг 4. Коммит

```bash
git add backend/src/services/nursery.service.js backend/tests/nursery.test.js
git commit -m "feat(backend): лимит питомников через единый planGuards.checkLimit"
```

## Критерии готовности

- [ ] Создание питомника сверх `nursery_limit` → 403.
- [ ] `nursery_limit = null` → без ограничения.
- [ ] Лимит считается от текущего числа питомников аккаунта (`countByAccountId`).
- [ ] Дубль `checkNurseryLimit` удалён; используется `planGuards.checkLimit`.
- [ ] Тесты бэкенда зелёные.

## Затронутые файлы

- Modify: `backend/src/services/nursery.service.js`
- Test: `backend/tests/nursery.test.js`

## Результаты

**Статус:** реализовано (2026-06-14).

Сделано по плану:
- `nursery.service.createNursery` использует единый
  `checkLimit(accountId, 'nursery_limit', await nurseryRepo.countByAccountId(accountId))`.
- Удалён дубль `checkNurseryLimit` и неиспользуемый импорт `subscriptionRepo`;
  добавлен импорт `checkLimit` из `@/utils/planGuards.js`.
- В `nursery.test.js` — блок «Лимит питомников по плану»: лимит достигнут → 403,
  `nursery_limit = null` → без ограничения, лимит считается от текущего числа питомников.

Результат проверки: полный прогон бэкенда — **137/137 зелёные** (3 новых теста лимита);
ESLint по `nursery.service.js` — чисто. Поведение «нет активной подписки → 403» допустимо:
аккаунт всегда получает trial-подписку при регистрации.
