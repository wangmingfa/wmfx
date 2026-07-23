/**
 * 标签右键菜单的共享逻辑：构建 DropdownMenu descriptor + 动作路由（runTabAction）。
 * TabBar 与 VerticalTabBar 共用同一套动作映射，仅菜单项集合按 orientation 不同：
 *   - horizontal：new-tab-right / close-left / close-right
 *   - vertical  ：close-above / close-below（对应 closeLeft / closeRight）
 * closeLeft 即「关闭左侧/上方」，closeRight 即「关闭右侧/下方」，语义由 orientation 决定翻译。
 */
import type { TabState } from '@browser/ipc-contract'
import { ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { DropdownMenu } from '@/lib/dropdown-menu'
import { TAB_ACTION_ICONS } from '@/lib/tab-action-icons'

/** 右键菜单所需的标签操作函数（来自 useTabList）。 */
export interface TabActionHandlers {
  newTabToRight: (tab: TabState) => void
  reloadTab: (tab: TabState) => void
  duplicateTab: (tab: TabState) => void
  togglePin: (tab: TabState) => void
  toggleMute: (tab: TabState) => void
  closeTab: (tabId: string) => void
  closeOthers: (tab: TabState) => void
  closeLeft: (tab: TabState) => void
  closeRight: (tab: TabState) => void
}

export type TabBarOrientation = 'horizontal' | 'vertical'

export function useTabContextMenu(handlers: TabActionHandlers, orientation: TabBarOrientation) {
  const { t } = useI18n()
  // 当前因右键菜单而高亮的标签（菜单关闭时清空）
  const activeMenuTabId = ref<string | null>(null)

  function buildItems(tab: TabState) {
    if (orientation === 'horizontal') {
      return [
        { id: 'new-tab-right', label: t('tab.closeRight'), icon: TAB_ACTION_ICONS.newTab },
        { id: 'sep-1', type: 'separator' as const },
        { id: 'reload', label: t('tab.reload'), icon: TAB_ACTION_ICONS.reload },
        { id: 'duplicate', label: t('tab.duplicate'), icon: TAB_ACTION_ICONS.duplicate },
        {
          id: 'pin',
          label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'),
          icon: TAB_ACTION_ICONS.pin,
        },
        {
          id: 'mute',
          label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
          icon: tab.isMuted ? TAB_ACTION_ICONS.muteOff : TAB_ACTION_ICONS.muteOn,
        },
        { id: 'sep-2', type: 'separator' as const },
        { id: 'close', label: t('tab.close'), icon: TAB_ACTION_ICONS.close, danger: true },
        { id: 'close-others', label: t('tab.closeOthers'), icon: TAB_ACTION_ICONS.closeOthers },
        { id: 'close-left', label: t('tab.closeLeft'), icon: TAB_ACTION_ICONS.closeLeft },
        { id: 'close-right', label: t('tab.closeRightTabs'), icon: TAB_ACTION_ICONS.closeRight },
      ]
    }
    return [
      { id: 'reload', label: t('tab.reload'), icon: TAB_ACTION_ICONS.reload },
      { id: 'duplicate', label: t('tab.duplicate'), icon: TAB_ACTION_ICONS.duplicate },
      {
        id: 'pin',
        label: tab.isPinned ? t('tab.unpinned') : t('tab.pinned'),
        icon: TAB_ACTION_ICONS.pin,
      },
      {
        id: 'mute',
        label: tab.isMuted ? t('tab.unmute') : t('tab.mute'),
        icon: tab.isMuted ? TAB_ACTION_ICONS.muteOff : TAB_ACTION_ICONS.muteOn,
      },
      { id: 'sep-1', type: 'separator' as const },
      { id: 'close', label: t('tab.close'), icon: TAB_ACTION_ICONS.close, danger: true },
      { id: 'close-others', label: t('tab.closeOthers'), icon: TAB_ACTION_ICONS.closeOthers },
      { id: 'close-above', label: t('tab.closeAbove'), icon: TAB_ACTION_ICONS.closeAbove },
      { id: 'close-below', label: t('tab.closeBelow'), icon: TAB_ACTION_ICONS.closeBelow },
    ]
  }

  function runTabAction(id: string, tab: TabState): void {
    console.debug('[useTabContextMenu] runTabAction: id tabId', id, tab.id)
    switch (id) {
      case 'new-tab-right':
        handlers.newTabToRight(tab)
        break
      case 'reload':
        handlers.reloadTab(tab)
        break
      case 'duplicate':
        handlers.duplicateTab(tab)
        break
      case 'pin':
        handlers.togglePin(tab)
        break
      case 'mute':
        handlers.toggleMute(tab)
        break
      case 'close':
        handlers.closeTab(tab.id)
        break
      case 'close-others':
        handlers.closeOthers(tab)
        break
      case 'close-left':
      case 'close-above':
        handlers.closeLeft(tab)
        break
      case 'close-right':
      case 'close-below':
        handlers.closeRight(tab)
        break
    }
  }

  function openTabContextMenu(event: MouseEvent, tab: TabState): void {
    console.debug('[useTabContextMenu] openTabContextMenu: tabId', tab.id)
    event.preventDefault()
    event.stopPropagation()
    activeMenuTabId.value = tab.id
    new DropdownMenu({
      mode: 'bounded',
      anchor: { type: 'cursor', placement: 'bottom-start' },
      descriptor: {
        id: `${orientation}-context-${tab.id}`,
        items: buildItems(tab),
      },
      onAction: ({ menu: action }) => {
        runTabAction(action.id, tab)
      },
      onDismiss: () => {
        activeMenuTabId.value = null
      },
    })
  }

  return { activeMenuTabId, openTabContextMenu }
}
