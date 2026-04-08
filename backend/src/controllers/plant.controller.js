import * as plantService from '@/services/plant.service.js';
import { plantFiltersSchema } from '@/utils/validators/plant.validators.js';

export async function getPlants(req, res, next) {
  try {
    const filters = plantFiltersSchema.parse(req.query);
    return res.json(await plantService.getPlants(req.params.nurseryId, filters));
  } catch (err) {
    return next(err);
  }
}

export async function getPlantById(req, res, next) {
  try {
    return res.json(
      await plantService.getPlantById(req.params.nurseryId, req.params.id)
    );
  } catch (err) {
    return next(err);
  }
}

export async function findByQr(req, res, next) {
  try {
    return res.json(
      await plantService.findByQr(req.params.nurseryId, req.params.qrCode)
    );
  } catch (err) {
    return next(err);
  }
}

export async function findByNumericCode(req, res, next) {
  try {
    return res.json(
      await plantService.findByNumericCode(req.params.nurseryId, req.params.numericCode)
    );
  } catch (err) {
    return next(err);
  }
}

export async function createPlant(req, res, next) {
  try {
    return res.status(201).json(
      await plantService.createPlant(
        req.params.nurseryId,
        req.user.accountId,
        req.body,
        req.user.userId
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function bulkCreate(req, res, next) {
  try {
    const { count, template } = req.body;
    return res.status(201).json(
      await plantService.bulkCreate(
        req.params.nurseryId,
        req.user.accountId,
        template,
        count
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function updatePlant(req, res, next) {
  try {
    return res.json(
      await plantService.updatePlant(
        req.params.nurseryId,
        req.params.id,
        req.body,
        req.user.userId
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function softDelete(req, res, next) {
  try {
    return res.json(
      await plantService.softDelete(
        req.params.nurseryId,
        req.params.id,
        req.user.userId
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function restore(req, res, next) {
  try {
    return res.json(
      await plantService.restore(req.params.nurseryId, req.params.id, req.user)
    );
  } catch (err) {
    return next(err);
  }
}

export async function addTag(req, res, next) {
  try {
    await plantService.addTag(
      req.params.nurseryId,
      req.params.id,
      req.params.tagId,
      req.user.accountId
    );
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

export async function removeTag(req, res, next) {
  try {
    await plantService.removeTag(req.params.nurseryId, req.params.id, req.params.tagId);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}
