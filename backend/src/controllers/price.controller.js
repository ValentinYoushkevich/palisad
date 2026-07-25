import * as priceService from '@/services/price.service.js';

export async function getPrices(req, res, next) {
  try {
    const rows = await priceService.getPrices(req.params.nurseryId);
    return res.json({ rows });
  } catch (err) {
    return next(err);
  }
}

export async function upsertPrice(req, res, next) {
  try {
    const price = await priceService.upsertPrice(req.params.nurseryId, req.body);
    return res.json(price);
  } catch (err) {
    return next(err);
  }
}

export async function deletePrice(req, res, next) {
  try {
    await priceService.deletePrice(req.params.nurseryId, req.params.id);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}
