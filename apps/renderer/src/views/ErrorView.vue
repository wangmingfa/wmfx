<template>
  <div class="error-page">
    <div class="error-icon">⚠️</div>
    <h1>{{ title }}</h1>
    <p class="error-desc">{{ description }}</p>
    <p v-if="info" class="error-url">{{ info.requestedUrl }}</p>
    <p v-if="info" class="error-code">{{ info.code }} / {{ info.description }}</p>
    <div v-if="info" class="error-suggestions">
      <p>{{ suggestions }}</p>
    </div>
    <div class="error-actions">
      <NButton v-if="info" type="primary" @click="retry">{{ t('error.retry') }}</NButton>
      <NButton v-else type="primary" @click="goBack">{{ t('error.goBack') }}</NButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const info = ref<{ code: number; description: string; requestedUrl: string } | null>(null)
const title = ref(t('error.title'))
const description = ref(t('error.description'))
const suggestions = ref(t('error.suggestions.default'))

onMounted(async () => {
  try {
    const result = await window.browserAPI.getErrorInfo()
    if (result) {
      info.value = result
      title.value = t('error.title')
      description.value = getFriendlyDescription(result.code)
      suggestions.value = getSuggestions(result.code)
    }
  } catch {
    // 兜底：info 为 null，显示通用错误页
  }
})

function getFriendlyDescription(code: number): string {
  const map: Record<number, string> = {
    [-105]: t('error.codes.-105'),
    [-102]: t('error.codes.-102'),
    [-118]: t('error.codes.-118'),
    [-106]: t('error.codes.-106'),
    [-109]: t('error.codes.-109'),
    [-101]: t('error.codes.-101'),
  }
  return map[code] ?? info.value?.description ?? t('error.description')
}

function getSuggestions(code: number): string {
  const dns = [-105, -109]
  const conn = [-102, -101, -118, -106]
  if (dns.includes(code)) return t('error.suggestions.dns')
  if (conn.includes(code)) return t('error.suggestions.connection')
  return t('error.suggestions.default')
}

function retry(): void {
  window.browserAPI.retry()
}

function goBack(): void {
  window.history.back()
}
</script>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  font-family: inherit;
}
.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.error-desc {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  max-width: 500px;
}
.error-url {
  color: var(--text-muted);
  font-size: 0.875rem;
  word-break: break-all;
  margin-bottom: 0.5rem;
}
.error-code {
  color: var(--text-muted);
  font-size: 0.75rem;
  margin-bottom: 1rem;
}
.error-suggestions {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}
.error-actions {
  display: flex;
  gap: 0.75rem;
}
</style>
