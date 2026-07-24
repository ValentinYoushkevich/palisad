import * as operationService from '@/services/operation.service.js';

export async function getOperations(req, res, next) {
  try {
    return res.json(
      await operationService.getOperations(req.params.nurseryId, req.params.plantId)
    );
  } catch (err) {
    return next(err);
  }
}

export async function createOperation(req, res, next) {
  try {
    const operation = await operationService.createOperation({
      nurseryId: req.params.nurseryId,
      plantId: req.params.plantId,
      userId: req.user.userId,
      accountId: req.user.accountId,
      data: req.body,
    });
    return res.status(201).json(operation);
  } catch (err) {
    return next(err);
  }
}

export async function updateOperation(req, res, next) {
  try {
    return res.json(
      await operationService.updateOperation({
        nurseryId: req.params.nurseryId,
        plantId: req.params.plantId,
        id: req.params.id,
        userId: req.user.userId,
        data: req.body,
      })
    );
  } catch (err) {
    return next(err);
  }
}

export async function softDelete(req, res, next) {
  try {
    await operationService.softDelete({
      nurseryId: req.params.nurseryId,
      plantId: req.params.plantId,
      id: req.params.id,
      userId: req.user.userId,
      userRole: req.user.role,
    });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

export async function attachPhoto(req, res, next) {
  try {
    const photo = await operationService.attachPhoto({
      nurseryId: req.params.nurseryId,
      plantId: req.params.plantId,
      operationId: req.params.id,
      accountId: req.user.accountId,
      url: req.body.url,
    });
    return res.status(201).json(photo);
  } catch (err) {
    return next(err);
  }
}

export async function deletePhoto(req, res, next) {
  try {
    await operationService.deletePhoto(
      req.params.nurseryId,
      req.params.plantId,
      req.params.id,
      req.params.photoId
    );
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}
