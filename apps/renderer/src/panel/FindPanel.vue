<template>
  <div class="find-panel">
    <NInput
      ref="inputRef"
      :value="localQuery"
      class="find-input"
      size="small"
      :placeholder="t('find.placeholder')"
      @update:value="onInput"
      @keydown="onKeydown"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
    />
    <span class="find-counter">{{ data.matches > 0 ? `${data.activeMatch + 1}/${data.matches}` : '0/0' }}</span>
    <button
      class="find-btn"
      :disabled="data.matches === 0"
      @mousedown.prevent="emit('event', 'find-prev')"
    >
      <Icon
        icon="ic:round-keyboard-arrow-up"
        width="18"
        height="18"
      />
    </button>
    <button
      class="find-btn"
      :disabled="data.matches === 0"
      @mousedown.prevent="emit('event', 'find-next')"
    >
      <Icon
        icon="ic:round-keyboard-arrow-down"
        width="18"
        height="18"
      />
    </button>
    <button
      class="find-btn close-btn"
      @mousedown.prevent="emit('event', 'close')"
    >
      <Icon
        icon="ic:sharp-close"
        width="20"
        height="20"
      />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { InputInst } from 'naive-ui'
import { Icon } from '@iconify/vue'
import { NInput } from 'naive-ui'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  popoverId: string
  data: { query: string, matches: number, activeMatch: number, focusNonce?: number }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const { t } = useI18n()
const inputRef = ref<InputInst>()

// 本地即时回显输入；实际搜索请求 debounce，避免每个字符都触发整页重搜（大页面很卡）
const localQuery = ref(props.data.query)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 200

// 自行跟踪 IME 合成状态：event.isComposing 在 compositionend 与 keydown 的时序上不可靠，
// 用 compositionstart/end 维护本地标志作为守卫补充
const composing = ref(false)
function onCompositionStart(): void {
  composing.value = true
}
function onCompositionEnd(): void {
  composing.value = false
}

// data.query 由外部变化（切 tab 恢复历史关键字）时同步回本地输入框
watch(
  () => props.data.query,
  (v) => {
    if (v !== localQuery.value) {
      console.debug('[FindPanel] watch query: 同步外部关键字 v', v)
      localQuery.value = v
    }
  },
)

function focusInput(): void {
  // 延迟到下一帧，确保面板 WebContentsView 已获得焦点（主进程 open/renderTop 中 webContents.focus）
  console.debug('[FindPanel] focusInput: 聚焦输入框')
  requestAnimationFrame(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

onMounted(focusInput)

onUnmounted(() => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
})

// 再次 Ctrl+F：组件不会重挂载，靠 focusNonce 变化触发聚焦并全选
watch(
  () => props.data.focusNonce,
  () => focusInput(),
)

function onInput(value: string): void {
  localQuery.value = value
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    console.debug('[FindPanel] onInput: debounce 提交搜索 query', value)
    emit('event', 'update-query', value)
  }, DEBOUNCE_MS)
}

function onKeydown(e: KeyboardEvent): void {
  // IME 合成期间（如中文选词），Enter/Esc 属于输入法操作（确认/取消候选），
  // 不应触发翻页或关闭面板。isComposing 为 true 或 keyCode 229 均表示合成中。
  if (e.isComposing || e.keyCode === 229 || composing.value)
    return
  if (e.key === 'Enter') {
    e.preventDefault()
    // 回车立即翻页：若还有未提交的关键字，先立刻提交搜索再翻页
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
      emit('event', 'update-query', localQuery.value)
    }
    console.debug('[FindPanel] onKeydown: Enter 翻页 dir', e.shiftKey ? 'prev' : 'next')
    emit('event', e.shiftKey ? 'find-prev' : 'find-next')
  }
  else if (e.key === 'Escape') {
    e.preventDefault()
    emit('event', 'close')
  }
}
</script>

<style scoped>
.find-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 320px;
  height: 40px;
  padding: 0 8px;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.find-input {
  flex: 1;
  min-width: 0;
}

.find-counter {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
  text-align: center;
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 50%;
}

.find-btn:disabled {
  color: var(--text-muted, #999);
  cursor: default;
}

.find-btn:not(:disabled):hover {
  background: var(--bg-tertiary);
}

.close-btn {
  color: var(--text-secondary);
}

.close-btn:hover {
  color: var(--danger-color);
}
</style>
