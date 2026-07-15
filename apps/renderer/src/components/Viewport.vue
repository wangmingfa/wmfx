<template>
  <div id="browser-viewport" ref="viewportRef" style="flex: 1; min-height: 0; width: 100%; height: 100%" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  tabId: string
}>()

const viewportRef = ref<HTMLElement>()
let resizeObserver: ResizeObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function sendBounds(): void {
  if (!viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  window.browserAPI.setViewportBounds(props.tabId, {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  })
}

watch(
  () => props.tabId,
  () => {
    sendBounds()
  },
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(sendBounds, 30)
  })
  resizeObserver.observe(viewportRef.value!)
  sendBounds()
})

onUnmounted(() => {
  if (resizeObserver && viewportRef.value) {
    resizeObserver.unobserve(viewportRef.value)
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})
</script>
