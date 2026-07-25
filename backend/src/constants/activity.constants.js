export const EVENT_TYPES = {
  PLANT_CREATED: 'plant.created',
  PLANT_UPDATED: 'plant.updated',
  PLANT_DELETED: 'plant.deleted',
  PLANT_RESTORED: 'plant.restored',
  PLANT_STATUS_CHANGED: 'plant.status_changed',

  OPERATION_CREATED: 'operation.created',
  OPERATION_DELETED: 'operation.deleted',
  PHOTO_ATTACHED: 'photo.attached',

  MOVEMENT_ARRIVAL: 'movement.arrival',
  MOVEMENT_SALE: 'movement.sale',
  MOVEMENT_WRITE_OFF: 'movement.write_off',
  MOVEMENT_TRANSFER: 'movement.transfer',

  LOCATION_CREATED: 'location.created',
  LOCATION_UPDATED: 'location.updated',
  LOCATION_DELETED: 'location.deleted',

  USER_CREATED: 'user.created',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ROLE_CHANGED: 'user.role_changed',

  AUTH_LOGIN: 'auth.login',

  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
};

export const ENTITY_TYPES = {
  PLANT: 'plant',
  OPERATION: 'operation',
  MOVEMENT: 'movement',
  LOCATION: 'location',
  USER: 'user',
  SUBSCRIPTION: 'subscription',
};
