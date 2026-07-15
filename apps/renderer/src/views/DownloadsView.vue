<template>
  <PageLayout :title="`${t('downloads.title')} (${downloads.length})`" icon="mdi:download">
    <div v-if="downloads.length === 0" class="downloads-empty">
      <p>{{ t('downloads.empty') }}</p>
    </div>

    <ul v-else class="downloads-list">
      <li v-for="item in downloads" :key="item.id" class="download-item" :class="item.state">
        <div class="download-info">
          <div class="download-name">
            {{ item.filename }}
          </div>
          <div class="download-url">
            {{ item.url }}
          </div>
        </div>

        <div class="download-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progressPercent(item)}%` }" />
          </div>
          <span class="progress-text">{{ formatBytes(item) }}</span>
        </div>

        <div class="download-actions">
          <span class="state-badge" :class="item.state">
            {{ stateLabel(item.state) }}
          </span>

          <button v-if="item.state === 'paused'" class="btn btn-sm" @click="handleResume(item.id)">
            {{ t('downloads.resume') }}
          </button>
          <button v-if="item.state === 'downloading'" class="btn btn-sm" @click="handlePause(item.id)">
            {{ t('downloads.pause') }}
          </button>
          <button
            v-if="['pending', 'downloading', 'paused'].includes(item.state)"
            class="btn btn-sm btn-danger"
            @click="handleCancel(item.id)"
          >
            {{ t('downloads.cancel') }}
          </button>
        </div>

        <div v-if="item.errorMsg" class="download-error">
          {{ item.errorMsg }}
        </div>
      </li>
    </ul>
  </PageLayout>
</template>

<script setup lang="ts">
import type { DownloadItem, DownloadState } from '@browser/ipc-contract'

import { onMounted, onUnmounted, ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const downloads = ref<DownloadItem[]>([])

async function loadDownloads() {
  downloads.value = await window.browserAPI.getDownloads()
}

function progressPercent(item: DownloadItem): number {
  if (!item.totalBytes || item.totalBytes === 0) return 0
  return Math.round((item.receivedBytes / item.totalBytes) * 100)
}

function formatBytes(item: DownloadItem): string {
  const fmt = (b: number): string => {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = b
    let unitIdx = 0
    while (size >= 1024 && unitIdx < units.length - 1) {
      size /= 1024
      unitIdx++
    }
    return `${size.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`
  }
  return `${fmt(item.receivedBytes)} / ${fmt(item.totalBytes)}`
}

function stateLabel(state: DownloadItem['state']): string {
  const labels: Record<string, string> = {
    pending: t('downloads.pending'),
    downloading: t('downloads.downloading'),
    paused: t('downloads.paused'),
    completed: t('downloads.completed'),
    cancelled: t('downloads.cancelled'),
    error: t('downloads.error'),
  }
  return labels[state] || state
}

let progressHandler: ((data: { id: string; state: string; receivedBytes: number; totalBytes: number }) => void) | null =
  null

async function handlePause(id: string) {
  await window.browserAPI.pauseDownload(id)
  await loadDownloads()
}

async function handleResume(id: string) {
  await window.browserAPI.resumeDownload(id)
  await loadDownloads()
}

async function handleCancel(id: string) {
  await window.browserAPI.cancelDownload(id)
  await loadDownloads()
}

onMounted(async () => {
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

.downloads-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.download-item {
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  padding: 12px;
  background: var(--bg-secondary, #16213e);
}

.download-item.completed {
  border-color: var(--color-success, #4caf50);
}

.download-item.error {
  border-color: var(--color-error, #f44336);
}

.download-info {
  margin-bottom: 8px;
}

.download-name {
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
  word-break: break-all;
}

.download-url {
  font-size: 12px;
  color: var(--text-muted, #888);
  word-break: break-all;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-tertiary, #0f3460);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary, #4361ee);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.download-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
  font-weight: 500;
}

.state-badge.downloading {
  background: rgba(67, 97, 238, 0.2);
  color: var(--color-primary, #4361ee);
}

.state-badge.paused {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.state-badge.completed {
  background: rgba(76, 175, 80, 0.2);
  color: var(--color-success, #4caf50);
}

.state-badge.cancelled {
  background: rgba(158, 158, 158, 0.2);
  color: #9e9e9e;
}

.state-badge.error {
  background: rgba(244, 67, 54, 0.2);
  color: var(--color-error, #f44336);
}

.state-badge.pending {
  background: rgba(156, 39, 176, 0.2);
  color: #9c27b0;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: var(--color-primary, #4361ee);
  color: #fff;
  transition: opacity 0.2s;
}

.btn-sm:hover {
  opacity: 0.8;
}

.btn-danger {
  background: var(--color-error, #f44336);
}

.download-error {
  font-size: 12px;
  color: var(--color-error, #f44336);
  margin-top: 4px;
}
</style>
