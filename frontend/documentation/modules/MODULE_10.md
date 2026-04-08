# MODULE_10 - Frontend: QR Scanner and Labels

**Зависит от:** MODULE_7

## Описание
QR сканирование и labels PDF generation с fallback по numeric code.

## Шаги реализации
1. `QrScanner.vue` на `zxing-js`.
2. Scan -> `findByQr` -> plant detail.
3. Manual fallback -> `findByNumericCode`.
4. `LabelsPage.vue`: выбор plants, `single/grid`, download PDF.
5. `feature_qr` gating.

## Backend contracts
- `GET .../by-qr/:qrCode`
- `GET .../by-code/:numericCode`
- `POST .../plants/labels`

## Критерии приемки
- Scan открывает правильное растение.
- Numeric fallback работает без камеры.
- PDF содержит QR, numeric code, species, variety, container.
