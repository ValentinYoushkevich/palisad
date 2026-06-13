# MODULE_4 — Backend: RBAC — роли и права

**Зависит от:** MODULE_3

---

## Шаг 1. Константы ролей

`src/constants/roles.constants.js`:

```js
export const ROLES = {
  OWNER: 'owner',
  AGRONOMIST: 'agronomist',
  WORKER: 'worker',
  OBSERVER: 'observer',
};

// Кто может писать данные (не только читать)
export const WRITE_ROLES = [ROLES.OWNER, ROLES.AGRONOMIST, ROLES.WORKER];

// Кто может управлять структурой питомника (локации, справочники)
export const STRUCTURE_ROLES = [ROLES.OWNER, ROLES.AGRONOMIST];

// Кто может управлять сотрудниками и подпиской
export const STAFF_ROLES = [ROLES.OWNER];
```

---

## Шаг 2. Middleware requireRole

`src/middlewares/requireRole.js`:

```js
import { AppError } from '@/utils/AppError.js';

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Не авторизован', 401));

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Недостаточно прав', 403));
    }

    next();
  };
}
```

---

## Шаг 3. Middleware requireNurseryAccess

Проверяет что `nurseryId` в params совпадает с `nurseryId` из JWT-токена текущего пользователя. Защищает все роуты вида `/api/nurseries/:nurseryId/**`.

`src/middlewares/requireNurseryAccess.js`:

```js
import { AppError } from '@/utils/AppError.js';

export function requireNurseryAccess(req, res, next) {
  const { nurseryId } = req.params;

  if (!nurseryId) return next(new AppError('nurseryId не указан', 400));
  if (req.user.nurseryId !== nurseryId) {
    return next(new AppError('Нет доступа к этому питомнику', 403));
  }

  next();
}
```

---

## Шаг 4. Хелперы прав (используются в сервисах)

`src/utils/rbac.js`:

```js
import { ROLES, WRITE_ROLES, STRUCTURE_ROLES, STAFF_ROLES } from '@/constants/roles.constants.js';

export const canWrite = (user) => WRITE_ROLES.includes(user.role);
export const canManageStructure = (user) => STRUCTURE_ROLES.includes(user.role);
export const canManageStaff = (user) => STAFF_ROLES.includes(user.role);
export const isOwner = (user) => user.role === ROLES.OWNER;
export const isObserver = (user) => user.role === ROLES.OBSERVER;
```

---

## Шаг 5. Подключение middleware в роутах

Начиная с MODULE_5 все роуты с nurseryId используют следующую цепочку:

```js
import { requireAuth } from '@/middlewares/requireAuth.js';
import { requireNurseryAccess } from '@/middlewares/requireNurseryAccess.js';
import { requireRole } from '@/middlewares/requireRole.js';
import { STRUCTURE_ROLES, STAFF_ROLES } from '@/constants/roles.constants.js';

// Базовая защита для всего роутера
router.use(requireAuth, requireNurseryAccess);

// Только для чтения — все роли
router.get('/', controller.getAll);

// Только owner и agronomist
router.post('/', requireRole(...STRUCTURE_ROLES), controller.create);

// Только owner
router.patch('/:id/role', requireRole(...STAFF_ROLES), controller.changeRole);
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | `requireRole` с неподходящей ролью → 403 | Войти как `observer`, попробовать `POST` на защищённый роут |
| 2 | `requireNurseryAccess` с чужим nurseryId → 403 | Подменить `nurseryId` в URL на чужой |
| 3 | Без токена → 401 | Запрос без куки |
| 4 | Хелперы импортируются из `rbac.js` | Проверить что сервисы используют `canWrite`, `canManageStructure` |

Реализовано — критерии 1–3 прогнаны скриптом `backend/scripts/acceptance-check.mjs` (2026-06-12).
Критерий 4 не соответствует реализации: `src/utils/rbac.js` — мёртвый код (нигде не импортируется);
RBAC фактически реализован через middleware `requireRole`/`requireNurseryAccess` и точечные проверки
ролей в сервисах. Роль-токены сотрудников в тестах подписаны напрямую, т.к. staff-логин в API
отсутствует — см. `documentation/tasks/MvpStabilization.md`.
