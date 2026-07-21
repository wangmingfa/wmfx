<template>
  <div class="workspace-panel">
    <div class="workspace-list">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        class="workspace-item"
        :class="{ 'workspace-item--active': ws.id === activeId }"
        @click="switchTo(ws.id)"
      >
        <div
          class="workspace-dot"
          :style="{ background: ws.color }"
        />
        <div class="workspace-info">
          <template v-if="editingId === ws.id">
            <input
              ref="editInputRef"
              v-model="editName"
              class="workspace-name-input"
              @blur="saveEdit(ws.id)"
              @keydown.enter="saveEdit(ws.id)"
              @keydown.escape="cancelEdit"
              @click.stop
            />
          </template>
          <template v-else>
            <span
              class="workspace-name"
              @dblclick.stop="startEdit(ws)"
            >{{ ws.name }}</span>
          </template>
          <span class="workspace-count">{{ ws.tabCount }} 个标签</span>
        </div>
        <div
          v-if="ws.id === activeId"
          class="workspace-check"
        >
          ✓
        </div>
        <Icon
          v-if="ws.id !== 'default'"
          icon="mdi:dots-vertical"
          class="workspace-more"
          @click.stop="openActionMenu($event, ws)"
        />
      </div>
    </div>
    <div class="workspace-divider" />
    <div
      class="workspace-add"
      @click="startCreate"
    >
      <template v-if="showCreateForm">
        <input
          ref="createInputRef"
          v-model="newName"
          class="workspace-name-input"
          placeholder="名称"
          @blur="createWorkspace"
          @keydown.enter="createWorkspace"
          @keydown.escape="showCreateForm = false"
        />
      </template>
      <template v-else>
        <Icon icon="mdi:plus" /> 新建 Space
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Workspace } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { nextTick, onMounted, ref } from 'vue'
import { ContextMenu } from '../lib/context-menu'

const props = defineProps<{
  popoverId: string
  data?: { workspaces: Workspace[], activeId: string }
}>()

const emit = defineEmits<{
  event: [eventName: string, eventData?: unknown]
}>()

const workspaces = ref<Workspace[]>(props.data?.workspaces ?? [])
const activeId = ref(props.data?.activeId ?? '')
const editingId = ref<string | null>(null)
const editName = ref('')
const showCreateForm = ref(false)
const newName = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)
const createInputRef = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  console.debug('[WorkspacePanel] onMounted: 加载工作区列表')
  const list = await window.browserAPI.listWorkspaces()
  workspaces.value = list
  const active = await window.browserAPI.getActiveWorkspace()
  if (active) {
    activeId.value = active.id
  }
})

async function switchTo(id: string): Promise<void> {
  console.debug('[WorkspacePanel] switchTo: id=%s', id)
  await window.browserAPI.switchWorkspace(id)
  activeId.value = id
  emit('event', 'switched', { id })
}

function startEdit(ws: Workspace): void {
  console.debug('[WorkspacePanel] startEdit: id=%s', ws.id)
  editingId.value = ws.id
  editName.value = ws.name
  nextTick(() => editInputRef.value?.focus())
}

async function saveEdit(id: string): Promise<void> {
  if (editName.value.trim()) {
    await window.browserAPI.updateWorkspace(id, { name: editName.value.trim() })
  }
  editingId.value = null
  const list = await window.browserAPI.listWorkspaces()
  workspaces.value = list
}

function cancelEdit(): void {
  editingId.value = null
}

function startCreate(): void {
  showCreateForm.value = true
  nextTick(() => createInputRef.value?.focus())
}

async function createWorkspace(): Promise<void> {
  if (newName.value.trim()) {
    const colors = [
      '#ff6b6b',
      '#ff9f43',
      '#feca57',
      '#48dbfb',
      '#4ecdc4',
      '#45b7d1',
      '#6c5ce7',
      '#a29bfe',
      '#fd79a8',
      '#00b894',
      '#636e72',
    ]
    const color = colors[workspaces.value.length % colors.length]
    console.debug('[WorkspacePanel] createWorkspace: name=%s color=%s', newName.value.trim(), color)
    await window.browserAPI.createWorkspace(newName.value.trim(), color)
    const list = await window.browserAPI.listWorkspaces()
    workspaces.value = list
  }
  showCreateForm.value = false
  newName.value = ''
}

function openActionMenu(e: MouseEvent, ws: Workspace): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const items = [
    { id: 'rename', label: '重命名', icon: 'mdi:pencil' },
    { id: 'edit-color', label: '更改颜色', icon: 'mdi:palette' },
    { id: 'delete', label: '删除', icon: 'mdi:delete', danger: true },
  ]
  // eslint-disable-next-line no-new
  new ContextMenu({
    anchor: { type: 'rect', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, placement: 'bottom-start' },
    descriptor: { id: `ws-action-${ws.id}`, items },
    onAction: ({ menu: action, context }) => {
      context.close()
      if (action.id === 'rename') {
        startEdit(ws)
      }
      else if (action.id === 'delete') {
        console.debug('[WorkspacePanel] openActionMenu: delete id=%s', ws.id)
        void window.browserAPI.deleteWorkspace(ws.id).then(async () => {
          const list = await window.browserAPI.listWorkspaces()
          workspaces.value = list
          const active = await window.browserAPI.getActiveWorkspace()
          if (active) {
            activeId.value = active.id
          }
        })
      }
      else if (action.id === 'edit-color') {
        // TODO: color picker
      }
    },
  })
}
</script>

<style lang="less" scoped>
.workspace-panel {
  width: 240px;
  padding: 8px 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.workspace-list {
  max-height: 300px;
  overflow-y: auto;
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-primary);

  &:hover {
    background: var(--bg-hover);
  }

  &--active {
    background: var(--bg-tertiary);
  }
}

.workspace-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.workspace-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.workspace-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-name-input {
  font-size: 13px;
  font-weight: 500;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 6px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
  font-family: var(--font-sans);
}

.workspace-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.workspace-check {
  color: var(--accent-color);
  font-weight: 600;
}

.workspace-more {
  opacity: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.workspace-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--bg-tertiary);
}

.workspace-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}
</style>
