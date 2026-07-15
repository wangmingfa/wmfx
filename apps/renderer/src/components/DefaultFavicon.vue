<template>
  <Icon class="default-favicon" icon="mdi:earth" :width="size" :height="size" />
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  {
    size: 14,
  },
)
</script>

<style scoped>
.default-favicon {
  color: var(--text-secondary);
}
</style>
