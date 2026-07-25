import * as planRequestService from '@/services/planRequest.service.js';

export async function create(req, res, next) {
  try {
    const row = await planRequestService.createRequest({
      accountId: req.user.accountId,
      planId: req.body.planId,
      comment: req.body.comment,
    });
    return res.status(201).json(row);
  } catch (err) {
    return next(err);
  }
}

export async function listMy(req, res, next) {
  try {
    const rows = await planRequestService.myRequests(req.user.accountId);
    return res.json(rows);
  } catch (err) {
    return next(err);
  }
}
