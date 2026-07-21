<template>
  <ul
    ref="rootRef"
    class="popover-menu"
  >
    <template
      v-for="(item, idx) in items"
      :key="item.id ?? idx"
    >
      <li
        v-if="item.type === 'separator'"
        class="popover-divider-item"
      >
        <div class="popover-divider" />
      </li>
      <li
        v-else
        class="popover-menu-item"
        :class="{
          'disabled': item.disabled,
          'danger': item.danger,
          'has-submenu': item.type === 'submenu',
          'active': item.id === activeId,
        }"
        @mouseenter="emit('hover', item.id)"
        @click="onClick(item)"
      >
        <Icon
          v-if="item.icon"
          :icon="item.icon"
          class="popover-item-icon"
          width="16"
          height="16"
        />
        <span class="popover-item-label">
          <template v-if="item.accessKey && showMnemonics">
            <u>{{ item.label?.charAt(0) }}</u>
            {{ item.label?.slice(1) }}
          </template>
          <template v-else>{{ item.label }}</template>
        </span>
        <span
          v-if="item.shortcut"
          class="popover-item-shortcut"
        >{{ item.shortcut }}</span>
        <Icon
          v-if="item.type === 'submenu'"
          icon="mdi:chevron-right"
          class="popover-submenu-arrow"
          width="16"
          height="16"
        />
        <div
          v-if="item.type === 'submenu' && openSubIds.has(item.id) && item.children"
          class="popover-submenu"
          :class="submenuSide"
        >
          <PopoverMenu
            :items="item.children"
            :popover-id="popoverId"
            :show-mnemonics="showMnemonics"
            :active-id="activeId"
            :open-sub-ids="openSubIds"
            @hover="(id) => emit('hover', id)"
            @select="(id) => emit('select', id)"
          />
        </div>
      </li>
    </template>
  </ul>
</template>

<script setup lang="ts">
import type { MenuItem } from '@browser/ipc-contract'
import { Icon } from '@iconify/vue'
import { computed, ref } from 'vue'

defineProps<{
  items: MenuItem[]
  popoverId: string
  showMnemonics: boolean
  activeId: string
  openSubIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'hover', itemId: string): void
  (e: 'select', itemId: string): void
}>()

/** 当前菜单元素的 DOM 引用，用于计算可视区域内剩余空间 */
const rootRef = ref<HTMLUListElement | null>(null)

/**
 * 根据当前菜单在视口中的位置动态决定子菜单展开方向。
 * 右侧空间充足时向右展开，否则向左展开，避免子菜单超出可视区域。
 * 箭头图标始终指向右边（mdi:chevron-right）。
 */
const submenuSide = computed<'left' | 'right'>(() => {
  if (!rootRef.value)
    return 'right'
  const rect = rootRef.value.getBoundingClientRect()
  const rightSpace = window.innerWidth - rect.right
  const leftSpace = rect.left
  return rightSpace >= leftSpace ? 'right' : 'left'
})

function onClick(item: MenuItem): void {
  if (item.disabled) {
    console.debug('[PopoverMenu] onClick: 禁用项忽略 itemId', item.id)
    return
  }
  if (item.type === 'submenu') {
    emit('hover', item.id)
    return
  }
  console.debug('[PopoverMenu] onClick: 选中 itemId', item.id)
  emit('select', item.id)
}
</script>

<style lang="less" scoped>
.popover-menu {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
}
.popover-menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  min-width: 180px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  &:hover {
    background: var(--bg-tertiary);
  }
  &.disabled {
    color: var(--text-secondary);
    cursor: default;
    &:hover {
      background: transparent;
    }
  }
  &.active {
    background: var(--bg-tertiary);
  }
  &.danger {
    color: var(--danger-color);
  }
}
.popover-item-icon {
  flex-shrink: 0;
}
.popover-item-label {
  flex: 1;
}
.popover-item-shortcut {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 12px;
}
.popover-submenu-arrow {
  margin-left: auto;
}
.popover-submenu {
  position: absolute;
  top: -4px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 10;
  :deep(> .popover-menu) {
    background: transparent;
    border: none;
    border-radius: 0;
  }
  &.right {
    left: 100%;
    margin-left: 2px;
  }
  &.left {
    right: 100%;
    margin-right: 2px;
  }
}
.popover-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--bg-tertiary);
}
</style>
