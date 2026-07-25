import { describe, expect, it } from 'vitest';

import { toCsv } from '@/utils/csv.js';

const COLUMNS = [
  { key: 'label', header: 'Группа' },
  { key: 'count', header: 'Списано' },
  { key: 'share', header: 'Доля' },
];

describe('toCsv (юнит)', () => {
  it('начинается с UTF-8 BOM (U+FEFF)', () => {
    const out = toCsv([], COLUMNS);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.startsWith('﻿')).toBe(true);
  });

  it('использует разделитель ; и CRLF; заголовок берётся из header', () => {
    const out = toCsv([{ label: 'A', count: 2, share: 0.5 }], COLUMNS);
    const body = out.slice(1); // отбрасываем BOM
    const lines = body.split('\r\n');
    expect(lines[0]).toBe('Группа;Списано;Доля');
    expect(lines[1]).toBe('A;2;0.5');
    // CRLF как терминатор строк (в т.ч. завершающий).
    expect(out).toContain('\r\n');
    expect(out.endsWith('\r\n')).toBe(true);
  });

  it('числа сериализуются через String(value)', () => {
    const out = toCsv([{ label: 'x', count: 42, share: 0.1234 }], COLUMNS);
    expect(out).toContain('x;42;0.1234');
  });

  it('экранирует значения с ; " и переводом строки (RFC4180: кавычки + удвоение)', () => {
    const rows = [{ label: 'Секция; "A"\nB', count: 1, share: 1 }];
    const out = toCsv(rows, COLUMNS);
    // ; и " и \n → всё поле в кавычках, внутренние " удвоены.
    expect(out).toContain('"Секция; ""A""\nB"');
  });

  it('null/undefined → пустая строка', () => {
    const out = toCsv([{ label: null, count: undefined, share: 0 }], COLUMNS);
    const dataLine = out.slice(1).split('\r\n')[1];
    expect(dataLine).toBe(';;0');
  });
});
