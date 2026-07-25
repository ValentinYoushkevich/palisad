import * as containerTypeRepo from '@/repositories/containerType.repository.js';
import * as nurserySpeciesRepo from '@/repositories/nurserySpecies.repository.js';
import * as priceRepo from '@/repositories/speciesPrice.repository.js';
import { AppError } from '@/utils/AppError.js';

// Прайс-лист питомника (v3, Э1 «Экспорт»). Управление ценами доступно на ЛЮБОМ тарифе —
// feature_export здесь НЕ проверяется. Гейт checkFeature(accountId, 'feature_export')
// (throws AppError(403)) навешивается на ЭКСПОРТ CSV прайс-листа в Э2/Э3, а не на само
// управление ценами.

export function getPrices(nurseryId) {
  return priceRepo.findAllByNursery(nurseryId);
}

export async function upsertPrice(nurseryId, { speciesId, containerId, price }) {
  // Вид должен принадлежать питомнику (nursery-scoped lookup). Составной FK в БД это
  // тоже гарантирует, но явная проверка даёт осмысленный 404 вместо ошибки констрейнта.
  const species = await nurserySpeciesRepo.findById(nurseryId, speciesId);
  if (!species) {
    throw new AppError('Вид не найден в этом питомнике', 404);
  }

  // Контейнер валиден, если он собственный (nursery_id = nurseryId) ИЛИ системный
  // (nursery_id IS NULL) — паттерн B5, реализованный в containerType.repository.findById.
  const container = await containerTypeRepo.findById(nurseryId, containerId);
  if (!container) {
    throw new AppError('Тип контейнера не найден', 404);
  }

  return priceRepo.upsert({
    nurseryId,
    nurserySpeciesId: speciesId,
    containerTypeId: containerId,
    price,
  });
}

export async function deletePrice(nurseryId, id) {
  const deleted = await priceRepo.deleteByNurseryAndId(nurseryId, id);
  if (deleted === 0) {
    throw new AppError('Цена не найдена', 404);
  }
}
