<template>
  <button
    class="icon-btn"
    :class="{ 'is-active': active }"
    :disabled="disabled"
    :title="title"
    :style="btnStyle"
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
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    icon: string
    size?: number
    btnSize?: number
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

const btnSize = computed(() => {
  if (props.btnSize !== undefined)
    return props.btnSize
  const raw = Math.floor(props.size + props.size / 2)
  return raw % 2 === 0 ? raw : raw - 1
})

const btnStyle = computed(() => ({
  width: `${btnSize.value}px`,
  height: `${btnSize.value}px`,
}))

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

  &:hover:not(:disabled),
  &.is-active {
    background: var(--bg-hover);
  }
}
</style>
