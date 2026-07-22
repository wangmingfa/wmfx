<template>
  <aside class="files-sidebar">
    <div class="sidebar-section">
      <div class="sidebar-header">
        {{ t('files.systemDirs') }}
      </div>
      <div
        v-for="dir in systemDirs"
        :key="dir.path"
        class="sidebar-item"
        @click="emit('navigate', dir.path)"
      >
        <Icon
          :icon="dir.icon"
          :width="18"
          :height="18"
          class="sidebar-icon"
        />
        <span class="sidebar-label">{{ dir.name }}</span>
      </div>
    </div>

    <div class="sidebar-divider" />

    <div class="sidebar-section">
      <div class="sidebar-header">
        <span>{{ t('files.bookmarks') }}</span>
        <IconButton
          icon="mdi:plus"
          :btn-size="20"
          :tooltip="t('files.addBookmark')"
          @click="handleAddBookmark"
        />
      </div>
      <div
        v-for="bm in fileBookmarks"
        :key="bm.id"
        class="sidebar-item"
        :class="{ 'is-active': activeBookmarkId === bm.id || renamingBookmarkId === bm.id }"
        @click="renamingBookmarkId === bm.id ? undefined : emit('navigate', bm.path)"
        @contextmenu.prevent="handleBookmarkContextMenu($event, bm)"
      >
        <Icon
          :icon="bm.icon"
          :width="18"
          :height="18"
          class="sidebar-icon"
        />
        <input
          v-if="renamingBookmarkId === bm.id"
          :ref="(el) => setBookmarkRenameInput(el)"
          v-model="renamingBookmarkName"
          class="sidebar-rename-input"
          :title="renamingBookmarkName"
          @click.stop
          @keydown.enter="confirmBookmarkRename"
          @keydown.esc="cancelBookmarkRename"
          @blur="confirmBookmarkRename"
        />
        <span
          v-else
          class="sidebar-label"
        >{{ bm.name }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { FileBookmark, MenuItem, SystemDir } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { ref } from 'vue'

import IconButton from '@/components/ui/IconButton.vue'
import { useI18n } from '@/composables/useI18n'
import { useToast } from '@/composables/useToast'
import { ContextMenu } from '@/lib/context-menu'

/**
 * 文件管理器侧栏：系统目录快捷入口 + 书签列表。
 * 书签的添加/重命名/删除与右键菜单全部内聚在本组件内，
 * 数据变更后通过 refreshMetadata 通知父组件重新拉取。
 */
const props = defineProps<{
  systemDirs: SystemDir[]
  fileBookmarks: FileBookmark[]
  currentPath: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
  refreshMetadata: []
}>()

const { t } = useI18n()
const toast = useToast()

// 书签重命名状态（仅修改展示名）
const renamingBookmarkId = ref<string | null>(null)
const renamingBookmarkName = ref('')
// 右键菜单打开时处于激活态的书签（高亮显示）
const activeBookmarkId = ref<string | null>(null)
// 书签重命名输入框（v-for 内同一时刻仅一个渲染）；用函数 ref 确保正确绑定
const bookmarkRenameInput = ref<HTMLInputElement | null>(null)
function setBookmarkRenameInput(el: unknown): void {
  bookmarkRenameInput.value = (el as HTMLInputElement | null) ?? null
}

// ─── 书签右键菜单（重命名 / 删除） ─────────────────────────

function handleBookmarkContextMenu(event: MouseEvent, bm: FileBookmark): void {
  console.debug('[FilesSidebar] handleBookmarkContextMenu:', bm.name)
  event.preventDefault()
  activeBookmarkId.value = bm.id
  const items: MenuItem[] = [
    { id: 'openNewTab', label: t('files.openInNewTab'), icon: 'mdi:tab' },
    { id: 'rename', label: t('files.rename'), icon: 'mdi:pencil' },
    { id: 'delete', label: t('files.delete'), icon: 'mdi:trash-can', danger: true },
  ]
  const menu = new ContextMenu({
    mode: 'normal',
    anchor: { type: 'point', x: event.clientX, y: event.clientY },
    descriptor: { id: 'bookmark-context-menu', items },
    onAction: ({ menu: action }) => {
      switch (action.id) {
        case 'openNewTab':
          window.browserAPI.createTab({ url: `wmfx://files${bm.path}` })
          break
        case 'rename':
          startBookmarkRename(bm)
          break
        case 'delete':
          handleDeleteBookmark(bm)
          break
      }
    },
    onDismiss: () => {
      activeBookmarkId.value = null
    },
  })
  void menu
}

function startBookmarkRename(bm: FileBookmark): void {
  console.debug('[FilesSidebar] startBookmarkRename:', bm.name)
  renamingBookmarkId.value = bm.id
  renamingBookmarkName.value = bm.name
  // 延迟聚焦：等右键菜单关闭并释放焦点后再聚焦输入框，避免被菜单关闭抢走焦点
  setTimeout(() => {
    const el = bookmarkRenameInput.value
    if (el) {
      el.focus()
      el.select()
    }
  }, 100)
}

async function confirmBookmarkRename(): Promise<void> {
  const id = renamingBookmarkId.value
  if (!id) {
    return
  }
  const newName = renamingBookmarkName.value.trim()
  cancelBookmarkRename()
  const bm = props.fileBookmarks.find(b => b.id === id)
  if (!bm || newName === bm.name || !newName) {
    return
  }
  try {
    await window.browserAPI.renameFileBookmark(id, newName)
    emit('refreshMetadata')
  } catch (err) {
    console.error('[FilesSidebar] confirmBookmarkRename error:', err)
    toast.error((err as Error).message || '重命名书签失败')
  }
}

function cancelBookmarkRename(): void {
  renamingBookmarkId.value = null
  renamingBookmarkName.value = ''
}

async function handleDeleteBookmark(bm: FileBookmark): Promise<void> {
  console.debug('[FilesSidebar] handleDeleteBookmark:', bm.name)
  try {
    await window.browserAPI.removeFileBookmark(bm.id)
    emit('refreshMetadata')
  } catch (err) {
    console.error('[FilesSidebar] handleDeleteBookmark error:', err)
    toast.error((err as Error).message || '删除书签失败')
  }
}

// 添加书签
async function handleAddBookmark(): Promise<void> {
  console.debug('[FilesSidebar] handleAddBookmark')
  const baseName = props.currentPath.split('/').pop() || '书签'
  // 同名书签追加序号，如「项目」「项目 (2)」「项目 (3)」
  const existing = new Set(props.fileBookmarks.map(b => b.name))
  let bmName = baseName
  if (existing.has(bmName)) {
    let n = 2
    while (existing.has(`${baseName} (${n})`)) {
      n++
    }
    bmName = `${baseName} (${n})`
  }
  try {
    await window.browserAPI.addFileBookmark(props.currentPath, bmName)
    emit('refreshMetadata')
  } catch (err) {
    console.error('[FilesSidebar] handleAddBookmark error:', err)
    toast.error((err as Error).message || '添加书签失败')
  }
}
</script>

<style scoped lang="less">
/* 左侧快捷访问 */
.files-sidebar {
  width: 200px;
  flex-shrink: 0;
  padding: 16px 8px;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  background: var(--bg-secondary);

  .sidebar-section {
    margin-bottom: 16px;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sidebar-divider {
    height: 1px;
    background: var(--border-color);
    margin: 8px 0 16px;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    color: var(--text-primary);

    &:hover {
      background: var(--bg-hover);
    }

    &.is-active {
      background: var(--bg-selected);
    }
  }

  .sidebar-icon {
    flex-shrink: 0;
    opacity: 0.8;
  }

  .sidebar-label {
    height: 22px;
    line-height: 22px;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sidebar-rename-input {
    box-sizing: border-box;
    height: 22px;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    padding: 0 4px;
    border: 1px solid var(--accent-color);
    border-radius: 4px;
    background: var(--bg-input-focus);
    color: var(--text-primary);
    outline: none;
  }
}
</style>
