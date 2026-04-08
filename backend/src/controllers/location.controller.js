import * as locationService from '@/services/location.service.js';

export async function getLocations(req, res, next) {
  try {
    const locations = await locationService.getLocations(req.params.nurseryId);
    return res.json(locations);
  } catch (err) {
    return next(err);
  }
}

export async function getLocationsTree(req, res, next) {
  try {
    const tree = await locationService.getLocationsTree(req.params.nurseryId);
    return res.json(tree);
  } catch (err) {
    return next(err);
  }
}

export async function createLocation(req, res, next) {
  try {
    const location = await locationService.createLocation(
      req.params.nurseryId,
      req.body,
      req.user.userId
    );
    return res.status(201).json(location);
  } catch (err) {
    return next(err);
  }
}

export async function updateLocation(req, res, next) {
  try {
    const location = await locationService.updateLocation(
      req.params.nurseryId,
      req.params.id,
      req.body,
      req.user.userId
    );
    return res.json(location);
  } catch (err) {
    return next(err);
  }
}

export async function deleteLocation(req, res, next) {
  try {
    await locationService.deleteLocation(
      req.params.nurseryId,
      req.params.id,
      req.user.userId
    );
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}
