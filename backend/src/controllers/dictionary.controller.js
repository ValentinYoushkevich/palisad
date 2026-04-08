import * as dictionaryService from '@/services/dictionary.service.js';

export async function getSpecies(req, res, next) {
  try {
    return res.json(await dictionaryService.getSpecies(req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function searchSpecies(req, res, next) {
  try {
    return res.json(
      await dictionaryService.searchSpecies(req.params.nurseryId, req.query.q ?? '')
    );
  } catch (err) {
    return next(err);
  }
}

export async function createSpecies(req, res, next) {
  try {
    const result = await dictionaryService.createSpecies(req.params.nurseryId, req.body);
    return res.status(result.alreadyExists ? 200 : 201).json(result);
  } catch (err) {
    return next(err);
  }
}

export async function updateSpecies(req, res, next) {
  try {
    return res.json(
      await dictionaryService.updateSpecies(
        req.params.nurseryId,
        req.params.id,
        req.body
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteSpecies(req, res, next) {
  try {
    return res.json(await dictionaryService.deleteSpecies(req.params.nurseryId, req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function getTags(req, res, next) {
  try {
    return res.json(await dictionaryService.getTags(req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function createTag(req, res, next) {
  try {
    return res
      .status(201)
      .json(await dictionaryService.createTag(req.params.nurseryId, req.user.accountId, req.body));
  } catch (err) {
    return next(err);
  }
}

export async function updateTag(req, res, next) {
  try {
    return res.json(
      await dictionaryService.updateTag(req.params.nurseryId, req.params.id, req.body)
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteTag(req, res, next) {
  try {
    return res.json(await dictionaryService.deleteTag(req.params.nurseryId, req.params.id));
  } catch (err) {
    return next(err);
  }
}

export async function getMovementTypes(req, res, next) {
  try {
    return res.json(await dictionaryService.getMovementTypes(req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function createMovementType(req, res, next) {
  try {
    return res
      .status(201)
      .json(await dictionaryService.createMovementType(req.params.nurseryId, req.body));
  } catch (err) {
    return next(err);
  }
}

export async function updateMovementType(req, res, next) {
  try {
    return res.json(
      await dictionaryService.updateMovementType(
        req.params.nurseryId,
        req.params.id,
        req.body
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteMovementType(req, res, next) {
  try {
    return res.json(
      await dictionaryService.deleteMovementType(req.params.nurseryId, req.params.id)
    );
  } catch (err) {
    return next(err);
  }
}

export async function getContainerTypes(req, res, next) {
  try {
    return res.json(await dictionaryService.getContainerTypes(req.params.nurseryId));
  } catch (err) {
    return next(err);
  }
}

export async function createContainerType(req, res, next) {
  try {
    return res
      .status(201)
      .json(await dictionaryService.createContainerType(req.params.nurseryId, req.body));
  } catch (err) {
    return next(err);
  }
}

export async function updateContainerType(req, res, next) {
  try {
    return res.json(
      await dictionaryService.updateContainerType(
        req.params.nurseryId,
        req.params.id,
        req.body
      )
    );
  } catch (err) {
    return next(err);
  }
}

export async function deleteContainerType(req, res, next) {
  try {
    return res.json(
      await dictionaryService.deleteContainerType(req.params.nurseryId, req.params.id)
    );
  } catch (err) {
    return next(err);
  }
}
