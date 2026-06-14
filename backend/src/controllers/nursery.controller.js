import * as authService from '@/services/auth.service.js';
import * as nurseryService from '@/services/nursery.service.js';

export async function listNurseries(req, res, next) {
  try {
    return res.json(await nurseryService.listNurseries(req.user.accountId));
  } catch (err) {
    return next(err);
  }
}

export async function getMyNursery(req, res, next) {
  try {
    const nursery = await nurseryService.getMyNursery(req.user.accountId, req.user.nurseryId);
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function getNurseryById(req, res, next) {
  try {
    const nursery = await nurseryService.getNurseryById(req.user.accountId, req.params.nurseryId);
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function createNursery(req, res, next) {
  try {
    const nursery = await nurseryService.createNursery(req.user.accountId, req.body);
    await authService.activateNursery(req.user.accountId, nursery.id, res);
    return res.status(201).json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function updateMyNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(
      req.user.accountId,
      req.user.nurseryId,
      req.body
    );
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function updateNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(
      req.user.accountId,
      req.params.nurseryId,
      req.body
    );
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function switchNursery(req, res, next) {
  try {
    const result = await authService.activateNursery(
      req.user.accountId,
      req.params.nurseryId,
      res
    );
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}
