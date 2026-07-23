<template>
  <div
    v-if="quickLookVisible"
    class="quick-look-backdrop"
    :style="backdropStyle"
    @click="closePreview()"
  >
    <div
      class="quick-look-panel"
      :class="{ 'quick-look--unknown': store!.previewData.value?.type === 'unknown' }"
      :style="panelStyle"
      @transitionend="handleTransitionEnd"
      @click.stop
    >
      <!-- 顶部：文件名 + 信息 + 关闭 -->
      <div class="quick-look-header">
        <div class="quick-look-info">
          <span class="quick-look-filename">{{ store!.previewData.value?.fileName ?? '' }}</span>
          <span class="quick-look-meta">{{ formatMeta() }}</span>
        </div>
        <button
          class="quick-look-close"
          @click="closePreview()"
        >
          <Icon
            icon="mdi:close"
            :width="20"
            :height="20"
          />
        </button>
      </div>

      <!-- 内容区 -->
      <div class="quick-look-content">
        <!-- 图片预览 -->
        <div
          v-if="store!.previewData.value?.type === 'image' && store!.previewData.value.data"
          class="quick-look-image"
        >
          <!-- 加载中提示 -->
          <div
            v-if="imageLoading"
            class="quick-look-loading"
          >
            <Spinner :size="32" />
          </div>

          <!-- 图片 -->
          <img
            :src="store!.previewData.value.data"
            :alt="store!.previewData.value.fileName"
            :class="{ loaded: imageLoaded }"
            @load="handleImageLoad"
            @error="handleImageError"
          />
        </div>

        <!-- 文本预览 -->
        <div
          v-else-if="store!.previewData.value?.type === 'text' && store!.previewData.value.data"
          class="quick-look-text"
        >
          <pre :class="textClassName">{{ store!.previewData.value.data }}</pre>
        </div>

        <!-- PDF 预览 -->
        <div
          v-else-if="store!.previewData.value?.type === 'pdf'"
          class="quick-look-pdf"
        >
          <iframe
            :src="pdfUrl"
            frameborder="0"
          />
        </div>

        <!-- 音频预览 -->
        <div
          v-else-if="store!.previewData.value?.type === 'audio'"
          class="quick-look-media"
        >
          <audio
            :src="mediaUrl"
            controls
          />
        </div>

        <!-- 视频预览 -->
        <div
          v-else-if="store!.previewData.value?.type === 'video'"
          class="quick-look-media"
        >
          <video
            :src="mediaUrl"
            controls
          />
        </div>

        <!-- 不支持预览 -->
        <div
          v-else
          class="quick-look-unknown"
        >
          <Icon
            icon="mdi:file"
            :width="48"
            :height="48"
          />
          <span>不支持预览此文件类型</span>
        </div>
      </div>

      <!-- 底部：大小 + 修改时间 -->
      <div class="quick-look-footer">
        <span class="quick-look-size">{{ formatSize(store!.previewData.value?.fileSize ?? 0) }}</span>
        <span class="quick-look-modified">{{ formatDate(store!.previewData.value?.modifiedAt ?? 0) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileStore } from './useFileStore'

import { Icon } from '@iconify/vue'
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import Spinner from '@/components/ui/Spinner.vue'
import { fileStoreInjectionKey } from './injectionKeys'

const store = inject<FileStore>(fileStoreInjectionKey)
const currentPreviewData = computed(() => store?.previewData.value)
function getCurrentPreviewPanelStyle(dimensions: { width: number, height: number }): Record<string, string> {
  const { width, height } = getProperSize(dimensions)
  return {
    left: '50%',
    top: '50%',
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(-50%, -50%)`,
  }
}

const showQuickLook = computed(() => !!(store?.previewVisible.value && currentPreviewData.value))
const quickLookVisible = ref(false)
const backdropStyle = ref<Record<string, string>>({})
const panelStyle = ref<Record<string, string>>({})
let panelTransitionPromiseResolve: () => void = () => {}
function handleTransitionEnd(event: TransitionEvent) {
  if (event.propertyName === 'left') {
    panelTransitionPromiseResolve()
  }
}

const defaultDimensions = {
  'text/plain': { width: 1000, height: 1000 },
} as const

function getCurrentFilePathAndDimensions(): { filePath: string | undefined, dimensions: { width: number, height: number } } {
  const { filePath, dimensions, mimeType } = currentPreviewData.value || {}
  const finalDimensions = dimensions ? { ...dimensions } : mimeType ? defaultDimensions[mimeType as keyof typeof defaultDimensions] : undefined
  return { filePath, dimensions: finalDimensions || { width: 300, height: 300 } }
}

async function updateStyle(isOpen = true) {
  const { filePath, dimensions } = getCurrentFilePathAndDimensions()
  console.debug('[QuickLookPanel] updateStyle', filePath, dimensions)
  if (filePath) {
    const triggerElement = document.querySelector(`[data-layout-id="${filePath}"]`)
    if (triggerElement) {
      const { left, top, width, height } = triggerElement.getBoundingClientRect()
      panelStyle.value = {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: 'translate(0,0)',
      }
      backdropStyle.value = {
        background: 'rgba(0,0,0,0)',
      }
      if (showQuickLook.value) {
        quickLookVisible.value = true
      }
      await nextTick()
      triggerElement.getBoundingClientRect()
    }
    if (!isOpen) {
      const { promise, resolve } = Promise.withResolvers<void>()
      panelTransitionPromiseResolve = resolve
      await promise
      quickLookVisible.value = false
      return
    }
    panelStyle.value = getCurrentPreviewPanelStyle(dimensions)
    backdropStyle.value = {}
  }
}
watch(showQuickLook, (value) => {
  updateStyle(value)
})
watch(currentPreviewData, () => {
  if (quickLookVisible.value) {
    panelStyle.value = getCurrentPreviewPanelStyle(getCurrentFilePathAndDimensions().dimensions)
  }
})

const imageLoaded = ref(false)
const imageLoading = ref(false)
const imageNaturalWidth = ref(0)
const imageNaturalHeight = ref(0)

const maxWidthRatio = 0.8
const maxHeightRatio = 0.8

function getProperSize(size: { width: number, height: number }) {
  const { width, height } = size
  const maxWidthNumber = window.innerWidth * maxWidthRatio
  const maxHeightNumber = window.innerHeight * maxHeightRatio
  // 根据最大宽度、最大高度计算合适的宽高，并且要保留比例
  const scale = Math.min(
    maxWidthNumber / width,
    maxHeightNumber / height,
    1,
  )
  return {
    width: width * scale,
    height: height * scale,
  }
}

// 文本语法高亮类
const textClassName = computed(() => {
  const ext = (store!.previewData.value?.fileName ?? '').split('.').pop()?.toLowerCase()
  if (!ext) {
    return 'quick-look-text-code'
  }
  const codeExts = [
    'ts',
    'tsx',
    'js',
    'jsx',
    'py',
    'rb',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
    'css',
    'html',
    'xml',
    'json',
    'yaml',
    'yml',
    'toml',
    'ini',
    'sh',
    'bat',
    'ps1',
    'sql',
    'md',
    'txt',
  ]
  return codeExts.includes(ext) ? 'quick-look-text-code' : 'quick-look-text-plain'
})

// PDF 和媒体 URL（使用 file:// 协议）
const pdfUrl = computed(() => {
  // 需要通过 IPC 获取文件的实际路径
  // 暂用占位符
  return ''
})

const mediaUrl = computed(() => {
  // 需要通过 IPC 获取文件的实际路径
  // 暂用占位符
  return ''
})

// 监听预览数据变化，重置图片加载状态。
// immediate：面板挂载时 previewData 已被赋值（openPreview 先设数据再显示面板），
// 非 immediate 的 watch 在挂载时不会触发，首次打开就不会显示 spinner；
// 图片改走 wmfx:// 协议后（sharp 生成有真实耗时），必须在首次打开也进入 loading 态。
watch(
  () => store!.previewData.value,
  (newData) => {
    if (newData?.type === 'image') {
      imageLoading.value = true
      imageLoaded.value = false
      console.debug('[QuickLookPanel] watch previewData: image loading started')
    }
  },
  { immediate: true },
)

// 格式化信息
function formatMeta(): string {
  const data = store!.previewData.value
  if (!data) {
    return ''
  }
  if (data.dimensions) {
    return `${data.dimensions.width} × ${data.dimensions.height}`
  }
  return ''
}

// 格式化大小
function formatSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
}

// 格式化时间
function formatDate(timestamp: number): string {
  if (!timestamp) {
    return ''
  }
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 图片加载完成
function handleImageLoad(event: Event): void {
  const img = event.target as HTMLImageElement
  imageNaturalWidth.value = img.naturalWidth
  imageNaturalHeight.value = img.naturalHeight
  imageLoaded.value = true
  imageLoading.value = false
  console.debug('[QuickLookPanel] handleImageLoad: %s loaded', img.src)
}

// 图片加载失败（如不支持的格式 / 损坏文件，wmfx 返回 404/415）：
// 停止 loading 态，避免 spinner 永久转动；展示浏览器默认的破损图标
function handleImageError(event: Event): void {
  const img = event.target as HTMLImageElement
  imageLoading.value = false
  imageLoaded.value = true
  console.debug('[QuickLookPanel] handleImageError: %s 加载失败', img.src)
}

// 关闭预览
function closePreview(): void {
  store!.closePreview()
}

// 快捷键处理
function handleKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closePreview()
      break
  }
}

watch(() => store?.lastClickedIndex?.value, (index) => {
  index && store!.updatePreview(index)
})

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  // 聚焦到面板
  nextTick(() => {
    const panel = document.querySelector('.quick-look-panel') as HTMLElement
    panel?.focus()
  })
})

defineExpose({
  closePreview,
})
</script>

<style scoped>
.quick-look-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  z-index: 9999;
}

.quick-look-panel {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  outline: none;
  transition: all 0.3s ease-in-out;
}

.quick-look--unknown {
  max-width: 400px;
}

.quick-look-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 70px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
}

.quick-look-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.quick-look-filename {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-look-meta {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-look-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.quick-look-close:hover {
  opacity: 1;
  background: var(--bg-hover);
}

.quick-look-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow: hidden;
}

.quick-look-image {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.quick-look-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.quick-look-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 200px;
}

.quick-look-text {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.quick-look-text pre {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
}

.quick-look-text-plain {
  background: var(--bg-secondary);
}

.quick-look-text-code {
  background: var(--bg-code);
}

.quick-look-pdf iframe {
  width: 100%;
  height: 100%;
}

.quick-look-media {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.quick-look-media audio,
.quick-look-media video {
  max-width: 100%;
  max-height: 100%;
}

.quick-look-unknown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
}

.quick-look-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}
</style>
