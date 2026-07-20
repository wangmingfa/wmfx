<template>
  <Icon
    class="default-favicon"
    icon="mdi:earth"
    :width="size"
    :height="size"
    :style="color ? { color } : undefined"
  />
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

withDefaults(
  defineProps<{
    size?: number
    /** 覆盖默认图标颜色（不传则用 --text-secondary） */
    color?: string
  }>(),
  {
    size: 14,
    color: undefined,
  },
)
</script>

<style scoped>
.default-favicon {
  color: var(--text-secondary);
}
</style>
