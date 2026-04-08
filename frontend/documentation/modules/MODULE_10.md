# MODULE_10 — Frontend: QR Scanner and Labels

**Зависит от:** MODULE_7

---

## Шаг 1. Установка зависимостей

```bash
npm install @zxing/browser @zxing/library
npm install pdf-lib
```

---

## Шаг 2. QrScanner.vue (переиспользуемый компонент)

`src/components/QrScanner.vue`:

```vue
<template>
  <div class="qr-scanner-wrapper">
    <video ref="videoEl" class="w-full border-round" style="max-height: 300px; object-fit: cover" />
    <div v-if="error" class="text-red-500 mt-2 text-center text-sm">{{ error }}</div>
    <div v-if="isScanning" class="text-center mt-2 text-color-secondary text-sm">
      Наведите камеру на QR-код
    </div>
  </div>
</template>

<script>
import { defineOptions, defineProps, defineEmits, ref, onMounted, onUnmounted } from 'vue';
import { BrowserQRCodeReader } from '@zxing/browser';

defineOptions({ name: 'QrScanner' });

defineProps({ active: { type: Boolean, default: true } });
const emit = defineEmits(['scanned', 'error']);

const videoEl = ref(null);
const isScanning = ref(false);
const error = ref('');
let reader = null;
let controls = null;

onMounted(async () => {
  try {
    reader = new BrowserQRCodeReader();
    isScanning.value = true;
    controls = await reader.decodeFromVideoDevice(undefined, videoEl.value, (result, err) => {
      if (result) {
        emit('scanned', result.getText());
      }
      if (err && !(err.name === 'NotFoundException')) {
        error.value = 'Ошибка камеры';
        emit('error', err);
      }
    });
  } catch (e) {
    error.value = 'Нет доступа к камере';
    emit('error', e);
    isScanning.value = false;
  }
});

onUnmounted(() => {
  controls?.stop();
  isScanning.value = false;
});
</script>
```

---

## Шаг 3. ScannerPage

`src/pages/scanner/ScannerPage.vue`:

```vue
<template>
  <div class="p-4">
    <h2 class="mb-4">Сканирование QR-кода</h2>

    <div v-if="!manualMode">
      <QrScanner @scanned="handleScanned" @error="handleCameraError" />
      <div class="text-center mt-3">
        <Button label="Ввести код вручную" text @click="manualMode = true" />
      </div>
    </div>

    <div v-else class="max-w-md mx-auto">
      <div class="field mb-3">
        <label>Числовой код растения</label>
        <div class="flex gap-2">
          <InputText
            v-model="manualCode"
            class="flex-1"
            placeholder="Введите код..."
            @keyup.enter="handleManualSearch"
          />
          <Button label="Найти" @click="handleManualSearch" :loading="isSearching" />
        </div>
        <small class="text-color-secondary">Код указан на этикетке под QR-кодом</small>
      </div>
      <Button label="Открыть камеру" text @click="manualMode = false" />
    </div>

    <div v-if="notFound" class="text-center mt-4">
      <Message severity="warn">Растение не найдено. Проверьте код или отсканируйте снова.</Message>
    </div>
  </div>
</template>

<script>
import { defineOptions, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePlantsStore } from '@/stores/plants.store.js';
import QrScanner from '@/components/QrScanner.vue';

defineOptions({ name: 'ScannerPage' });

const router = useRouter();
const plants = usePlantsStore();
const manualMode = ref(false);
const manualCode = ref('');
const isSearching = ref(false);
const notFound = ref(false);

async function handleScanned(qrCode) {
  notFound.value = false;
  const plant = await plants.findByQr(qrCode);
  if (plant) {
    router.push(`/plants/${plant.id}`);
  } else {
    notFound.value = true;
  }
}

function handleCameraError() {
  manualMode.value = true;
}

async function handleManualSearch() {
  if (!manualCode.value.trim()) return;
  isSearching.value = true;
  notFound.value = false;
  try {
    const plant = await plants.findByNumericCode(manualCode.value.trim());
    if (plant) {
      router.push(`/plants/${plant.id}`);
    } else {
      notFound.value = true;
    }
  } finally {
    isSearching.value = false;
  }
}
</script>
```

---

## Шаг 4. Генерация PDF этикеток

`src/utils/generateLabels.js`:

```js
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

const A4_W = 595;
const A4_H = 842;
const MARGIN = 20;
const COLS = 4;
const ROWS = 3;
const CELL_W = (A4_W - MARGIN * 2) / COLS;
const CELL_H = (A4_H - MARGIN * 2) / ROWS;
const QR_SIZE = Math.min(CELL_W, CELL_H) * 0.55;

export async function generateLabelsPdf(plants, layout = 'grid') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  if (layout === 'single') {
    for (const plant of plants) {
      const page = doc.addPage([A4_W, A4_H]);
      await drawLabel(doc, page, font, plant, MARGIN, MARGIN, A4_W - MARGIN * 2, A4_H - MARGIN * 2);
    }
  } else {
    const labelsPerPage = COLS * ROWS;
    for (let i = 0; i < plants.length; i++) {
      const pageIndex = Math.floor(i / labelsPerPage);
      const posOnPage = i % labelsPerPage;

      if (posOnPage === 0) {
        doc.addPage([A4_W, A4_H]);
      }

      const page = doc.getPages()[pageIndex];
      const col = posOnPage % COLS;
      const row = Math.floor(posOnPage / COLS);
      const x = MARGIN + col * CELL_W;
      const y = A4_H - MARGIN - (row + 1) * CELL_H;

      await drawLabel(doc, page, font, plants[i], x, y, CELL_W, CELL_H);
    }
  }

  return doc.save();
}

async function drawLabel(doc, page, font, plant, x, y, w, h) {
  // QR-код как PNG
  const qrDataUrl = await QRCode.toDataURL(plant.qr_code, { width: QR_SIZE, margin: 1 });
  const qrBytes = await fetch(qrDataUrl).then(r => r.arrayBuffer());
  const qrImage = await doc.embedPng(qrBytes);

  const qrX = x + (w - QR_SIZE) / 2;
  const qrY = y + h - QR_SIZE - 8;

  page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

  // Числовой код
  page.drawText(plant.numeric_code, {
    x: x + w / 2 - font.widthOfTextAtSize(plant.numeric_code, 9) / 2,
    y: qrY - 14,
    size: 9,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Вид
  const speciesText = plant.display_name_ru || plant.scientific_name || '—';
  const truncated = speciesText.length > 22 ? speciesText.slice(0, 20) + '…' : speciesText;
  page.drawText(truncated, {
    x: x + w / 2 - font.widthOfTextAtSize(truncated, 8) / 2,
    y: qrY - 26,
    size: 8,
    font,
    color: rgb(0, 0, 0),
  });

  // Сорт
  if (plant.variety) {
    page.drawText(plant.variety, {
      x: x + w / 2 - font.widthOfTextAtSize(plant.variety, 7) / 2,
      y: qrY - 38,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // Контейнер
  if (plant.container_code) {
    page.drawText(plant.container_code, {
      x: x + w / 2 - font.widthOfTextAtSize(plant.container_code, 7) / 2,
      y: qrY - 50,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // Рамка ячейки
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });
}
```

---

## Шаг 5. LabelsPage

`src/pages/labels/LabelsPage.vue`:

```vue
<template>
  <div class="p-4">
    <h2 class="mb-4">Печать этикеток</h2>

    <div v-if="!nursery.hasFeature('feature_qr')" class="mb-4">
      <Message severity="warn">Функция доступна на платном тарифе.</Message>
    </div>

    <template v-else>
      <div class="surface-card p-4 border-round mb-4">
        <h3 class="mb-3">Выберите растения</h3>
        <DataTable
          v-model:selection="selectedPlants"
          :value="plants.plants"
          selectionMode="multiple"
          dataKey="id"
          stripedRows
          size="small"
        >
          <Column selectionMode="multiple" style="width: 3rem" />
          <Column field="numeric_code" header="Код" />
          <Column header="Вид / Сорт">
            <template #body="{ data }">
              <div>{{ data.display_name_ru }}</div>
              <div v-if="data.variety" class="text-sm text-color-secondary">{{ data.variety }}</div>
            </template>
          </Column>
          <Column header="Контейнер">
            <template #body="{ data }">{{ data.container_code || '—' }}</template>
          </Column>
        </DataTable>
      </div>

      <div class="flex align-items-center gap-4 mb-4">
        <div>
          <label class="mr-2">Формат:</label>
          <SelectButton v-model="layout" :options="LAYOUT_OPTIONS" optionLabel="label" optionValue="value" />
        </div>
        <div class="text-color-secondary text-sm">
          Выбрано: {{ selectedPlants.length }} растений
        </div>
      </div>

      <Button
        label="Скачать PDF"
        icon="pi pi-download"
        :disabled="!selectedPlants.length"
        :loading="isGenerating"
        @click="handleGenerate"
      />
    </template>
  </div>
</template>

<script>
import { defineOptions, ref, onMounted } from 'vue';
import { usePlantsStore } from '@/stores/plants.store.js';
import { useNurseryStore } from '@/stores/nursery.store.js';
import { generateLabelsPdf } from '@/utils/generateLabels.js';

defineOptions({ name: 'LabelsPage' });

const LAYOUT_OPTIONS = [
  { label: 'Сетка 4×3', value: 'grid' },
  { label: 'Один на лист', value: 'single' },
];

const plants = usePlantsStore();
const nursery = useNurseryStore();
const selectedPlants = ref([]);
const layout = ref('grid');
const isGenerating = ref(false);

onMounted(() => plants.fetchPlants());

async function handleGenerate() {
  isGenerating.value = true;
  try {
    const pdfBytes = await generateLabelsPdf(selectedPlants.value, layout.value);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels_${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    isGenerating.value = false;
  }
}
</script>
```

---

## Критерии приёмки

| # | Проверка | Как проверить |
|---|----------|---------------|
| 1 | QR-сканирование открывает карточку растения | Навести на QR → переход на `/plants/:id` |
| 2 | Ошибка камеры → автопереход в ручной режим | Заблокировать камеру → появляется поле ввода |
| 3 | Числовой код находит растение | Ввести код вручную → найдено |
| 4 | `findByQr` офлайн ищет в Dexie | Отключить сеть, отсканировать известный QR → найдено |
| 5 | PDF содержит QR-код, числовой код, вид, сорт, контейнер | Скачать → открыть в просмотрщике |
| 6 | Сетка 4×3: 12 этикеток на странице | 12 растений → 1 страница PDF |
| 7 | `feature_qr = false` → предупреждение, без кнопки | Войти на `free` → Message вместо формы |
