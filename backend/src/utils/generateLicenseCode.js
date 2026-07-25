import { randomInt } from 'node:crypto';

// Алфавит лицензионных кодов: латиница A–Z без похожих O и I плюс цифры 2–9 (без 0 и 1).
// Итого 32 символа. Визуально неоднозначные символы (0/O, 1/I) исключены, чтобы код было
// легко продиктовать и ввести вручную без ошибок.
export const LICENSE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const GROUP_COUNT = 3;
const GROUP_SIZE = 4;

// Генерирует лицензионный код формата XXXX-XXXX-XXXX (3 группы по 4 символа).
// Источник случайности — crypto.randomInt: равномерен по [0, alphabet.length),
// без modulo-bias (внутри rejection sampling).
export function generateLicenseCode() {
  const groups = [];
  for (let g = 0; g < GROUP_COUNT; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i += 1) {
      group += LICENSE_CODE_ALPHABET[randomInt(LICENSE_CODE_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

// Нормализует пользовательский ввод кода к каноничному виду хранения (Э2). Приводит к
// верхнему регистру и оставляет только символы алфавита — так выкидываются пробелы,
// дефисы и любой посторонний ввод. Если значимых символов ровно 12 (GROUP_COUNT*GROUP_SIZE),
// возвращает 'XXXX-XXXX-XXXX' — ровно тот формат, в котором generateLicenseCode хранит код.
// Иначе возвращает очищенную строку как есть: она гарантированно не совпадёт ни с одним
// хранимым кодом → активация отдаст единый 404 без оракула «длина неверна».
export function normalizeLicenseCode(raw) {
  const cleaned = String(raw ?? '')
    .toUpperCase()
    .split('')
    .filter((ch) => LICENSE_CODE_ALPHABET.includes(ch))
    .join('');
  if (cleaned.length !== GROUP_COUNT * GROUP_SIZE) {
    return cleaned;
  }
  const groups = [];
  for (let g = 0; g < GROUP_COUNT; g += 1) {
    groups.push(cleaned.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE));
  }
  return groups.join('-');
}
