<template>
  <PageLayout :title="`${t('downloads.title')} (${downloads.length})`" icon="mdi:download">
    <div v-if="downloads.length === 0" class="downloads-empty">
      <p>{{ t('downloads.empty') }}</p>
    </div>

    <template v-else>
      <div v-for="(group, date) in groupedDownloads" :key="date" class="download-group">
        <h3 class="download-group-title">{{ dayLabel(date) }}</h3>

        <ul class="download-list">
          <li
            v-for="item in group"
            :key="item.id"
            class="download-item"
            :class="item.state"
            @mouseenter="item._hover = true"
            @mouseleave="item._hover = false"
          >
            <!-- 左侧文件图标 -->
            <span class="download-file-icon">
              <Icon :icon="getFileIcon(item.filename)" :width="20" :height="20" />
            </span>

            <!-- 中间：文件名 + 链接 -->
            <div class="download-center">
              <div class="download-name">
                <span :class="{ 'download-name-deleted': !item._fileExists }">
                  {{ item.filename }}
                </span>
                <span v-if="!item._fileExists" class="download-deleted-badge">
                  {{ t('downloads.deleted') }}
                </span>
              </div>
              <div class="download-url">{{ item.url }}</div>
              <div v-if="item.errorMsg" class="download-error">
                {{ item.errorMsg }}
              </div>
            </div>

            <!-- 右侧：操作按钮 -->
            <div class="download-actions">
              <IconButton
                icon="mdi:content-copy"
                :size="18"
                :title="t('downloads.copyLink')"
                @click.stop="handleCopyLink(item.url)"
              />
              <IconButton
                v-if="item._fileExists"
                icon="mdi:folder-open"
                :size="18"
                :title="t('downloads.showInFolder')"
                @click.stop="handleShowInFolder(item.path)"
              />
              <IconButton
                icon="mdi:delete-outline"
                :size="18"
                :title="t('downloads.delete')"
                @click.stop="handleDelete(item.id)"
              />
            </div>
          </li>
        </ul>
      </div>
    </template>
  </PageLayout>
</template>

<script setup lang="ts">
import type { DownloadItem, DownloadState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const downloads = ref<DownloadItem[]>([])

interface GroupedDownloads {
  [key: string]: (DownloadItem & { _fileExists: boolean; _hover: boolean })[]
}

/** 下载按天分组：按 created_at 分 today / yesterday / earlier */
const groupedDownloads = computed<GroupedDownloads>(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const groups: GroupedDownloads = {}
  const enriched = downloads.value.map((item) => ({
    ...item,
    _fileExists: true as boolean,
    _hover: false,
  }))

  for (const item of enriched) {
    const date = new Date(item.createdAt)
    const dayKey = date.toISOString().slice(0, 10)
    if (!groups[dayKey]) {
      groups[dayKey] = []
    }
    groups[dayKey].push(item)
  }

  return groups
})

/** 获取文件的 iconify 图标名称 */
function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    pdf: 'mdi:file-pdf-box',
    doc: 'mdi:file-word-box',
    docx: 'mdi:file-word-box',
    xls: 'mdi:file-excel-box',
    xlsx: 'mdi:file-excel-box',
    ppt: 'mdi:file-powerpoint-box',
    pptx: 'mdi:file-powerpoint-box',
    zip: 'mdi:file-zip-box',
    rar: 'mdi:file-zip-box',
    '7z': 'mdi:file-zip-box',
    jpg: 'mdi:file-image-box',
    jpeg: 'mdi:file-image-box',
    png: 'mdi:file-image-box',
    gif: 'mdi:file-image-box',
    svg: 'mdi:file-image-box',
    mp3: 'mdi:file-music-box',
    wav: 'mdi:file-music-box',
    flac: 'mdi:file-music-box',
    mp4: 'mdi:file-video-box',
    avi: 'mdi:file-video-box',
    mov: 'mdi:file-video-box',
    mkv: 'mdi:file-video-box',
    exe: 'mdi:file-cog-box',
    txt: 'mdi:file-document-box',
    log: 'mdi:file-document-box',
    html: 'mdi:file-code-box',
    css: 'mdi:file-code-box',
    js: 'mdi:file-code-box',
    ts: 'mdi:file-code-box',
    json: 'mdi:file-code-box',
    xml: 'mdi:file-code-box',
    py: 'mdi:file-code-box',
    sh: 'mdi:file-code-box',
    bat: 'mdi:file-code-box',
    dmg: 'mdi:file-box-outline',
    iso: 'mdi:file-box-outline',
    deb: 'mdi:file-box-outline',
    rpm: 'mdi:file-box-outline',
    apk: 'mdi:file-box-outline',
  }
  return iconMap[ext || ''] || 'mdi:file-box-outline'
}

/** 显示分组标题 */
function dayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayMs = date.getTime()
  if (dayMs >= today.getTime()) return t('downloads.today')
  if (dayMs >= yesterday.getTime()) return t('downloads.yesterday')
  return t('downloads.earlier')
}

/** 加载下载列表 */
async function loadDownloads() {
  console.debug('[DownloadsView] loadDownloads')
  const list = await window.browserAPI.getDownloads()
  // 检查每个文件是否存在
  const items = await Promise.all(
    list.map(async (item) => ({
      ...item,
      _fileExists: await window.browserAPI.fileExists(item.path),
      _hover: false,
    })),
  )
  downloads.value = items
}

let progressHandler: ((data: { id: string; state: string; receivedBytes: number; totalBytes: number }) => void) | null =
  null

function handleCopyLink(url: string) {
  console.debug('[DownloadsView] handleCopyLink: url', url)
  void window.browserAPI.copyText(url)
}

async function handleShowInFolder(path: string) {
  console.debug('[DownloadsView] handleShowInFolder: path', path)
  await window.browserAPI.showInFolder(path)
}

async function handleDelete(id: string) {
  console.debug('[DownloadsView] handleDelete: id', id)
  await window.browserAPI.deleteDownload(id)
  await loadDownloads()
}

onMounted(async () => {
  console.debug('[DownloadsView] onMounted')
  await loadDownloads()
  progressHandler = (data) => {
    const idx = downloads.value.findIndex((d) => d.id === data.id)
    if (idx !== -1) {
      const item = downloads.value[idx]
      downloads.value[idx] = {
        ...item,
        state: data.state as DownloadState,
        receivedBytes: data.receivedBytes,
        totalBytes: data.totalBytes,
      }
    }
  }
  window.browserAPI.onDownloadProgress(progressHandler)
})

onUnmounted(() => {
  console.debug('[DownloadsView] onUnmounted')
  if (progressHandler) {
    window.browserAPI.removeListener('download:progress', progressHandler as (...args: unknown[]) => void)
  }
})
</script>

<style scoped>
.downloads-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: var(--text-muted, #888);
  font-size: 15px;
}

.download-group {
  margin-bottom: 20px;
}

.download-group-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #888);
  margin: 0 0 8px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color, #333);
}

.download-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.download-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg-secondary, #16213e);
  transition: background 0.15s;
  border: 1px solid transparent;
}

.download-item:hover {
  background: var(--bg-hover, #1a2744);
  border-color: var(--border-color, #333);
}

.download-item.error {
  border-color: var(--color-error, #f44336);
}

.download-file-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.download-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.download-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-name-deleted {
  text-decoration: line-through;
  color: var(--text-muted, #888);
}

.download-deleted-badge {
  font-size: 11px;
  color: var(--color-error, #f44336);
  flex-shrink: 0;
}

.download-url {
  font-size: 12px;
  color: var(--text-muted, #888);
  word-break: break-all;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-error {
  font-size: 12px;
  color: var(--color-error, #f44336);
  margin-top: 2px;
}

.download-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
</style>
