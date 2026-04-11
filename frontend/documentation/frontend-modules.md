# Palisad MVP - Frontend Modules

**Stack:** Vue 3, PrimeVue, Pinia, Workbox, Dexie.js, zxing-js, pdf-lib, Axios
**Version:** 0.6 (2026-04-11)

## Виды растений (синхронизация с backend)

На сервере таксон хранится в глобальном `species_catalog`, привязка к питомнику — в `nursery_species`. API списка/создания видов отдаёт и принимает поля в **snake_case** (`scientific_name`, `display_name_ru`, `gbif_id` и др.). В формах растений поле **`speciesId`** — это UUID строки справочника питомника (ответ `GET .../species`, по сути `nursery_species.id`). В кэше растений у объекта plant поле **`nursery_species_id`**. Поиск подсказок вида: `GET .../species/search` (локальный каталог + GBIF); сохранение: `POST .../species/attach-by-name` с `scientific_name` и `display_name_ru`.

## Detalized modules
Detalization moved to separate files in `frontend/documentation/modules/`:
- `MODULE_0.md` ... `MODULE_12.md`

## Dependency table
| N | Module | Depends on |
|---|--------|------------|
| 0 | Project Init | - |
| 1 | Dexie Offline Store | 0 |
| 2 | Authentication | 1 |
| 3 | Nursery and Subscription | 2 |
| 4 | Staff | 3 |
| 5 | Locations | 3 |
| 6 | Catalogs | 3 |
| 7 | Plants Registry | 5, 6 |
| 8 | Operations and Photos | 7 |
| 9 | Movements | 7 |
| 10 | QR Scanner and Labels | 7 |
| 11 | Activity Feed | 2 |
| 12 | Offline Synchronization | 7, 8, 9 |

## MVP boundary
MVP includes plants registry, catalogs, operations, movements, labels, activity, offline queue.

## v2 boundary
v2 includes costing, production stages, extended container types, advanced analytics.
