<template>
  <IconButton
    class="app-menu"
    icon="carbon:overflow-menu-vertical"
    :size="18"
    :active="isOpen"
    :title="t('tab.menu')"
    @click.stop="openMenu"
  />
</template>

<script setup lang="ts">
import type { MenuItem, PopoverDescriptor } from '@browser/ipc-contract'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import { Popover } from '../lib/popover'
import IconButton from './ui/IconButton.vue'

const { t } = useI18n()

const isOpen = ref(false)
let dismissHandler: (() => void) | null = null

const menuItems = computed<MenuItem[]>(() => [
  { id: 'incognito', label: t('appMenu.incognito'), icon: 'mdi:account-off' },
  { id: 'wmfx://bookmarks', label: t('appMenu.bookmarks'), icon: 'mdi:bookmark' },
  { id: 'wmfx://history', label: t('appMenu.history'), icon: 'mdi:history' },
  { id: 'wmfx://downloads', label: t('appMenu.downloads'), icon: 'mdi:download' },
  { id: 'wmfx://proxy', label: t('appMenu.proxy'), icon: 'mdi:network' },
  { id: 'wmfx://settings', label: t('appMenu.settings'), icon: 'mdi:cog' },
])

function openMenu(event: MouseEvent): void {
  event.stopPropagation()
  isOpen.value = true
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const descriptor: PopoverDescriptor = { id: 'app-menu', kind: 'menu', items: menuItems.value }
  void new Popover({
    anchor: { type: 'rect', rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, placement: 'bottom-end' },
    descriptor,
    onAction: ({ menu, context }) => {
      void runMenuItem(menu.id)
      context.close()
    },
  })
}

async function runMenuItem(id: string): Promise<void> {
  if (id === 'incognito') {
    await window.browserAPI.createNewTab('incognito')
    return
  }
  const list = await window.browserAPI.getList()
  const existing = list.find(t => t.url === id || t.url.startsWith(`${id}/`))
  if (existing) {
    window.browserAPI.activateTab(existing.id)
  }
  else {
    window.browserAPI.createTab({ url: id })
  }
}

onMounted(() => {
  dismissHandler = () => {
    isOpen.value = false
  }
  window.browserAPI.onPopoverDismiss(dismissHandler)
})

onUnmounted(() => {
  if (dismissHandler) {
    window.browserAPI.removeListener('popover:dismiss', dismissHandler)
  }
})
</script>

<style scoped>
.app-menu {
  margin-left: auto;
  flex-shrink: 0;
}
</style>
