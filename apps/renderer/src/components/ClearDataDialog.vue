<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('settings.clearDataTitle')"
    style="width: 460px; max-width: 92vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="clear-data-body">
      <div class="cd-section">
        <NCheckbox
          v-for="opt in typeOptions"
          :key="opt.value"
          v-model:checked="selected[opt.value]"
          class="cd-check"
        >
          {{ opt.label }}
        </NCheckbox>
      </div>

      <NText
        v-if="feedback"
        :type="feedbackType"
        class="cd-feedback"
      >
        {{ feedback }}
      </NText>
    </div>

    <template #footer>
      <div class="cd-footer">
        <NButton @click="emit('update:show', false)">
          {{ t('settings.clearDataCancel') }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!hasSelection || loading"
          :loading="loading"
          @click="onClear"
        >
          {{ t('settings.openClearDialog') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { NButton, NCheckbox, NModal, NText } from 'naive-ui'
import { computed, reactive, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const { t } = useI18n()

type DataType = 'cookies' | 'cache' | 'localStorage' | 'formData'

const selected = reactive<Record<DataType, boolean>>({
  cookies: true,
  cache: true,
  localStorage: true,
  formData: true,
})

const typeOptions = computed(() => [
  { value: 'cookies' as DataType, label: t('settings.dataCookies') },
  { value: 'cache' as DataType, label: t('settings.dataCache') },
  { value: 'localStorage' as DataType, label: t('settings.dataLocalStorage') },
  { value: 'formData' as DataType, label: t('settings.dataFormData') },
])

const hasSelection = computed(() => (Object.keys(selected) as DataType[]).some(k => selected[k]))

const loading = ref(false)
const feedback = ref('')
const feedbackType = ref<'success' | 'error'>('success')

async function onClear(): Promise<void> {
  console.debug(`[ClearDataDialog] onClear`)
  if (!hasSelection.value) {
    return
  }
  loading.value = true
  feedback.value = ''
  const types = (Object.keys(selected) as DataType[]).filter(k => selected[k])
  try {
    await window.browserAPI.clearPrivacyData({ types })
    feedbackType.value = 'success'
    feedback.value = t('settings.clearDataSuccess')
    console.info(`[ClearDataDialog] onClear: success types=${JSON.stringify(types)}`)
    setTimeout(emit, 800, 'update:show', false)
  }
  catch (err) {
    feedbackType.value = 'error'
    feedback.value = t('settings.clearDataError')
    console.error(`[ClearDataDialog] onClear: failed`, err)
  }
  finally {
    loading.value = false
  }
}
</script>

<style scoped>
.clear-data-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cd-label {
  font-size: 13px;
  color: var(--text-secondary);
}
.cd-check {
  margin: 2px 0;
}
.cd-feedback {
  font-size: 13px;
}
.cd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
