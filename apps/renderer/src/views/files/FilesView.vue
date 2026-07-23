<template>
  <div
    class="files-view"
    @contextmenu.prevent
  >
    <FilesSidebar />
    <section class="files-content">
      <FilesTopbar />
      <FilesListHeader v-if="viewMode === 'list'" />
      <FileList />
      <FilesStatusBar />
    </section>
  </div>
  <QuickLookPanel />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide } from 'vue'
import FileList from './FileList.vue'
import FilesListHeader from './FilesListHeader.vue'
import FilesSidebar from './FilesSidebar.vue'
import FilesStatusBar from './FilesStatusBar.vue'
import FilesTopbar from './FilesTopbar.vue'
import { fileStoreInjectionKey } from './injectionKeys'
import QuickLookPanel from './QuickLookPanel.vue'
import { useFileStore } from './useFileStore'

const store = useFileStore()
provide(fileStoreInjectionKey, store)

const {
  viewMode,
} = store

onMounted(() => {
  store.setup()
})

onUnmounted(() => {
  store.teardown()
})
</script>

<style scoped lang="less">
.files-view {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-secondary);
}

/* 右侧内容区 */
.files-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}
</style>
