<template>
  <IconButton
    class="app-menu"
    icon="carbon:overflow-menu-vertical"
    :size="18"
    :active="isOpen"
    :title="t('tab.menu')"
    @click.stop="openMenu"
  />
  <ClearDataDialog v-model:show="showClearDialog" />
</template>

<script setup lang="ts">
import type { MenuItem } from '@browser/ipc-contract'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '../composables/useI18n'
import { DropdownMenu } from '../lib/dropdown-menu'
import ClearDataDialog from './ClearDataDialog.vue'
import IconButton from './ui/IconButton.vue'

const { t } = useI18n()

const isOpen = ref(false)
const showBookmarkBar = ref(false)
const showClearDialog = ref(false)

function refreshBookmarkBar(): void {
  void window.browserAPI.getSetting('showBookmarkBar').then((v) => {
    showBookmarkBar.value = Boolean(v)
    console.debug('[AppMenuButton] refreshBookmarkBar: showBookmarkBar', showBookmarkBar.value)
  })
}

const menuItems = computed<MenuItem[]>(() => {
  const bookmarksChildren: MenuItem[] = []
  if (showBookmarkBar.value) {
    bookmarksChildren.push({ id: 'hide-bar', label: t('appMenu.hideBookmarkBar'), icon: 'mdi:bookmark-off' })
  } else {
    bookmarksChildren.push({ id: 'show-bar', label: t('appMenu.showBookmarkBar'), icon: 'mdi:bookmark' })
  }
  bookmarksChildren.push({ id: 'all-bookmarks', label: t('appMenu.allBookmarks'), icon: 'mdi:bookmark-multiple' })

  return [
    { id: 'incognito', label: t('appMenu.incognito'), icon: 'mdi:account-off' },
    { id: 'new-window', label: t('appMenu.newWindow'), icon: 'mdi:window-open' },
    {
      id: 'bookmarks',
      label: t('appMenu.bookmarks'),
      icon: 'mdi:bookmark',
      type: 'submenu',
      children: bookmarksChildren,
    },
    { id: 'wmfx://history', label: t('appMenu.history'), icon: 'mdi:history' },
    { id: 'wmfx://downloads', label: t('appMenu.downloads'), icon: 'mdi:download' },
    { id: 'wmfx://proxy', label: t('appMenu.proxy'), icon: 'mdi:network' },
    { id: 'wmfx://settings', label: t('appMenu.settings'), icon: 'mdi:cog' },
    { id: 'clear-data', label: t('appMenu.clearData'), icon: 'mdi:delete-sweep' },
  ]
})

function openMenu(event: MouseEvent): void {
  event.stopPropagation()
  isOpen.value = true
  console.debug('[AppMenuButton] openMenu: enter')

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()

  const menu = new DropdownMenu({
    mode: 'bounded',
    anchor: {
      type: 'rect',
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      placement: 'bottom-end',
    },
    descriptor: { id: 'app-menu', items: menuItems.value },
    onDismiss: () => {
      isOpen.value = false
      refreshBookmarkBar()
    },
    onAction: ({ menu: action }) => {
      void runMenuItem(action.id)
    },
  })
  void menu
}

async function runMenuItem(id: string): Promise<void> {
  console.debug('[AppMenuButton] runMenuItem: id', id)
  if (id === 'clear-data') {
    console.debug('[AppMenuButton] runMenuItem: open clear-data dialog')
    showClearDialog.value = true
    return
  }
  if (id === 'incognito') {
    await window.browserAPI.createNewTab('incognito')
    return
  }
  if (id === 'new-window') {
    await window.browserAPI.createNewWindow()
    return
  }
  if (id === 'show-bar') {
    await window.browserAPI.setSetting({ key: 'showBookmarkBar', value: true })
    refreshBookmarkBar()
    return
  }
  if (id === 'hide-bar') {
    await window.browserAPI.setSetting({ key: 'showBookmarkBar', value: false })
    refreshBookmarkBar()
    return
  }
  if (id === 'all-bookmarks') {
    await openBookmarkManager()
    return
  }
  const list = await window.browserAPI.getList()
  const existing = list.find((t) => t.navigation.displayUrl === id || t.navigation.displayUrl.startsWith(`${id}/`))
  if (existing) {
    console.debug('[AppMenuButton] runMenuItem: activate existing tab id', existing.id)
    window.browserAPI.activateTab(existing.id)
  } else {
    console.debug('[AppMenuButton] runMenuItem: create new tab url', id)
    window.browserAPI.createTab({ url: id })
  }
}

async function openBookmarkManager(): Promise<void> {
  console.debug('[AppMenuButton] openBookmarkManager: enter')
  const id = 'wmfx://bookmarks'
  const list = await window.browserAPI.getList()
  const existing = list.find((t) => t.navigation.displayUrl === id || t.navigation.displayUrl.startsWith(`${id}/`))
  if (existing) {
    window.browserAPI.activateTab(existing.id)
  } else {
    window.browserAPI.createTab({ url: id })
  }
}

onMounted(() => {
  refreshBookmarkBar()
})
</script>

<style scoped>
.app-menu {
  margin-left: auto;
  flex-shrink: 0;
}
</style>
