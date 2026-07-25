# План реализации: Отчёты и аналитика (v3 §1)

**Статус:** ✅ РЕАЛИЗОВАНО (2026-07-25, Э1–Э5). Все 3 отчёта (write-offs, stock-flow,
labor-cost) + CSV-выгрузка (UTF-8 BOM, `;`) реализованы; бэкенд-сьют 410 тестов, coverage
95.57% stmts / 88.06% branch; фронт-страница «Отчёты» готова (82 фронт-теста); живая приёмка
`MODULE 17` в acceptance-check.mjs — PASS (6/6). **Зависимости:** нет (read-only поверх текущей схемы).
**Оценка объёма:** backend ~5 файлов новых, frontend ~4; миграций БД — 0.

---

## Связь с v2-роадмапом (v2-roadmap-proposal.md)

Этот план реализует **этап 5.1** роадмапа (базовые агрегаты без новых сущностей) и часть
**5.2** (план/факт по нормам — в виде нормо-часов). Роадмап явно допускает их до этапа 4.
**Разграничение с этапом 4 «Себестоимость»:** labor-cost здесь — нормо-минуты/часы, БЕЗ
денег. Деньги (материалы, ставки, накладные, отпад-перераспределение, `cost_entries`/
`accumulated_cost`) — это будущий этап 4 роадмапа; когда он придёт, отчёт labor-cost
расширится колонками стоимости поверх `cost_entries`, текущие сущности не меняются.
Финансовая аналитика (этап 5.3 — рентабельность) — только после этапа 4.

## Скоуп

Три отчёта: «Отпад», «Себестоимость (нормо-часы)», «Движение остатков». Только чтение,
онлайн-фича (без офлайн-очереди), RBAC owner/agronomist, строго nursery-scoped. CSV-выгрузка —
общим параметром `?format=csv` (задел под §4 «Экспорт»).

Вне скоупа этой итерации: графики сложнее простых (bar/line), materialized views, стоимость
нормо-часа в деньгах (фаза 2), отчёты для observer.

---

## Источники данных (по фактической схеме)

| Отчёт | Таблицы | Ключевые поля |
|---|---|---|
| Отпад | `movements` + `movement_types` + `plants` (+`nursery_species`, `production_stages`, `locations`) | `movement_types.sets_status = 'written_off'`, `movements.created_at`, `plants.stage_id/nursery_species_id/location_id` |
| Себестоимость | `operations` + `plant_stage_history` + `stage_labor_norms` + `plants` | `operations.type/created_at`, `stage_labor_norms(stage_id, operation_type) → norm_minutes` |
| Остатки | `plants` + `movements` + `movement_types` | `plants.status/created_at/deleted_at`, `sets_status IN ('sold','written_off')`, `from/to_location_id` |

Индексы: горячие уже есть (D6: `plants(nursery_id, created_at)`, D10: FK movements). Новых не
предвидится; если EXPLAIN покажет проблему — добавим точечно в этой же итерации.

---

## API (контракты)

Все — `GET /api/nurseries/:nurseryId/reports/...`, под `requireAuth` + `requireNurseryAccess` +
`requireRole(...STRUCTURE_ROLES)`. Параметры валидируются Zod; период обязателен, максимум 2
года (`dateFrom`, `dateTo`); `format=json|csv` (default json).

### 1. `GET .../reports/write-offs`

Параметры: `dateFrom`, `dateTo`, `groupBy` = `location | species | stage | month |
movementType` (default `month`).

`movementType` — разрез по причинам списания: питомник заводит свои типы движений с
`sets_status='written_off'` («умерло», «брак», «утилизация»...), отчёт группирует по типу
движения (системный `write_off` — корзина «без причины»). Механизм пользовательских типов
уже существует — только groupBy.

Ответ (json):
```json
{
  "period": { "from": "...", "to": "..." },
  "totalWrittenOff": 120,
  "openingCount": 1500,
  "rate": 0.08,
  "rows": [
    { "key": "<id|месяц>", "label": "Секция А / Туя западная / 2026-03", "count": 17, "share": 0.14 }
  ]
}
```
`openingCount` — число активных растений на `dateFrom` (created_at ≤ from, не
проданы/списаны/удалены к from). `rate = totalWrittenOff / openingCount`.

### 2. `GET .../reports/labor-cost`

Параметры: `dateFrom`, `dateTo`, `groupBy` = `species | stage` (default `species`).

Логика: для каждой операции периода определяем стадию растения **на момент операции** —
последняя запись `plant_stage_history` с `created_at <= operations.created_at` (нет записи →
текущая `plants.stage_id`; нет и её → «без стадии»). Затем `stage_labor_norms` по
`(stage_id, operation_type)` → `norm_minutes`; нет нормы → операция в счётчик
`operationsWithoutNorm`, минуты 0.

Ответ:
```json
{
  "period": { "...": "..." },
  "totalMinutes": 84300,
  "operationsCount": 2100,
  "operationsWithoutNorm": 340,
  "rows": [
    { "key": "<speciesId>", "label": "Туя западная", "minutes": 41200, "operations": 980, "plants": 410, "minutesPerPlant": 100.5 }
  ]
}
```

### 3. `GET .../reports/stock-flow`

Параметры: `dateFrom`, `dateTo`, `groupBy` = `location | species | stage` (default `species`).

Формула на группу: `opening + inflow − sold − writtenOff ± transfersNet = closing`.
- `opening/closing` — активные растения на границах периода (по `created_at`, статусным
  движениям и `deleted_at`);
- `inflow` — созданные в периоде (bulk и single; `arrival`-движение отдельно не считаем —
  создание растения и есть приход);
- `sold/writtenOff` — движения периода с соответствующим `sets_status`;
- `transfersNet` — только при `groupBy=location`: (входящие − исходящие) `transfer`-движения
  группы.

Ответ: `rows: [{ key, label, opening, inflow, sold, writtenOff, transfersNet, closing }]` +
итоговая строка.

Контрольное свойство (тестируем): `closing = opening + inflow − sold − writtenOff ±
transfersNet` для каждой строки.

### CSV (`?format=csv`)

Те же данные плоской таблицей: `Content-Type: text/csv; charset=utf-8`, UTF-8 **с BOM**,
разделитель `;` (Excel-RU), `Content-Disposition: attachment; filename="write-offs_2026-01.csv"`.
Реализация — общий хелпер `toCsv(rows, columns)` в utils (переиспользуется §4-экспортом).

---

## Файлы

Backend (паттерн router → controller → service → repository, как везде):
- `src/routes/report.router.js` — 3 роута, `requireAuth`/`requireNurseryAccess`/`requireRole`,
  `validate(reportQuerySchema)`; маунт в `app.js` под `/api/nurseries/:nurseryId/reports`.
- `src/controllers/report.controller.js` — парсинг query, ветка json/csv.
- `src/services/report.service.js` — логика трёх отчётов (стадия-на-момент, формулы, шары).
- `src/repositories/report.repository.js` — SQL-агрегаты (Knex, groupBy/joins; без raw где
  можно).
- `src/utils/validators/report.validators.js` — Zod: `dateFrom/dateTo` (ISO, from ≤ to,
  диапазон ≤ 2 лет), `groupBy` enum по отчёту, `format` enum.
- `src/utils/csv.js` — `toCsv` + BOM/escaping (`;`, кавычки, переводы строк).

Frontend:
- `src/pages/reports/ReportsPage.vue` — вкладки трёх отчётов: фильтры (период, groupBy),
  таблица (PrimeVue DataTable), простой bar-chart (PrimeVue Chart), кнопка «Скачать CSV»
  (обычная ссылка с параметрами — стрим отдаёт браузер).
- `src/stores/reports.store.js` — fetch трёх отчётов, состояние loading/error; офлайн →
  сразу `{ok:false, offline:true}`, страница показывает заглушку «Отчёты доступны онлайн».
- Роут `/reports` (meta: роли owner/agronomist) + пункт меню в `AppLayout.vue`.
- В Dexie ничего не кэшируем.

---

## Этапы

Все этапы Э1–Э5 выполнены ✅ (2026-07-25).

1. **Э1 — write-offs вертикально** (validators → repo → service → controller → router →
   тесты → страница с одной вкладкой). Прогоняет весь каркас: маунт роутера, RBAC, Zod,
   CSV-хелпер. После Э1 — контрольная точка: посмотреть руками, согласовать вид ответа.
2. **Э2 — stock-flow** (самый ценный, формула + контрольное свойство).
3. **Э3 — labor-cost** (самый хитрый — стадия-на-момент; отдельная функция с юнит-тестом).
4. **Э4 — frontend**: страница с тремя вкладками, стор, меню, CSV-кнопки.
5. **Э5 — приёмка**: блок M17 в `acceptance-check.mjs` (создать данные → все 3 отчёта
   сходятся), README-строка.

Каждый этап — зелёный прогон backend + frontend + линт.

## Тесты

Backend (`tests/reports.test.js`):
- фикстура: питомник, 2 вида, 2 локации, стадии + нормы; создать/переместить/продать/списать
  растения с контролируемыми датами (вставка движений напрямую в БД для дат в прошлом);
- write-offs: количества/шары/группировки, пустой период → нули;
- stock-flow: контрольное свойство по каждой строке, transfersNet при groupBy=location;
- labor-cost: стадия-на-момент (операция до/после смены стадии → разные нормы),
  operationsWithoutNorm;
- RBAC: worker/observer → 403; чужой nurseryId → 403/404;
- валидация: from>to → 400, диапазон >2 лет → 400, мусорный groupBy → 400;
- CSV: BOM, `;`, экранирование `;`/кавычек в label, Content-Disposition.

Frontend (vitest): стор — успех/ошибка/офлайн-заглушка.

## Критерии приёмки

- Три отчёта отвечают < 1 с на 10k растений / 50k движений (проверить EXPLAIN на самых
  тяжёлых запросах).
- stock-flow сходится (контрольное свойство) на приёмочных данных.
- CSV открывается в Excel без кракозябр (BOM) и разъезжания колонок.
- Изоляция: данные чужого питомника не попадают ни в один отчёт (тест).
- Покрытие не падает ниже порогов 90/80.

## Решения (утверждено 2026-07-24)

1. **Причины списания** — да, разрез по типам движений: `groupBy=movementType` в write-offs
   (внесено в контракт выше). Пользовательские типы с `sets_status='written_off'` = причины.
2. **labor-cost** — только агрегаты по виду/стадии. Детализация до экземпляра — фаза 2 по
   запросу клиентов.
3. **Графики** — таблицы + один bar-chart по строкам активного отчёта (PrimeVue Chart).
   Линии динамики — позже.
