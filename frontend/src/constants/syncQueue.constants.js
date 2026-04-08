export const SYNC_QUEUE_TYPES = {
  CREATE_OPERATION: 'create_operation',
  UPDATE_OPERATION: 'update_operation',
  DELETE_OPERATION: 'delete_operation',
  CREATE_MOVEMENT: 'create_movement',
  DELETE_MOVEMENT: 'delete_movement',
  ATTACH_PHOTO: 'attach_photo'
}

export const SYNC_QUEUE_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  FAILED: 'failed',
  DONE: 'done'
}

export const ALLOWED_SYNC_QUEUE_TYPES = Object.values(SYNC_QUEUE_TYPES)
