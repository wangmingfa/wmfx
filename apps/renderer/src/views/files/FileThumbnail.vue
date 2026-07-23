<template>
  <div class="file-thumbnail">
    <img
      v-if="status === 'loading' || status === 'loaded'"
      :data-layout-id="file.path"
      :src="thumbnailUrl"
      :alt="file.name"
      class="file-thumbnail-img"
      @load="onLoad"
      @error="onError"
    />
    <Icon
      v-else
      :icon="getFileIcon(file)"
      :width="48"
      :height="48"
      class="file-icon-large"
      :style="{ color: getFileIconColor(file) }"
    />
  </div>
</template>

<script setup lang="ts">
import type { FileEntry } from '@browser/ipc-contract'

import { Icon } from '@iconify/vue'
import { ref } from 'vue'
import { useFileDisplay } from './useFileDisplay'

const props = defineProps<{
  file: FileEntry
}>()

const { getFileIcon, getFileIconColor } = useFileDisplay()

type ThumbnailStatus = 'loading' | 'loaded' | 'failed'
const status = ref<ThumbnailStatus>('loading')

const thumbnailUrl = `wmfx://file-thumbnail?path=${encodeURIComponent(props.file.path)}`

function onLoad(): void {
  status.value = 'loaded'
}

function onError(): void {
  status.value = 'failed'
}
</script>

<style scoped lang="less">
.file-thumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-thumbnail-img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}
</style>
