import db from '@/config/knex.js';
import * as licenseCodeRepo from '@/repositories/licenseCode.repository.js';
import { AppError } from '@/utils/AppError.js';
import { generateLicenseCode } from '@/utils/generateLicenseCode.js';
import { parsePagination } from '@/utils/validators/pagination.validators.js';

const UNIQUE_VIOLATION = '23505';
const MAX_CODE_ATTEMPTS = 5;

// Вставляет один код, обрабатывая коллизию UNIQUE(code). Коллизия при 32^12 комбинациях
// практически невозможна, но retry защищает от неё честно. Внутри транзакции первый же
// сбойный INSERT переводит её в aborted-состояние (Postgres), поэтому каждую попытку
// оборачиваем в SAVEPOINT (knex nested transaction): при 23505 откатываем только вставку
// и пробуем новый код, не роняя внешнюю транзакцию. Не-unique-ошибки пробрасываем.
async function insertUniqueCode(trx, data) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await trx.transaction((sp) =>
        licenseCodeRepo.create({ ...data, code: generateLicenseCode() }, sp)
      );
    } catch (err) {
      if (err?.code !== UNIQUE_VIOLATION) {
        throw err;
      }
      lastErr = err;
    }
  }
  throw lastErr;
}

// Э3: выпуск партии лицензионных кодов платформенным админом. План должен существовать
// (активность не требуем — админ вправе выпустить код под любой существующий план).
// Все count кодов выпускаются в одной транзакции: partial-fail не оставит «половину».
//
// Аудит в activity_logs НАМЕРЕННО НЕ пишем: activity_logs.nursery_id NOT NULL, а у
// платформенного админа нет nursery-контекста. Аудит админ-операций — вне скоупа Э3
// (нужна отдельная таблица без обязательного nursery_id). Фичу ради лога не роняем.
export async function issueCodes({ planId, durationDays, note, count, issuedByAccountId }) {
  const plan = await db('plans').where({ id: planId }).first();
  if (!plan) {
    throw new AppError('План не найден', 404);
  }

  return db.transaction(async (trx) => {
    const rows = [];
    for (let i = 0; i < count; i += 1) {
      const row = await insertUniqueCode(trx, {
        plan_id: planId,
        duration_days: durationDays,
        note: note ?? null,
        issued_by_account_id: issuedByAccountId,
        status: 'issued',
      });
      rows.push(row);
    }
    return rows;
  });
}

// Э3: постраничный список кодов с email активировавшего. total — по тому же фильтру статуса.
export async function listCodes({ status, page, perPage }) {
  const { page: p, perPage: pp } = parsePagination({ page, perPage });
  const [data, total] = await Promise.all([
    licenseCodeRepo.listDetailedByStatus({ status, limit: pp, offset: (p - 1) * pp }),
    licenseCodeRepo.countByStatus({ status }),
  ]);
  return { data, total, page: p, perPage: pp };
}

// Э3: отзыв кода. revokeById атомарно переводит issued → revoked (UPDATE ... WHERE
// status='issued'); undefined = 0 строк (не найден / уже activated / уже revoked) → 409.
export async function revokeCode(id) {
  const row = await licenseCodeRepo.revokeById(id);
  if (!row) {
    throw new AppError('Код нельзя отозвать (не найден или уже использован/отозван)', 409);
  }
  return row;
}
