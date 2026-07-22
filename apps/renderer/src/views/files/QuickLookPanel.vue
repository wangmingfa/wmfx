<template>
  <Teleport to="body">
    <div
      class="quick-look-backdrop"
      @click="closePreview"
    >
      <div
        class="quick-look-panel"
        :class="{ 'quick-look--unknown': previewData?.type === 'unknown' }"
        @click.stop
      >
        <!-- 顶部：文件名 + 信息 + 关闭 -->
        <div class="quick-look-header">
          <div class="quick-look-info">
            <span class="quick-look-filename">{{ previewData?.fileName ?? '' }}</span>
            <span class="quick-look-meta">{{ formatMeta() }}</span>
          </div>
          <button
            class="quick-look-close"
            @click="closePreview"
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
            v-if="previewData?.type === 'image' && previewData.data"
            class="quick-look-image"
          >
            <img
              :src="previewData.data"
              :alt="previewData.fileName"
              @load="handleImageLoad"
            />
          </div>

          <!-- 文本预览 -->
          <div
            v-else-if="previewData?.type === 'text' && previewData.data"
            class="quick-look-text"
          >
            <pre :class="textClassName">{{ previewData.data }}</pre>
          </div>

          <!-- PDF 预览 -->
          <div
            v-else-if="previewData?.type === 'pdf'"
            class="quick-look-pdf"
          >
            <iframe
              :src="pdfUrl"
              frameborder="0"
            />
          </div>

          <!-- 音频预览 -->
          <div
            v-else-if="previewData?.type === 'audio'"
            class="quick-look-media"
          >
            <audio
              :src="mediaUrl"
              controls
            />
          </div>

          <!-- 视频预览 -->
          <div
            v-else-if="previewData?.type === 'video'"
            class="quick-look-media"
          >
            <video
              :src="mediaUrl"
              controls
            />
          </div>

          <!-- 不支持预览 -->
          <div
            v-else-if="previewData?.type === 'unknown'"
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
          <span class="quick-look-size">{{ formatSize(previewData?.fileSize ?? 0) }}</span>
          <span class="quick-look-modified">{{ formatDate(previewData?.modifiedAt ?? 0) }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { PreviewData } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  previewData: PreviewData | null
}>()

const emit = defineEmits<{
  close: []
  previous: []
  next: []
}>()

const imageLoaded = ref(false)
const imageNaturalWidth = ref(0)
const imageNaturalHeight = ref(0)

// 文本语法高亮类
const textClassName = computed(() => {
  const ext = (props.previewData?.fileName ?? '').split('.').pop()?.toLowerCase()
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

// 格式化信息
function formatMeta(): string {
  const data = props.previewData
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
}

// 关闭预览
function closePreview(): void {
  emit('close')
}

// 快捷键处理
function handleKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'Escape':
    case ' ':
      event.preventDefault()
      closePreview()
      break
    case 'ArrowLeft':
      event.preventDefault()
      emit('previous')
      break
    case 'ArrowRight':
      event.preventDefault()
      emit('next')
      break
  }
}

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
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.quick-look-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 80vw;
  max-height: 80vh;
  min-width: 300px;
  min-height: 200px;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  outline: none;
}

.quick-look--unknown {
  max-width: 400px;
}

.quick-look-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
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
  font-family: var(--font-mono);
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
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-muted);
}

.quick-look-size {
  font-family: var(--font-mono);
}
</style>
