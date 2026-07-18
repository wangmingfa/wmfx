<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('settings.adBlockRulesTitle')"
    style="width: 520px; max-width: 92vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="rules-body">
      <p class="rules-hint">
        {{ t('settings.adBlockRulesHint') }}
      </p>
      <NInput v-model:value="keyword" :placeholder="t('settings.adBlockRulesSearch')" clearable class="rules-search" />
      <div class="rules-scroll">
        <div v-for="rule in filtered" :key="rule.host" class="rule-row">
          <span class="rule-host">{{ rule.host }}</span>
          <NTag size="small" :type="tagType(rule.source)" round>
            {{ sourceLabel(rule.source) }}
          </NTag>
        </div>
        <NEmpty v-if="filtered.length === 0" :description="t('settings.adBlockRulesEmpty')" class="rules-empty" />
      </div>
    </div>

    <template #footer>
      <div class="rules-footer">
        <span class="rules-count">{{ filtered.length }} / {{ rules.length }}</span>
      </div>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { NEmpty, NInput, NModal, NTag } from 'naive-ui'
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const { t } = useI18n()

type RuleSource = 'builtin' | 'custom' | 'allow'

interface Rule {
  host: string
  source: RuleSource
}

const rules = ref<Rule[]>([])
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return rules.value
  return rules.value.filter((r) => r.host.toLowerCase().includes(kw))
})

function sourceLabel(source: RuleSource): string {
  return t(
    source === 'builtin'
      ? 'settings.adBlockSourceBuiltin'
      : source === 'custom'
        ? 'settings.adBlockSourceCustom'
        : 'settings.adBlockSourceAllow',
  )
}

function tagType(source: RuleSource): 'default' | 'warning' | 'success' {
  return source === 'allow' ? 'success' : source === 'custom' ? 'warning' : 'default'
}

async function load(): Promise<void> {
  console.debug('[AdBlockRulesDialog] load')
  try {
    rules.value = (await window.browserAPI.getAdBlockRules()) ?? []
  } catch (err) {
    console.error('[AdBlockRulesDialog] Failed to load rules:', err)
    rules.value = []
  }
}

// 每次打开时拉取最新规则
watch(toRef(props, 'show'), (open) => {
  if (open) void load()
})
</script>

<style scoped>
.rules-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rules-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.rules-scroll {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-secondary);
}
.rule-host {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}
.rules-empty {
  padding: 32px 0;
}
.rules-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rules-count {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
