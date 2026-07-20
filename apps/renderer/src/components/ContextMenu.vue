<template>
  <Teleport to="body">
    <div
      v-if="overlay"
      class="context-menu-mask"
      @contextmenu.prevent="dismiss"
      @pointerdown="dismiss"
    />
    <div
      ref="rootRef"
      class="context-menu-root"
      :style="rootStyle"
      @contextmenu.prevent
    >
      <PopoverMenu
        :items="items"
        :popover-id="popoverId"
        :show-mnemonics="false"
        active-id=""
        :open-sub-ids="emptySet"
        @select="onSelect"
        @hover="() => {}"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { MenuItem } from '@browser/ipc-contract'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PopoverMenu from '../panel/PopoverMenu.vue'

const props = defineProps<{
  popoverId: string
  items: MenuItem[]
  x: number
  y: number
  onSelect: (id: string) => void
  onDismiss: () => void
  /** overlay 模式：渲染全屏遮罩挡住页面，点击遮罩即关闭（用于不希望用户操作后台元素的场景） */
  overlay?: boolean
}>()

const rootRef = ref<HTMLDivElement | null>(null)
const emptySet = new Set<string>()

const rootStyle = ref<Record<string, string>>({
  position: 'fixed',
  left: `${props.x}px`,
  top: `${props.y}px`,
  zIndex: '1000',
})

function onSelect(id: string): void {
  props.onSelect(id)
}

function dismiss(): void {
  props.onDismiss()
}

function onDocPointerDown(event: MouseEvent): void {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    dismiss()
  }
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismiss()
  }
}

function onScroll(): void {
  dismiss()
}

onMounted(() => {
  // 防止菜单溢出右/下边界：简单回退到可视区域内
  const el = rootRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    let left = props.x
    let top = props.y
    if (rect.right > window.innerWidth)
      left = Math.max(8, window.innerWidth - rect.width - 8)
    if (rect.bottom > window.innerHeight)
      top = Math.max(8, window.innerHeight - rect.height - 8)
    rootStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: '1000',
    }
  }
  // 延迟注册，避免本次右键的 pointerdown 立即触发关闭
  setTimeout(() => {
    window.addEventListener('pointerdown', onDocPointerDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
  }, 0)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onScroll)
})
</script>

<style lang="less" scoped>
.context-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.35);
}
.context-menu-root {
  background: var(--bg-secondary);
  border: 1px solid var(--bg-tertiary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  padding: 4px 0;
}
</style>
