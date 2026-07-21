<template>
  <div
    id="browser-viewport"
    ref="viewportRef"
    style="flex: 1; min-height: 0; width: 100%; height: 100%"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  tabId: string
}>()

const viewportRef = ref<HTMLElement>()
let resizeObserver: ResizeObserver | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 垂直标签栏展开/收起动画期间，逐帧同步 WebContentsView 边界，避免遮挡
let rafSyncId: number | null = null

function sendBounds(): void {
  if (!viewportRef.value) {
    return
  }
  const rect = viewportRef.value.getBoundingClientRect()
  console.debug('[Viewport] sendBounds: tabId x y w h', props.tabId, rect.left, rect.top, rect.width, rect.height)
  window.browserAPI.setViewportBounds(props.tabId, {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  })
}

// 动画期间逐帧把边界推给主进程，与标签栏宽度动画保持同步（消除遮挡）
function startRafSync(): void {
  if (rafSyncId !== null) {
    return
  }
  const tick = (): void => {
    sendBounds()
    rafSyncId = requestAnimationFrame(tick)
  }
  rafSyncId = requestAnimationFrame(tick)
  // 兜底：若 transitionend 未触发（如无过渡/reduced-motion），超时自动停止
  window.setTimeout(stopRafSync, 400)
}

function stopRafSync(): void {
  if (rafSyncId !== null) {
    cancelAnimationFrame(rafSyncId)
    rafSyncId = null
  }
  // 最终对齐一次，确保动画结束后边界精确
  sendBounds()
}

function onVtabResizing(): void {
  startRafSync()
}

function onVtabResizeEnd(): void {
  stopRafSync()
}

watch(
  () => props.tabId,
  () => {
    console.debug('[Viewport] tabId changed', props.tabId)
    sendBounds()
  },
)

onMounted(() => {
  console.debug('[Viewport] onMounted: tabId', props.tabId)
  resizeObserver = new ResizeObserver(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(sendBounds, 30)
  })
  resizeObserver.observe(viewportRef.value!)
  window.addEventListener('vtab:resizing', onVtabResizing)
  window.addEventListener('vtab:resize-end', onVtabResizeEnd)
  sendBounds()
})

onUnmounted(() => {
  if (resizeObserver && viewportRef.value) {
    resizeObserver.unobserve(viewportRef.value)
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  stopRafSync()
  window.removeEventListener('vtab:resizing', onVtabResizing)
  window.removeEventListener('vtab:resize-end', onVtabResizeEnd)
})
</script>
