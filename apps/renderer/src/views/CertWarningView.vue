<template>
  <div class="cert-warning-page">
    <div class="cert-icon">🔒</div>
    <h1>{{ t('certWarning.title') }}</h1>
    <p class="cert-desc">{{ t('certWarning.description') }}</p>
    <p v-if="info" class="cert-url">{{ info.requestedUrl }}</p>
    <p v-if="info" class="cert-error">{{ info.errorText }}</p>

    <div v-if="showDetails && info" class="cert-details">
      <p>
        <strong>{{ t('certWarning.host') }}:</strong>
        {{ info.host }}
      </p>
      <p>
        <strong>{{ t('certWarning.error') }}:</strong>
        {{ info.errorText }}
      </p>
    </div>

    <div class="cert-actions">
      <NButton @click="goBack">{{ t('certWarning.goBack') }}</NButton>
      <NButton @click="showDetails = !showDetails">
        {{ showDetails ? t('certWarning.hideDetails') : t('certWarning.showDetails') }}
      </NButton>
      <div class="continue-section">
        <NButton type="error" @click="showTrustOptions = !showTrustOptions">
          {{ t('certWarning.continueAnyway') }}
        </NButton>
        <div v-if="showTrustOptions" class="trust-options">
          <NButton size="small" @click="trustAndContinue('once')">{{ t('certWarning.trustOnce') }}</NButton>
          <NButton size="small" @click="trustAndContinue('session')">{{ t('certWarning.trustSession') }}</NButton>
          <NButton size="small" @click="trustAndContinue('always')">{{ t('certWarning.trustAlways') }}</NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton } from 'naive-ui'
import { onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const info = ref<{ host: string; errorText: string; requestedUrl: string } | null>(null)
const showDetails = ref(false)
const showTrustOptions = ref(false)

onMounted(async () => {
  try {
    info.value = await window.browserAPI.getCertWarningInfo()
  } catch {
    // 兜底
  }
})

function goBack(): void {
  window.history.back()
}

async function trustAndContinue(scope: 'once' | 'session' | 'always'): Promise<void> {
  await window.browserAPI.trustCertAndContinue(scope)
}
</script>

<style scoped>
.cert-warning-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  font-family: inherit;
}
.cert-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}
h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.cert-desc {
  color: var(--text-secondary);
  margin-bottom: 1rem;
  max-width: 500px;
}
.cert-url {
  color: var(--text-muted);
  font-size: 0.875rem;
  word-break: break-all;
  margin-bottom: 0.5rem;
}
.cert-error {
  color: var(--error-color);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}
.cert-details {
  text-align: left;
  background: var(--bg-secondary);
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  max-width: 500px;
  width: 100%;
}
.cert-details p {
  margin: 0.25rem 0;
  font-size: 0.875rem;
}
.cert-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}
.trust-options {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.continue-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
