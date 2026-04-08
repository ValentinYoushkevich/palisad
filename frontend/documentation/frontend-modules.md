# Palisad MVP - Frontend Modules

**Stack:** Vue 3, PrimeVue, Pinia, Workbox, Dexie.js, zxing-js, pdf-lib, Axios
**Version:** 0.5 (2026-04-08)

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
