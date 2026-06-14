import * as stageService from '@/services/productionStage.service.js';

export async function getStages(req, res, next) {
  try {
    return res.json(await stageService.getStages(req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function createStage(req, res, next) {
  try {
    return res.status(201).json(await stageService.createStage(req.params.nurseryId, req.body));
  } catch (err) {
    return next(err);
  }
}

export async function updateStage(req, res, next) {
  try {
    return res.json(
      await stageService.updateStage(req.params.nurseryId, req.params.id, req.body)
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteStage(req, res, next) {
  try {
    return res.json(await stageService.deleteStage(req.params.nurseryId, req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function getLaborNorms(req, res, next) {
  try {
    return res.json(
      await stageService.getLaborNorms(req.params.nurseryId, { stageId: req.query.stageId })
    );
  } catch (err) {
    return next(err);
  }
}

export async function createLaborNorm(req, res, next) {
  try {
    return res
      .status(201)
      .json(await stageService.createLaborNorm(req.params.nurseryId, req.body));
  } catch (err) {
    return next(err);
  }
}

export async function updateLaborNorm(req, res, next) {
  try {
    return res.json(
      await stageService.updateLaborNorm(req.params.nurseryId, req.params.id, req.body)
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteLaborNorm(req, res, next) {
  try {
    await stageService.deleteLaborNorm(req.params.nurseryId, req.params.id);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}
