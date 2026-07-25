<template>
  <div class="reportChart">
    <Chart
      v-if="rows.length"
      class="reportChart__canvas"
      :data="chartData"
      :options="chartOptions"
      type="bar"
    />
    <p v-else class="reportChart__empty">Нет данных для графика.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'

defineOptions({ name: 'ReportBarChart' })

const props = defineProps({
  rows: {
    type: Array,
    default: () => []
  },
  metric: {
    type: String,
    required: true
  },
  metricLabel: {
    type: String,
    required: true
  }
})

const chartData = computed(() => ({
  labels: props.rows.map((row) => row.label),
  datasets: [
    {
      label: props.metricLabel,
      data: props.rows.map((row) => row[props.metric]),
      backgroundColor: '#34d399',
      borderRadius: 4
    }
  ]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0
      }
    }
  }
}))
</script>

<style lang="scss" scoped>
.reportChart {
  width: 100%;
}

.reportChart__canvas {
  height: 280px;
}

.reportChart__empty {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
</style>
