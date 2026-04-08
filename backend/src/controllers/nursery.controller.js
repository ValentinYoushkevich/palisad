import * as nurseryService from '@/services/nursery.service.js';

export async function getMyNursery(req, res, next) {
  try {
    const nursery = await nurseryService.getMyNursery(req.user.accountId);
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function createNursery(req, res, next) {
  try {
    const nursery = await nurseryService.createNursery(req.user.accountId, req.body);
    return res.status(201).json(nursery);
  } catch (err) {
    return next(err);
  }
}

export async function updateNursery(req, res, next) {
  try {
    const nursery = await nurseryService.updateNursery(req.user.accountId, req.body);
    return res.json(nursery);
  } catch (err) {
    return next(err);
  }
}
