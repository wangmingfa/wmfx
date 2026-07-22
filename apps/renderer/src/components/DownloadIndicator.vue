<template>
  <span
    ref="btnRef"
    class="download-indicator-wrap"
  >
    <IconButton
      icon="mdi:download"
      :size="iconSize"
      :active="isOpen"
      :tooltip="t('downloads.title')"
      @click.stop="toggle"
    />
    <span
      v-if="hasActiveDownloads"
      class="download-dot"
    />
  </span>
</template>

<script setup lang="ts">
import type { DownloadItem, DownloadState, PopoverAnchor } from '@browser/ipc-contract'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useI18n } from '../composables/useI18n'
import { Popover } from '../lib/popover'
import IconButton from './ui/IconButton.vue'

const { t } = useI18n()
const iconSize = 18

const btnRef = ref<HTMLSpanElement>()
const isOpen = ref(false)
let popover: Popover | null = null

const downloads = ref<DownloadItem[]>([])

/** 是否有进行中/排队/暂停的下载（决定是否显示小圆点） */
const hasActiveDownloads = computed(() =>
  downloads.value.some(d => ['pending', 'downloading', 'paused'].includes(d.state)),
)

/** 拉取最近下载（按创建时间倒序，取前 5 条） */
async function loadDownloads(): Promise<void> {
  console.debug('[DownloadIndicator] loadDownloads: enter')
  const list = await window.browserAPI.getDownloads({ limit: 20 })
  downloads.value = list
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
  console.debug('[DownloadIndicator] loadDownloads: count', downloads.value.length)
}

/** 按钮锚点：下拉在按钮下方、右对齐（bottom-end） */
function computeAnchor(): PopoverAnchor {
  const rect = btnRef.value?.getBoundingClientRect()
  if (!rect) {
    return { type: 'rect', rect: { x: 0, y: 0, width: 0, height: 0 }, placement: 'bottom-end' }
  }
  return {
    type: 'rect',
    rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    placement: 'bottom-end',
  }
}

function openPopover(): void {
  console.debug('[DownloadIndicator] openPopover: enter')
  void loadDownloads().then(() => {
    popover = new Popover({
      type: 'downloads',
      mode: 'bounded',
      anchor: computeAnchor(),
      // 列表随下载进度增量更新；首次打开即下发当前列表
      data: {
        items: downloads.value
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5),
      },
      onEvent: onPanelEvent,
      onDismiss: () => {
        isOpen.value = false
        popover = null
        console.debug('[DownloadIndicator] popover dismissed')
      },
    })
    isOpen.value = true
    console.debug('[DownloadIndicator] openPopover: opened')
  })
}

function closePopover(): void {
  console.debug('[DownloadIndicator] closePopover: enter')
  popover?.close()
  popover = null
  isOpen.value = false
}

function toggle(): void {
  console.debug('[DownloadIndicator] toggle: isOpen', isOpen.value)
  if (isOpen.value) {
    closePopover()
  } else {
    openPopover()
  }
}

/** 面板事件路由：进度控制与“查看全部” */
function onPanelEvent(event: { name: string, data?: unknown }): void {
  console.debug('[DownloadIndicator] onPanelEvent: event', event.name)
  if (event.name === 'show-all') {
    closePopover()
    void showAll()
  } else if (event.name === 'pause' && typeof event.data === 'string') {
    void window.browserAPI.pauseDownload(event.data)
  } else if (event.name === 'resume' && typeof event.data === 'string') {
    void window.browserAPI.resumeDownload(event.data)
  } else if (event.name === 'cancel' && typeof event.data === 'string') {
    void window.browserAPI.cancelDownload(event.data)
  } else if (event.name === 'showInFolder' && typeof event.data === 'string') {
    void window.browserAPI.showInFolder(event.data)
  } else if (event.name === 'openFile' && typeof event.data === 'string') {
    void window.browserAPI.openFile(event.data)
  }
}

/** 进度广播：增量更新对应项；遇到新下载 id 则补齐并临时弹出下拉（对齐 Chrome） */
function onProgress(data: { id: string, state: string, receivedBytes: number, totalBytes: number }): void {
  console.debug('[DownloadIndicator] onProgress: id state', data.id, data.state)
  const existing = downloads.value.find(d => d.id === data.id)
  if (existing) {
    existing.state = data.state as DownloadState
    existing.receivedBytes = data.receivedBytes
    existing.totalBytes = data.totalBytes
  } else {
    console.debug('[DownloadIndicator] onProgress: new download id', data.id)
    void loadDownloads().then(() => {
      // 有新下载且下拉未打开时，临时弹出（对齐 Chrome 行为）
      if (!isOpen.value) {
        openPopover()
      }
    })
  }
  // 下拉打开时同步最新列表
  if (isOpen.value && popover) {
    popover.sendData({
      items: downloads.value
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5),
    })
  }
}

async function showAll(): Promise<void> {
  console.debug('[DownloadIndicator] showAll: enter')
  const list = await window.browserAPI.getList()
  const existing = list.find(
    tab =>
      tab.navigation.displayUrl === 'wmfx://downloads' || tab.navigation.displayUrl.startsWith('wmfx://downloads/'),
  )
  if (existing) {
    window.browserAPI.activateTab(existing.id)
  } else {
    window.browserAPI.createTab({ url: 'wmfx://downloads' })
  }
}

onMounted(async () => {
  console.debug('[DownloadIndicator] onMounted: loading downloads')
  await loadDownloads()
  window.browserAPI.onDownloadProgress(onProgress)
})

onUnmounted(() => {
  window.browserAPI.removeListener('download:progress', onProgress as (...args: unknown[]) => void)
  popover?.close()
  popover = null
})
</script>

<style scoped>
.download-indicator-wrap {
  position: relative;
  display: inline-flex;
}

/* 进行中下载的小圆点提示 */
.download-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-color);
  border: 1px solid var(--chrome-bg);
  pointer-events: none;
}
</style>
