<template>
  <div class="traffic-view">
    <div class="traffic-card">
      <div class="traffic-label">
        {{ t('proxy.upload') }}
      </div>
      <div class="traffic-value up">
        {{ formatSpeed(trafficUp) }}
      </div>
    </div>
    <div class="traffic-card">
      <div class="traffic-label">
        {{ t('proxy.download') }}
      </div>
      <div class="traffic-value down">
        {{ formatSpeed(trafficDown) }}
      </div>
    </div>
    <div class="traffic-hint">
      {{ statusText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const trafficUp = ref(0)
const trafficDown = ref(0)

const statusText = ref(t('proxy.trafficIdle'))

const ZOOM_LEVELS = ['B/s', 'KB/s', 'MB/s', 'GB/s']

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  const k = 1024
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  const idx = i < ZOOM_LEVELS.length ? i : ZOOM_LEVELS.length - 1
  return `${(bytesPerSec / k ** idx).toFixed(1)} ${ZOOM_LEVELS[idx]}`
}

let unsubscribeTraffic: (() => void) | null = null
let statusInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  console.debug('[TrafficView] onMounted: 注册流量监听与状态轮询')
  unsubscribeTraffic = () => {
    window.browserAPI.removeListener('proxy:traffic', null as never)
  }
  window.browserAPI.onProxyTraffic((data: { up: number; down: number }) => {
    trafficUp.value = data.up
    trafficDown.value = data.down
    statusText.value = t('proxy.trafficRunning')
  })

  // 初始状态检查
  statusInterval = setInterval(async () => {
    const status = await window.browserAPI.getProxyStatus()
    if (!status.running) {
      trafficUp.value = 0
      trafficDown.value = 0
      statusText.value = t('proxy.trafficIdle')
    }
  }, 5000)
})

onUnmounted(() => {
  console.debug('[TrafficView] onUnmounted: 注销监听与轮询')
  unsubscribeTraffic?.()
  if (statusInterval) clearInterval(statusInterval)
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
