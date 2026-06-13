import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import { generateLabelsPdf } from '@/utils/generateLabelsPdf.js';
import { checkFeature } from '@/utils/planGuards.js';

export async function generateLabels(nurseryId, accountId, plantIds, layout) {
  await checkFeature(accountId, 'feature_qr');

  const rows = await plantRepo.findByNurseryAndIds(nurseryId, plantIds);
  const byId = new Map(rows.map((plant) => [plant.id, plant]));
  const plants = plantIds.map((id) => byId.get(id));
  const missing = plants.some((plant) => !plant);
  if (missing) {
    throw new AppError('Одно или несколько растений не найдены', 404);
  }

  return generateLabelsPdf(plants, layout);
}
