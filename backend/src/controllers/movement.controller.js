import * as movementService from '@/services/movement.service.js';

export async function getMovements(req, res, next) {
  try {
    return res.json(
      await movementService.getMovements(req.params.nurseryId, req.params.plantId)
    );
  } catch (err) {
    return next(err);
  }
}

export async function createMovement(req, res, next) {
  try {
    const movement = await movementService.createMovement(
      req.params.nurseryId,
      req.params.plantId,
      req.user.userId,
      req.body
    );
    return res.status(201).json(movement);
  } catch (err) {
    return next(err);
  }
}

export async function deleteMovement(req, res, next) {
  try {
    await movementService.deleteMovement(req.params.nurseryId, req.params.id, req.user.role);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}
