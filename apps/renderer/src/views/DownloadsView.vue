<template>
  <PageLayout :title="`${t('downloads.title')} (${downloads.length})`" icon="mdi:download">
    <div v-if="downloads.length === 0" class="downloads-empty">
      <p>{{ t('downloads.empty') }}</p>
    </div>
    <template v-else>
      <Section v-for="(group, date) in groupedDownloads" :key="date" :title="dayLabel(date)">
        <SectionItem
          v-for="item in group"
          :key="item.id"
          @mouseenter="item._hover = true"
          @mouseleave="item._hover = false"
        >
          <!-- 左侧：文件图标 + 文件名 + 链接 + 错误 -->
          <template #label>
            <div class="download-content">
              <Icon :icon="getFileIcon(item.filename)" :width="20" :height="20" class="download-file-icon" />
              <div class="download-text">
                <div class="download-name">
                  <span :class="{ 'download-name-deleted': !item._fileExists }">{{ item.filename }}</span>
                  <span v-if="!item._fileExists" class="download-deleted-badge">{{ t('downloads.deleted') }}</span>
                </div>
                <div class="download-url">
                  {{ item.url }}
                </div>
                <div v-if="item.errorMsg" class="download-error">
                  {{ item.errorMsg }}
                </div>
              </div>
            </div>
          </template>
          <!-- 右侧：操作按钮 -->
          <IconButton
            icon="mdi:content-copy"
            :size="18"
            :tooltip="t('downloads.copyLink')"
            @click.stop="handleCopyLink(item.url)"
          />
          <IconButton
            v-if="item._fileExists"
            icon="mdi:folder-open"
            :size="18"
            :tooltip="t('downloads.showInFolder')"
            @click.stop="handleShowInFolder(item.path)"
          />
          <IconButton
            icon="mdi:delete-outline"
            :size="18"
            danger
            :tooltip="t('downloads.delete')"
            @click.stop="handleDelete(item.id)"
          />
        </SectionItem>
      </Section>
    </template>
  </PageLayout>
</template>

<script setup lang="ts">
import type { DownloadItem, DownloadState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import Section from '@/components/Section.vue'
import SectionItem from '@/components/SectionItem.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const downloads = ref<(DownloadItem & { _fileExists: boolean; _hover: boolean })[]>([])

interface GroupedDownloads {
  [key: string]: (DownloadItem & { _fileExists: boolean; _hover: boolean })[]
}

const groupedDownloads = computed<GroupedDownloads>(() => {
  const groups: GroupedDownloads = {}
  for (const item of downloads.value) {
    const dayKey = new Date(item.createdAt).toISOString().slice(0, 10)
    if (!groups[dayKey]) groups[dayKey] = []
    groups[dayKey].push(item)
  }
  return groups
})

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

function dayLabel(dateStr: string | number): string {
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

async function loadDownloads() {
  console.debug('[DownloadsView] loadDownloads')
  const list = await window.browserAPI.getDownloads()
  downloads.value = await Promise.all(
    list.map(async (item) => ({
      ...item,
      _fileExists: await window.browserAPI.fileExists(item.path),
      _hover: false,
    })),
  )
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
      downloads.value[idx] = {
        ...downloads.value[idx],
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
.download-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.download-file-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}
.download-text {
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
  color: var(--danger-color);
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
  color: var(--danger-color);
}
</style>
