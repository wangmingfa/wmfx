<template>
  <div class="download-panel">
    <div class="download-panel-header">
      <span>{{ t('downloads.title') }}</span>
      <button
        class="download-show-all"
        @click="showAll"
      >
        {{ t('downloads.showAll') }}
      </button>
    </div>

    <div
      v-if="items.length === 0"
      class="download-panel-empty"
    >
      {{ t('downloads.empty') }}
    </div>

    <ul
      v-else
      class="download-panel-list"
    >
      <li
        v-for="item in items"
        :key="item.id"
        class="download-row"
      >
        <Icon
          class="download-row-icon"
          :icon="downloadIcon(item.state)"
          :width="18"
          :height="18"
        />
        <div class="download-row-main">
          <div
            class="download-row-name"
            :title="item.filename"
          >
            {{ item.filename }}
          </div>
          <div class="download-row-meta">
            <span v-if="item.state === 'downloading'">{{ progressPercent(item) }}%</span>
            <span v-else>{{ stateLabel(item.state) }}</span>
          </div>
          <div
            v-if="item.state === 'downloading' || item.state === 'paused'"
            class="download-row-bar"
          >
            <div
              class="download-row-fill"
              :class="{ paused: item.state === 'paused' }"
              :style="{ width: `${progressPercent(item)}%` }"
            />
          </div>
        </div>
        <div class="download-row-actions">
          <button
            v-if="item.state === 'downloading'"
            class="download-row-btn"
            :title="t('downloads.pause')"
            @click="pause(item.id)"
          >
            <Icon
              icon="ic:round-pause"
              :width="16"
              :height="16"
            />
          </button>
          <button
            v-if="item.state === 'paused'"
            class="download-row-btn"
            :title="t('downloads.resume')"
            @click="resume(item.id)"
          >
            <Icon
              icon="ic:round-play-arrow"
              :width="16"
              :height="16"
            />
          </button>
          <button
            v-if="['pending', 'downloading', 'paused'].includes(item.state)"
            class="download-row-btn"
            :title="t('downloads.cancel')"
            @click="cancel(item.id)"
          >
            <Icon
              icon="ic:round-close"
              :width="16"
              :height="16"
            />
          </button>
          <button
            v-if="item.state === 'completed'"
            class="download-row-btn"
            :title="t('downloads.showInFolder')"
            @click="showInFolder(item.path)"
          >
            <Icon
              icon="mdi:folder-open-outline"
              :width="16"
              :height="16"
            />
          </button>
          <button
            v-if="item.state === 'completed'"
            class="download-row-btn"
            :title="t('downloads.openFile')"
            @click="openFile(item.path)"
          >
            <Icon
              icon="mdi:open-in-app"
              :width="16"
              :height="16"
            />
          </button>
          <span
            v-if="item.state === 'completed'"
            class="download-row-danger"
            :title="t('downloads.dangerousWarning')"
          >
            ⚠
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { DownloadItem, DownloadState } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useI18n } from '../composables/useI18n'

const props = defineProps<{
  popoverId: string
  data: { items: DownloadItem[] }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const { t } = useI18n()

const items = computed(() => props.data?.items ?? [])

function progressPercent(item: DownloadItem): number {
  if (!item.totalBytes)
    return 0
  return Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
}

function downloadIcon(state: DownloadState): string {
  if (state === 'downloading')
    return 'ic:round-download'
  if (state === 'paused')
    return 'ic:round-pause'
  if (state === 'completed')
    return 'ic:round-check-circle'
  if (state === 'cancelled')
    return 'ic:round-cancel'
  if (state === 'error')
    return 'ic:round-error'
  return 'ic:round-download'
}

function stateLabel(state: DownloadState): string {
  switch (state) {
    case 'downloading':
      return t('downloads.downloading')
    case 'paused':
      return t('downloads.paused')
    case 'completed':
      return t('downloads.completed')
    case 'cancelled':
      return t('downloads.cancelled')
    case 'error':
      return t('downloads.error')
    default:
      return t('downloads.pending')
  }
}

function showAll(): void {
  console.debug('[DownloadPanel] showAll')
  emit('event', 'show-all')
}
function pause(id: string): void {
  console.debug('[DownloadPanel] pause: id', id)
  emit('event', 'pause', id)
}
function resume(id: string): void {
  console.debug('[DownloadPanel] resume: id', id)
  emit('event', 'resume', id)
}
function cancel(id: string): void {
  console.debug('[DownloadPanel] cancel: id', id)
  emit('event', 'cancel', id)
}
function showInFolder(filePath: string): void {
  console.debug('[DownloadPanel] showInFolder: path', filePath)
  emit('event', 'showInFolder', filePath)
}
function openFile(filePath: string): void {
  console.debug('[DownloadPanel] openFile: path', filePath)
  emit('event', 'openFile', filePath)
}
</script>

<style scoped>
.download-panel {
  width: 320px;
  max-height: 380px;
  overflow-y: auto;
  padding: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

.download-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 8px;
  border-bottom: 1px solid var(--border-color);
}

.download-show-all {
  display: inline-flex;
  align-items: center;
  line-height: 1;
  background: none;
  border: none;
  color: var(--accent-color);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.download-panel-empty {
  padding: 20px 8px;
  text-align: center;
  color: var(--text-secondary);
}

.download-panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.download-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  cursor: default;
}

.download-row:hover {
  background: var(--bg-tertiary);
}

.download-row-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.download-row-main {
  flex: 1;
  min-width: 0;
}

.download-row-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-row-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.download-row-bar {
  margin-top: 4px;
  height: 3px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.download-row-fill {
  height: 100%;
  background: var(--accent-color);
  transition: width 0.2s ease;
}

.download-row-fill.paused {
  background: var(--text-muted);
}

.download-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.download-row-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 50%;
}

.download-row-btn:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.download-row-danger {
  font-size: 12px;
  color: #ff9800;
  cursor: help;
}
</style>
