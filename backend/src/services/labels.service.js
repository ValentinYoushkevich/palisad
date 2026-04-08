import * as plantRepo from '@/repositories/plant.repository.js';
import { AppError } from '@/utils/AppError.js';
import { generateLabelsPdf } from '@/utils/generateLabelsPdf.js';
import { checkFeature } from '@/utils/planGuards.js';

export async function generateLabels(nurseryId, accountId, plantIds, layout) {
  await checkFeature(accountId, 'feature_qr');

  const plants = await Promise.all(
    plantIds.map((id) => plantRepo.findByNurseryAndId(nurseryId, id))
  );
  const missing = plants.some((plant) => !plant);
  if (missing) {
    throw new AppError('Одно или несколько растений не найдены', 404);
  }

  return generateLabelsPdf(plants, layout);
}
