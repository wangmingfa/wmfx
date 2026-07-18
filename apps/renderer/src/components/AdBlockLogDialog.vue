<template>
  <NModal
    :show="show"
    preset="card"
    :title="t('settings.adBlockLogTitle')"
    style="width: 520px; max-width: 92vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="log-body">
      <NInput v-model:value="keyword" :placeholder="t('settings.adBlockRulesSearch')" clearable class="log-search" />
      <div class="log-scroll">
        <div v-for="(entry, idx) in filtered" :key="`${entry.time}-${idx}`" class="log-row">
          <div class="log-main">
            <span class="log-url">{{ entry.url }}</span>
            <span class="log-time">{{ formatTime(entry.time) }}</span>
          </div>
        </div>
        <NEmpty v-if="filtered.length === 0" :description="t('settings.adBlockLogEmpty')" class="log-empty" />
      </div>
    </div>

    <template #footer>
      <div class="log-footer">
        <span class="log-count">{{ filtered.length }} / {{ logs.length }}</span>
      </div>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { NEmpty, NInput, NModal } from 'naive-ui'
import { computed, ref, toRef, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const { t } = useI18n()

interface BlockLogEntry {
  url: string
  time: number
  host: string
}

const logs = ref<BlockLogEntry[]>([])
const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return logs.value
  return logs.value.filter((r) => r.url.toLowerCase().includes(kw) || r.host.toLowerCase().includes(kw))
})

function formatTime(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function load(): Promise<void> {
  console.debug('[AdBlockLogDialog] load')
  try {
    logs.value = (await window.browserAPI.getAdBlockLog()) ?? []
  } catch (err) {
    console.error('[AdBlockLogDialog] Failed to load log:', err)
    logs.value = []
  }
}

// 每次打开时拉取最新拦截历史
watch(toRef(props, 'show'), (open) => {
  if (open) void load()
})
</script>

<style scoped>
.log-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.log-scroll {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-row {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-secondary);
}
.log-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.log-url {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}
.log-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}
.log-empty {
  padding: 32px 0;
}
.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.log-count {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
