<template>
  <button
    class="icon-btn"
    :class="{ 'is-active': active }"
    :disabled="disabled"
    :title="title"
    @click="onClick"
  >
    <Icon
      :icon="icon"
      :width="size"
      :height="size"
    />
  </button>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

const props = withDefaults(
  defineProps<{
    icon: string
    size?: number
    active?: boolean
    disabled?: boolean
    title?: string
  }>(),
  {
    size: 18,
    active: false,
    disabled: false,
    title: '',
  },
)

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

function onClick(ev: MouseEvent): void {
  if (props.disabled)
    return
  emit('click', ev)
}
</script>

<style lang="less" scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  // 默认即深色模式（:root 为深色变量，[data-theme="light"] 才覆盖为浅色）：
  // hover / 激活 背景用中性灰 74 74 74，图标颜色保持不变。
  &:hover:not(:disabled),
  &.is-active {
    background: rgb(248, 248, 248);
  }

  // 浅色模式：保持原样（与旧 nav-btn 一致）
  :global([data-theme="light"]) &:hover:not(:disabled),
  :global([data-theme="light"]) &.is-active {
    background: var(--bg-tertiary);
  }
}
</style>
