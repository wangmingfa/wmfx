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
        v-for="log in logs"
        :key="log.id"
        class="log-line"
      >
        {{ log.text }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const logs = ref<{ id: number, text: string }[]>([])
const logContainer = ref<HTMLElement | null>(null)
/** 日志自增 id，用作 v-for key（下标 key 在持续 push + 截断时会导致整列重渲染/错误复用） */
let logSeq = 0

function addLog(msg: string): void {
  console.debug('[LogView] addLog', msg)
  logs.value.push({ id: ++logSeq, text: msg })
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
