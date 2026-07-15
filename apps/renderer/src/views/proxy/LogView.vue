<template>
  <div class="log-view">
    <div
      ref="logContainer"
      class="log-container"
    >
      <div
        v-if="logs.length === 0"
        class="empty"
      >
        {{ t('proxy.logsEmpty') }}
      </div>
      <div
        v-for="(log, i) in logs"
        :key="i"
        class="log-line"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const logs = ref<string[]>([])
const logContainer = ref<HTMLElement | null>(null)

function addLog(msg: string): void {
  logs.value.push(msg)
  if (logs.value.length > 200) {
    logs.value = logs.value.slice(-200)
  }
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
}

defineExpose({ addLog })
</script>

<style scoped>
.log-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.log-container {
  flex: 1;
  overflow-y: auto;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  padding: 4px;
  background: var(--bg-primary);
  border-radius: 4px;
}

.log-line {
  color: var(--text-secondary);
  word-break: break-all;
}

.empty {
  text-align: center;
  color: var(--text-secondary);
  padding: 20px;
  font-size: 12px;
}
</style>
