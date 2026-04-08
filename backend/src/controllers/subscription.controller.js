import * as subscriptionService from '@/services/subscription.service.js';

export async function getCurrent(req, res, next) {
  try {
    const sub = await subscriptionService.getCurrent(req.user.accountId);
    return res.json(sub);
  } catch (err) {
    return next(err);
  }
}

export async function getPlans(_req, res, next) {
  try {
    const plans = await subscriptionService.getPlans();
    return res.json(plans);
  } catch (err) {
    return next(err);
  }
}

export async function changePlan(req, res, next) {
  try {
    const sub = await subscriptionService.changePlan(
      req.user.accountId,
      req.body.planId
    );
    return res.json(sub);
  } catch (err) {
    return next(err);
  }
}
