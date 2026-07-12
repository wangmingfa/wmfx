/// <reference types="vite/client" />

import type {
  CreateTabOptions,
  FindInPageOptions,
  IpcInvoke,
  TabState,
} from '@browser/ipc-contract'

declare global {
  interface Window {
    browserAPI: {
      ping: IpcInvoke['app:ping']
      setViewportBounds: IpcInvoke['tab:setViewportBounds']
      setSidebarOpen: IpcInvoke['tab:setSidebarOpen']
      getList: IpcInvoke['tab:getList']
      activateTab: IpcInvoke['tab:activate']
      closeTab: IpcInvoke['tab:close']
      createTab: (opts: CreateTabOptions) => Promise<void>
      goBack: IpcInvoke['nav:goBack']
      goForward: IpcInvoke['nav:goForward']
      reload: IpcInvoke['nav:reload']
      stop: IpcInvoke['nav:stop']
      loadURL: IpcInvoke['nav:loadURL']
      // Download
      createDownload: IpcInvoke['download:create']
      pauseDownload: IpcInvoke['download:pause']
      resumeDownload: IpcInvoke['download:resume']
      cancelDownload: IpcInvoke['download:cancel']
      getDownload: IpcInvoke['download:get']
      getDownloads: IpcInvoke['download:getList']
      setDownloadPath: IpcInvoke['download:setPath']
      // History
      addHistory: IpcInvoke['history:add']
      deleteHistory: IpcInvoke['history:delete']
      searchHistory: IpcInvoke['history:search']
      getHistoryList: IpcInvoke['history:getList']
      clearHistory: IpcInvoke['history:clear']
      // Bookmark
      addBookmark: IpcInvoke['bookmark:add']
      deleteBookmark: IpcInvoke['bookmark:delete']
      renameBookmark: IpcInvoke['bookmark:rename']
      getBookmarks: IpcInvoke['bookmark:getList']
      searchBookmarks: IpcInvoke['bookmark:search']
      importBookmarks: IpcInvoke['bookmark:import']
      exportBookmarks: IpcInvoke['bookmark:export']
      // Page
      printPage: IpcInvoke['page:print']
      printToPDF: IpcInvoke['page:printToPDF']
      setZoom: IpcInvoke['page:setZoom']
      getZoom: IpcInvoke['page:getZoom']
      // Settings
      getSetting: IpcInvoke['settings:get']
      setSetting: IpcInvoke['settings:set']
      getAllSettings: IpcInvoke['settings:getAll']
      // QuickLinks
      getQuickLinks: IpcInvoke['settings:getQuickLinks']
      setQuickLinks: IpcInvoke['settings:setQuickLinks']
      // Autocomplete
      getAutocompleteSuggestions: IpcInvoke['autocomplete:suggestions']
      // Bookmark
      isBookmarked: IpcInvoke['bookmark:isBookmarked']
      // Find in Page
      startFind: (opts: FindInPageOptions) => void
      endFind: IpcInvoke['page:endFind']
      findNext: IpcInvoke['page:findNext']
      findPrevious: IpcInvoke['page:findPrevious']
      onFoundInPage: (
        handler: (data: { matches: number; activeMatch: number; tabId: string }) => void
      ) => void
      // Tab reorder
      reorderTabs: IpcInvoke['tab:reorder']
      // Theme
      getTheme: IpcInvoke['theme:get']
      setTheme: IpcInvoke['theme:set']
      // Events
      onTabStateChange: (handler: (state: TabState) => void) => void
      onTabCreated: (handler: (state: TabState) => void) => void
      onTabRemoved: (handler: (tabId: string) => void) => void
      onDownloadProgress: (
        handler: (data: {
          id: string
          state: string
          receivedBytes: number
          totalBytes: number
        }) => void
      ) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
      // Proxy
      startProxy: () => Promise<void>
      stopProxy: () => Promise<void>
      getProxyStatus: () => Promise<{ running: boolean; pid?: number; port?: number }>
      getProxies: () => Promise<
        Record<string, { name: string; type: string; now?: string; all?: string[] }>
      >
      switchProxyNode: (groupName: string, nodeName: string) => Promise<void>
      getProxyMode: () => Promise<string>
      setProxyMode: (mode: 'rule' | 'global' | 'direct') => Promise<void>
      checkProxyDelay: (groupName: string) => Promise<{ nodeName: string; delay: number }[]>
      // Subscription
      getSubscriptions: () => Promise<
        {
          id: string
          name: string
          url: string
          last_update: number
          expire: number
          upload: number
          download: number
          total: number
        }[]
      >
      addSubscription: (url: string, name: string) => Promise<{ id: string }>
      removeSubscription: (id: string) => Promise<void>
      updateSubscription: (id: string) => Promise<void>
    }
  }
}
