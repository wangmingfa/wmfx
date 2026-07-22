<template>
  <Section :title="t('settings.sections.privacy')">
    <SectionItem :label="t('settings.adBlock')">
      <NSwitch
        v-model:value="adBlockEnabled"
        @update:value="onToggle"
      />
    </SectionItem>
    <SectionItem :label="t('settings.adBlockStats', { count: status.blockedCount, rules: status.ruleCount })">
      <div class="adblock-actions">
        <NButton
          size="small"
          tertiary
          @click="showRules = true"
        >
          {{ t('settings.adBlockRulesTitle') }}
        </NButton>
        <NButton
          size="small"
          tertiary
          @click="showLog = true"
        >
          {{ t('settings.adBlockLogTitle') }}
        </NButton>
      </div>
    </SectionItem>
    <SectionItem :label="t('settings.clearDataDesc')">
      <NButton @click="showDialog = true">
        {{ t('settings.openClearDialog') }}
      </NButton>
    </SectionItem>
    <ClearDataDialog v-model:show="showDialog" />
    <AdBlockRulesDialog v-model:show="showRules" />
    <AdBlockLogDialog v-model:show="showLog" />
  </Section>
</template>

<script setup lang="ts">
import { NButton, NSwitch } from 'naive-ui'
import { onMounted, ref } from 'vue'
import AdBlockLogDialog from '@/components/AdBlockLogDialog.vue'
import AdBlockRulesDialog from '@/components/AdBlockRulesDialog.vue'
import ClearDataDialog from '@/components/ClearDataDialog.vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const showDialog = ref(false)
const showRules = ref(false)
const showLog = ref(false)

const adBlockEnabled = ref(true)
const status = ref<{ enabled: boolean, blockedCount: number, ruleCount: number }>({
  enabled: true,
  blockedCount: 0,
  ruleCount: 0,
})

async function loadStatus(): Promise<void> {
  console.debug('[Settings/Privacy] loadStatus')
  try {
    status.value = (await window.browserAPI.getAdBlockStatus()) ?? status.value
    adBlockEnabled.value = status.value.enabled
  } catch (err) {
    console.error('[Settings/Privacy] Failed to load adblock status:', err)
  }
}

async function onToggle(value: boolean): Promise<void> {
  console.debug('[Settings/Privacy] onToggle', value)
  try {
    await window.browserAPI.setAdBlockEnabled(value)
    status.value = (await window.browserAPI.getAdBlockStatus()) ?? status.value
  } catch (err) {
    console.error('[Settings/Privacy] Failed to toggle adblock:', err)
  }
}

onMounted(loadStatus)
</script>

<style scoped>
.adblock-actions {
  display: flex;
  gap: 8px;
}
</style>
