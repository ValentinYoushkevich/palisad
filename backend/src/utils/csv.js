// Общий CSV-сериализатор для отчётов (Э1) и будущих выгрузок (§4 export).
// Формат ориентирован на Excel-RU: разделитель ';', перевод строки CRLF и UTF-8 BOM
// в начале, чтобы Excel корректно распознал кодировку и не «поехал» по колонкам.
const BOM = '﻿';
const DELIMITER = ';';
const LINE_TERMINATOR = '\r\n';
// Ячейку нужно экранировать, если она содержит разделитель, кавычку или перевод строки.
const NEEDS_QUOTING = /[;"\n\r]/;

// RFC4180-подобное экранирование одной ячейки: null/undefined → пустая строка,
// числа/прочее → String(value); при наличии спецсимволов оборачиваем в кавычки и
// удваиваем внутренние кавычки. Экспортируется для экранирования отдельных ячеек вне
// табличного toCsv — например строк блок-шапки прайс-листа (Э3).
export function escapeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  if (NEEDS_QUOTING.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}

// rows — массив объектов, columns — массив { key, header }. Заголовок берётся из
// header, значения строк — из row[key]. Возвращает готовую CSV-строку с BOM.
export function toCsv(rows, columns) {
  const headerLine = columns.map((col) => escapeCell(col.header)).join(DELIMITER);
  const dataLines = rows.map((row) =>
    columns.map((col) => escapeCell(row[col.key])).join(DELIMITER)
  );

  return BOM + [headerLine, ...dataLines].join(LINE_TERMINATOR) + LINE_TERMINATOR;
}
