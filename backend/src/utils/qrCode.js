import { nanoid } from 'nanoid';

export function generateQrCode() {
  return `PAL-${nanoid(10).toUpperCase()}`;
}
