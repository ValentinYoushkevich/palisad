import * as staffService from '@/services/staff.service.js';

export async function getUsers(req, res, next) {
  try {
    const users = await staffService.getUsers(req.params.nurseryId, req.query);
    return res.json(users);
  } catch (err) {
    return next(err);
  }
}

export async function getUserById(req, res, next) {
  try {
    const user = await staffService.getUserById(req.params.nurseryId, req.params.id);
    return res.json(user);
  } catch (err) {
    return next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const user = await staffService.createUser(
      req.params.nurseryId,
      req.user.accountId,
      req.body,
      req.user.userId
    );
    return res.status(201).json(user);
  } catch (err) {
    return next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const user = await staffService.updateUser(
      req.params.nurseryId,
      req.params.id,
      req.body
    );
    return res.json(user);
  } catch (err) {
    return next(err);
  }
}

export async function changeRole(req, res, next) {
  try {
    const user = await staffService.changeRole(
      req.params.nurseryId,
      req.params.id,
      req.body.role,
      req.user.userId
    );
    return res.json(user);
  } catch (err) {
    return next(err);
  }
}

export async function toggleStatus(req, res, next) {
  try {
    const user = await staffService.toggleStatus(
      req.params.nurseryId,
      req.params.id,
      req.user.userId
    );
    return res.json(user);
  } catch (err) {
    return next(err);
  }
}
