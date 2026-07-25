import * as licenseCodeService from '@/services/licenseCode.service.js';
import * as planRequestService from '@/services/planRequest.service.js';

export async function issueCodes(req, res, next) {
  try {
    const codes = await licenseCodeService.issueCodes({
      planId: req.body.planId,
      durationDays: req.body.durationDays,
      note: req.body.note,
      count: req.body.count,
      issuedByAccountId: req.user.accountId,
    });
    return res.status(201).json(codes);
  } catch (err) {
    return next(err);
  }
}

export async function listCodes(req, res, next) {
  try {
    const result = await licenseCodeService.listCodes({
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function revokeCode(req, res, next) {
  try {
    const code = await licenseCodeService.revokeCode(req.params.id);
    return res.json(code);
  } catch (err) {
    return next(err);
  }
}

export async function listPlanRequests(req, res, next) {
  try {
    const result = await planRequestService.listRequests({
      status: req.query.status,
      page: req.query.page,
      perPage: req.query.perPage,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function processPlanRequest(req, res, next) {
  try {
    const request = await planRequestService.processRequest(req.params.id);
    return res.json(request);
  } catch (err) {
    return next(err);
  }
}
