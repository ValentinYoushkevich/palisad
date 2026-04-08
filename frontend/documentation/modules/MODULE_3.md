# MODULE_3 - Frontend: Nursery and Subscription

**Зависит от:** MODULE_2

## Описание
Управление питомником, тарифом, feature flags и лимитами.

## Шаги реализации
1. `nursery.store.js` (`fetchNursery`, `createNursery`, `updateNursery`, `fetchSubscription`, `changePlan`).
2. Страницы: `CreateNurseryPage.vue`, `NurserySettingsPage.vue`.
3. UI gating через `hasFeature(feature)`.

## Backend contracts
- `POST /api/nurseries`
- `GET /api/nurseries/my`
- `PATCH /api/nurseries/my`
- `GET /api/subscriptions/current`
- `GET /api/plans`
- `POST /api/subscriptions/change`

## Критерии приемки
- Feature flags корректно включают и выключают UI.
- Смена плана обновляет доступные функции.
