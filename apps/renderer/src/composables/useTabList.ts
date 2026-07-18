import type { TabState } from '@browser/ipc-contract'
import { ref } from 'vue'

/**
 * 共享标签数据与操作逻辑，供 TabBar（水平）和 VerticalTabBar（垂直）复用。
 * thumbnailCache 为模块级共享，切换布局后缩略图不丢失。
 */
const thumbnailCache = new Map<string, string>()

export function useTabList() {
  const tabs = ref<TabState[]>([])

  let stateChangeHandler: ((state: TabState) => void) | null = null
  let createdHandler: ((state: TabState) => void) | null = null
  let removedHandler: ((tabId: string) => void) | null = null

  async function loadTabs(): Promise<void> {
    tabs.value = await window.browserAPI.getList()
    console.debug('[useTabList] loadTabs: count', tabs.value.length)
  }

  function activateTab(tabId: string): void {
    console.debug('[useTabList] activateTab: tabId', tabId)
    window.browserAPI.activateTab(tabId)
  }

  function closeTab(tabId: string): void {
    console.debug('[useTabList] closeTab: tabId', tabId)
    window.browserAPI.closeTab(tabId)
  }

  function createNewTab(): void {
    console.debug('[useTabList] createNewTab')
    window.browserAPI.createNewTab()
  }

  /** 固定标签永远排在最前（保持相对顺序），并同步到主进程层叠顺序。 */
  function applyOrder(): void {
    const pinned = tabs.value.filter((t) => t.isPinned)
    const unpinned = tabs.value.filter((t) => !t.isPinned)
    const ordered = [...pinned, ...unpinned]
    tabs.value = ordered
    console.debug('[useTabList] applyOrder: order', ordered.map((t) => t.id).join(','))
    window.browserAPI.reorderTabs(ordered.map((t) => t.id))
  }

  /** 将新标签插入到目标标签右侧并同步顺序。 */
  function insertAfter(targetId: string, newTab: TabState): void {
    const others = tabs.value.filter((t) => t.id !== newTab.id)
    const pos = others.findIndex((t) => t.id === targetId)
    others.splice(pos + 1, 0, newTab)
    tabs.value = others
    window.browserAPI.reorderTabs(others.map((t) => t.id))
  }

  /** 内部页（wmfx://）按路由展示固定图标，避免回退到破图 favicon。 */
  function isInternalUrl(url: string): boolean {
    return url.startsWith('wmfx://')
  }

  function newTabToRight(tab: TabState): void {
    void window.browserAPI.createTab({ url: 'wmfx://newtab', activate: true }).then((newTab) => {
      insertAfter(tab.id, newTab)
    })
  }

  function reloadTab(tab: TabState): void {
    window.browserAPI.reload(tab.id)
  }

  function duplicateTab(tab: TabState): void {
    const { committedUrl } = tab.navigation
    void window.browserAPI
      .createTab({ url: committedUrl, sessionId: tab.sessionId, activate: true })
      .then((newTab) => {
        insertAfter(tab.id, newTab)
      })
  }

  function togglePin(tab: TabState): void {
    window.browserAPI.setPinned(tab.id, !tab.isPinned)
  }

  function toggleMute(tab: TabState): void {
    window.browserAPI.setMuted(tab.id, !tab.isMuted)
  }

  function closeOthers(tab: TabState): void {
    const ids = tabs.value.filter((t) => t.id !== tab.id).map((t) => t.id)
    console.debug('[useTabList] closeOthers: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  function closeRight(tab: TabState): void {
    const idx = tabs.value.findIndex((t) => t.id === tab.id)
    const ids = tabs.value.slice(idx + 1).map((t) => t.id)
    console.debug('[useTabList] closeRight: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  function closeLeft(tab: TabState): void {
    const idx = tabs.value.findIndex((t) => t.id === tab.id)
    const ids = tabs.value.slice(0, idx).map((t) => t.id)
    console.debug('[useTabList] closeLeft: keep close', tab.id, ids.join(','))
    window.browserAPI.closeTabs(ids)
  }

  /** 注册 IPC 监听器，必须在 loadTabs 之前调用以避免竞态。 */
  function setup(): void {
    stateChangeHandler = (state: TabState) => {
      const idx = tabs.value.findIndex((t) => t.id === state.id)
      if (idx >= 0) {
        const wasPinned = tabs.value[idx].isPinned
        const prevUrl = tabs.value[idx].navigation.committedUrl
        tabs.value[idx] = state
        if (prevUrl !== state.navigation.committedUrl) {
          thumbnailCache.delete(state.id)
        }
        if (wasPinned !== state.isPinned) {
          applyOrder()
        }
      }
    }

    createdHandler = (state: TabState) => {
      if (!tabs.value.some((t) => t.id === state.id)) {
        tabs.value.push(state)
        applyOrder()
      }
    }

    removedHandler = (tabId: string) => {
      tabs.value = tabs.value.filter((t) => t.id !== tabId)
    }

    window.browserAPI.onTabStateChange(stateChangeHandler)
    window.browserAPI.onTabCreated(createdHandler)
    window.browserAPI.onTabRemoved(removedHandler)
  }

  function cleanup(): void {
    if (stateChangeHandler)
      window.browserAPI.removeListener(
        'tab:state-change',
        stateChangeHandler as (...args: unknown[]) => void
      )
    if (createdHandler)
      window.browserAPI.removeListener(
        'tab:created',
        createdHandler as (...args: unknown[]) => void
      )
    if (removedHandler)
      window.browserAPI.removeListener(
        'tab:removed',
        removedHandler as (...args: unknown[]) => void
      )
    stateChangeHandler = null
    createdHandler = null
    removedHandler = null
  }

  return {
    tabs,
    thumbnailCache,
    loadTabs,
    setup,
    cleanup,
    applyOrder,
    insertAfter,
    isInternalUrl,
    activateTab,
    closeTab,
    createNewTab,
    newTabToRight,
    reloadTab,
    duplicateTab,
    togglePin,
    toggleMute,
    closeOthers,
    closeRight,
    closeLeft,
  }
}
