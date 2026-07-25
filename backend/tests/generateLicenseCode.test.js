import { describe, expect, it } from 'vitest';

import {
  LICENSE_CODE_ALPHABET,
  generateLicenseCode,
  normalizeLicenseCode,
} from '@/utils/generateLicenseCode.js';

// Маска строго из алфавита: класс символов формируется из самого LICENSE_CODE_ALPHABET,
// поэтому regex отвергает и похожие символы (0 O 1 I), и любой посторонний.
const MASK = new RegExp(`^[${LICENSE_CODE_ALPHABET}]{4}-[${LICENSE_CODE_ALPHABET}]{4}-[${LICENSE_CODE_ALPHABET}]{4}$`);
const FORBIDDEN = ['0', 'O', '1', 'I'];
const LARGE_SAMPLE = 5000;

describe('generateLicenseCode (юнит)', () => {
  it('возвращает строку формата XXXX-XXXX-XXXX (12 значимых символов + 2 дефиса)', () => {
    const code = generateLicenseCode();
    expect(typeof code).toBe('string');
    expect(code).toHaveLength(14);
    expect(code).toMatch(MASK);
    const groups = code.split('-');
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(group).toHaveLength(4);
    }
  });

  it('все символы принадлежат алфавиту на большой выборке', () => {
    const alphabet = new Set(LICENSE_CODE_ALPHABET.split(''));
    for (let i = 0; i < LARGE_SAMPLE; i += 1) {
      const chars = generateLicenseCode().replace(/-/g, '').split('');
      expect(chars).toHaveLength(12);
      for (const ch of chars) {
        expect(alphabet.has(ch)).toBe(true);
      }
    }
  });

  it('ни один из похожих символов 0 O 1 I не встречается на большой выборке', () => {
    for (let i = 0; i < LARGE_SAMPLE; i += 1) {
      const code = generateLicenseCode();
      for (const forbidden of FORBIDDEN) {
        expect(code.includes(forbidden)).toBe(false);
      }
    }
  });

  it('две последовательные генерации различаются', () => {
    expect(generateLicenseCode()).not.toBe(generateLicenseCode());
  });

  it('на большой выборке коллизий нет (санити уникальности)', () => {
    const set = new Set();
    for (let i = 0; i < LARGE_SAMPLE; i += 1) {
      set.add(generateLicenseCode());
    }
    expect(set.size).toBe(LARGE_SAMPLE);
  });
});

describe('normalizeLicenseCode (юнит)', () => {
  const CANONICAL = 'ABCD-EFGH-JKLM';

  it('несколько форм одного кода → один каноничный вид XXXX-XXXX-XXXX', () => {
    const forms = [
      'ABCD-EFGH-JKLM', // уже каноничный
      'abcd-efgh-jklm', // нижний регистр
      'abcd efgh jklm', // пробелы вместо дефисов
      'ABCDEFGHJKLM', // вообще без разделителей
      '  aBcD.eFgH/jKlM  ', // мусорные разделители + смешанный регистр + пробелы
    ];
    for (const form of forms) {
      expect(normalizeLicenseCode(form)).toBe(CANONICAL);
    }
  });

  it('12 значимых символов всегда разбиваются на 3 группы по 4 через дефис', () => {
    const out = normalizeLicenseCode('ABCDEFGHJKLM');
    expect(out).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(out.split('-')).toHaveLength(3);
  });

  it('символы вне алфавита (0 O 1 I и пунктуация) выбрасываются', () => {
    // Вход содержит запрещённые 0/O/1/I и знаки; значимых символов алфавита ровно 12.
    expect(normalizeLicenseCode('ABCD-EFGH-JKLM')).toBe(CANONICAL);
    // O и 0 не входят в алфавит → отбрасываются: остаётся !=12 → возврат как есть (не 12).
    const withForbidden = normalizeLicenseCode('O0O0-O0O0-O0O0');
    expect(withForbidden).not.toContain('-');
    expect(withForbidden).not.toHaveLength(12);
  });

  it('мусор / короткий ввод → результат НЕ длины 12 (гарантированно не найдётся → единый 404)', () => {
    expect(normalizeLicenseCode('')).toBe('');
    expect(normalizeLicenseCode('   ')).not.toHaveLength(12);
    expect(normalizeLicenseCode('ABC')).not.toHaveLength(12); // слишком короткий
    expect(normalizeLicenseCode('ABCD-EFGH-JKLM-NPQR')).not.toHaveLength(12); // слишком длинный
    // Ни в одном из этих случаев дефисы не проставляются.
    expect(normalizeLicenseCode('ABC')).toBe('ABC');
  });

  it('устойчив к не-строковому вводу (null/undefined) → пустая строка', () => {
    expect(normalizeLicenseCode(null)).toBe('');
    expect(normalizeLicenseCode(undefined)).toBe('');
  });
});
