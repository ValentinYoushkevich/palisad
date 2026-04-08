import * as activityLogService from '@/services/activityLog.service.js';

export async function getLogs(req, res, next) {
  try {
    const result = await activityLogService.getLogs(req.params.nurseryId, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
