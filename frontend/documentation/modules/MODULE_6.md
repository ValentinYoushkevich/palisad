# MODULE_6 - Frontend: Catalogs

**Зависит от:** MODULE_3

## Описание
4 catalogs: `species`, `tags`, `movement_types`, `container_types`.

## Шаги реализации
1. Создать stores: `species`, `tags`, `movementTypes`, `containerTypes`.
2. `CatalogPage.vue` + dialogs.
3. GBIF search flow (`/species/search?q=`) с debounce.
4. Защита system entries (`is_system=true`).
5. `feature_tags` gating для tags.

## Backend contracts
- Species/Tags/MovementTypes/ContainerTypes CRUD endpoints.

## Критерии приемки
- `alreadyExists` по GBIF корректно обрабатывается.
- System types не редактируются.
- Tags блокируются на free.
