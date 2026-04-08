# MODULE_2 - Frontend: Authentication

**Зависит от:** MODULE_1

## Описание
Pinia auth store, role getters, login/logout/change-password flow.

## Шаги реализации
1. `auth.store.js`: state/getters/actions.
2. Страницы: `LoginPage.vue`, `ChangePasswordPage.vue`.
3. Router flow для `must_change_password`.

## Backend contracts
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `POST /api/auth/change-password`

## Критерии приемки
- Login создает сессию.
- User с `must_change_password` попадает на `/change-password`.
- Role getters корректны.
