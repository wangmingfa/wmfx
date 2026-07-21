<template>
  <div class="tab-thumbnail-panel">
    <div class="tab-thumbnail-img-wrap">
      <img
        v-if="data.src && !imgError"
        :src="data.src"
        class="tab-thumbnail-img"
        @error="imgError = true"
      />
      <div
        v-else-if="data.loading"
        class="tab-thumbnail-loading"
      />
      <div
        v-else
        class="tab-thumbnail-no-preview"
      >
        无法预览
      </div>
    </div>
    <div class="tab-thumbnail-title">
      {{ data.title }}
    </div>
    <div class="tab-thumbnail-url">
      {{ data.url }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  popoverId: string
  data: {
    src: string | null
    loading: boolean
    title: string
    url: string
  }
}>()

const imgError = ref(false)
watch(
  () => props.data.src,
  () => {
    imgError.value = false
  },
)
</script>

<style scoped>
.tab-thumbnail-panel {
  width: 280px;
  padding: 8px;
  box-sizing: border-box;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tab-thumbnail-img-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.tab-thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tab-thumbnail-loading {
  width: 100%;
  height: 100%;
  background: linear-gradient(110deg, var(--bg-secondary) 30%, var(--bg-tertiary) 50%, var(--bg-secondary) 70%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.tab-thumbnail-no-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.tab-thumbnail-title {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-thumbnail-url {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
</style>
