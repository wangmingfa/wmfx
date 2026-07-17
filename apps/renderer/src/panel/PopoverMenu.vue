<template>
  <ul ref="rootRef" class="popover-menu">
    <template v-for="(item, idx) in items" :key="item.id ?? idx">
      <li v-if="item.type === 'separator'" class="popover-divider-item">
        <div class="popover-divider" />
      </li>
      <li
        v-else
        class="popover-menu-item"
        :class="{
          disabled: item.disabled,
          danger: item.danger,
          'has-submenu': item.type === 'submenu',
          active: item.id === activeId,
        }"
        @mouseenter="emit('hover', item.id)"
        @click="onClick(item)"
      >
        <Icon v-if="item.icon" :icon="item.icon" class="popover-item-icon" width="16" height="16" />
        <span class="popover-item-label">
          <template v-if="item.accessKey && showMnemonics">
            <u>{{ item.label?.charAt(0) }}</u>
            {{ item.label?.slice(1) }}
          </template>
          <template v-else>{{ item.label }}</template>
        </span>
        <span v-if="item.shortcut" class="popover-item-shortcut">{{ item.shortcut }}</span>
        <Icon
          v-if="item.type === 'submenu'"
          :icon="submenuSide === 'left' ? 'mdi:chevron-left' : 'mdi:chevron-right'"
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

const rootRef = ref<HTMLElement | null>(null)

/**
 * 子菜单展开方向：默认向右；当菜单右边缘距窗口右侧不足预估子菜单宽度时翻转向左，
 * 避免靠近右边界（如右上角三点菜单）的子菜单溢出屏幕并引发横向滚动条。
 */
const submenuSide = computed<'left' | 'right'>(() => {
  const el = rootRef.value
  if (!el) return 'right'
  const rect = el.getBoundingClientRect()
  const estimatedSubWidth = 220
  const spaceOnRight = window.innerWidth - rect.right
  const side: 'left' | 'right' = spaceOnRight < estimatedSubWidth ? 'left' : 'right'
  if (side === 'left') console.debug('[PopoverMenu] submenuSide: 右空间不足，翻转向左')
  return side
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
  padding: 0;
  max-height: 400px;
  overflow-y: auto;
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
  padding: 4px 0;
  z-index: 10;
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
