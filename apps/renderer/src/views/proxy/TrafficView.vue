<template>
  <div class="traffic-view">
    <div class="traffic-card">
      <div class="traffic-label">
        Upload
      </div>
      <div class="traffic-value up">
        {{ formatSpeed(trafficUp) }}
      </div>
    </div>
    <div class="traffic-card">
      <div class="traffic-label">
        Download
      </div>
      <div class="traffic-value down">
        {{ formatSpeed(trafficDown) }}
      </div>
    </div>
    <div class="traffic-hint">
      Real-time traffic data will be available when mihomo is running.
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const trafficUp = ref(0)
const trafficDown = ref(0)
let cleanup: (() => void) | null = null

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0)
    return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return `${(bytesPerSec / k ** i).toFixed(1)} ${sizes[i]}`
}

onMounted(() => {
  // Traffic data will be received via broadcast
  // For now, poll via status
  const interval = setInterval(async () => {
    const status = await window.browserAPI.getProxyStatus()
    if (!status.running) {
      trafficUp.value = 0
      trafficDown.value = 0
    }
  }, 2000)

  cleanup = () => clearInterval(interval)
})

onUnmounted(() => {
  cleanup?.()
})
</script>

<style scoped>
.traffic-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.traffic-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.traffic-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.traffic-value {
  font-size: 16px;
  font-weight: 600;
}

.traffic-value.up {
  color: var(--accent-color);
}

.traffic-value.down {
  color: #4caf50;
}

.traffic-hint {
  text-align: center;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 8px;
}
</style>
