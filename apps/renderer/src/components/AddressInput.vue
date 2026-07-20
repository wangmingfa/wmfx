<template>
  <div
    ref="wrapRef"
    class="address-input-wrap"
  >
    <span
      v-if="favicon"
      class="favicon-icon"
    >
      <Favicon
        :url="url ?? ''"
        :favicon="favicon"
        :size="14"
      />
    </span>
    <span
      v-else
      class="security-indicator"
      :class="securityState"
      :title="securityTitle"
    >
      <Icon
        :icon="securityIcon"
        :width="14"
        :height="14"
      />
    </span>
    <input
      ref="inputRef"
      class="address-input"
      :value="modelValue"
      :placeholder="placeholder"
      :style="{ paddingRight: paddingRight ? `${paddingRight}px` : undefined }"
      @input="onInput"
      @focus="emit('focus')"
      @keydown="onKeydown"
    />
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import Favicon from './Favicon.vue'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  securityState?: 'secure' | 'insecure' | 'internal'
  favicon?: string | null
  /** 页面全路径，用于 Favicon 计算缓存 key / 内部页判断 */
  url?: string
  /** 输入框右侧预留空间（用于避开绝对定位的动作按钮），默认 0 */
  paddingRight?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'input': [event: Event]
  'focus': []
  'keydown': [event: KeyboardEvent]
}>()

const inputRef = ref<HTMLInputElement>()
const wrapRef = ref<HTMLDivElement>()
const { t } = useI18n()

const securityIcon = computed(() => {
  if (props.securityState === 'secure')
    return 'mdi:lock'
  if (props.securityState === 'insecure')
    return 'mdi:alert'
  return 'mdi:application'
})

const securityTitle = computed(() => {
  if (props.securityState === 'secure')
    return t('addressBar.secure')
  if (props.securityState === 'insecure')
    return t('addressBar.insecure')
  return t('addressBar.internal')
})

function onInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value
  console.debug('[AddressInput] onInput: value', value)
  emit('update:modelValue', value)
  emit('input', e)
}

function onKeydown(e: KeyboardEvent): void {
  console.debug('[AddressInput] onKeydown: key', e.key)
  emit('keydown', e)
}

defineExpose({
  getEl: () => inputRef.value,
  getWrapEl: () => wrapRef.value,
  getValue: () => inputRef.value?.value ?? '',
  focus: () => inputRef.value?.focus(),
  select: () => inputRef.value?.select(),
  blur: () => inputRef.value?.blur(),
})
</script>

<style scoped>
.address-input-wrap {
  display: flex;
  align-items: center;
  width: 100%;
}

.security-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 10px;
}

.security-indicator.secure {
  color: var(--success-color);
}

.security-indicator.insecure {
  color: var(--danger-color);
}

.security-indicator.internal {
  color: var(--text-secondary);
}

.favicon-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 10px;
}

.address-input {
  flex: 1;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0 0 0 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 28px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.address-input::placeholder {
  color: var(--text-muted, #999);
}
</style>
