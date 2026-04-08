import {
  ROLES,
  STAFF_ROLES,
  STRUCTURE_ROLES,
  WRITE_ROLES,
} from '@/constants/roles.constants.js';

export const canWrite = (user) => WRITE_ROLES.includes(user.role);
export const canManageStructure = (user) => STRUCTURE_ROLES.includes(user.role);
export const canManageStaff = (user) => STAFF_ROLES.includes(user.role);
export const isOwner = (user) => user.role === ROLES.OWNER;
export const isObserver = (user) => user.role === ROLES.OBSERVER;
