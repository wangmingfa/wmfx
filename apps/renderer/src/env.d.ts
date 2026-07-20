/// <reference types="vite/client" />

import type {
  CommandPaletteData,
  CreateTabOptions,
  FindInPageOptions,
  IpcInvoke,
  LogEntry,
  NativeMenuItemDescriptor,
  PopoverAnchor,
  PopoverEventPayload,
  PopoverMode,
  PopoverOpenOptions,
  PopoverType,
  TabState,
  ThemeMode,
  UpdaterStatus,
} from '@browser/ipc-contract'

declare global {
  interface Window {
    browserAPI: {
      ping: IpcInvoke['app:ping']
      setViewportBounds: IpcInvoke['tab:setViewportBounds']
      getList: IpcInvoke['tab:getList']
      activateTab: IpcInvoke['tab:activate']
      closeTab: IpcInvoke['tab:close']
      createTab: (opts: CreateTabOptions) => Promise<TabState>
      createNewTab: (sessionId?: string) => Promise<TabState>
      loadURLCurrent: (url: string) => Promise<void>
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
      deleteDownload: IpcInvoke['download:delete']
      // Dialog
      selectFolder: IpcInvoke['dialog:selectFolder']
      // File system
      fileExists: IpcInvoke['fs:fileExists']
      readDir: IpcInvoke['fs:readDir']
      stat: IpcInvoke['fs:stat']
      mkdir: IpcInvoke['fs:mkdir']
      rename: IpcInvoke['fs:rename']
      deleteFiles: IpcInvoke['fs:delete']
      copyFiles: IpcInvoke['fs:copy']
      cutFiles: IpcInvoke['fs:cut']
      pasteFiles: IpcInvoke['fs:paste']
      searchDir: IpcInvoke['fs:search']
      readFilePreview: IpcInvoke['fs:readPreview']
      getSystemDirs: IpcInvoke['fs:getSystemDirs']
      getFileBookmarks: IpcInvoke['fs:getBookmarks']
      addFileBookmark: IpcInvoke['fs:addBookmark']
      removeFileBookmark: IpcInvoke['fs:removeBookmark']
      renameFileBookmark: IpcInvoke['fs:renameBookmark']
      reorderFileBookmarks: IpcInvoke['fs:reorderBookmarks']
      watchDir: IpcInvoke['fs:watch']
      unwatchDir: IpcInvoke['fs:unwatch']
      onFilesChanged: (cb: (dirPath: string) => void) => () => void
      // Clipboard
      copyText: IpcInvoke['clipboard:copy']
      // History
      addHistory: IpcInvoke['history:add']
      deleteHistory: IpcInvoke['history:delete']
      searchHistory: IpcInvoke['history:search']
      getHistoryList: IpcInvoke['history:getList']
      getAllHistory: IpcInvoke['history:getAll']
      clearHistory: IpcInvoke['history:clear']
      clearPrivacyData: IpcInvoke['privacy:clearData']
      // Bookmark
      addBookmark: IpcInvoke['bookmark:add']
      deleteBookmark: IpcInvoke['bookmark:delete']
      renameBookmark: IpcInvoke['bookmark:rename']
      getBookmarks: IpcInvoke['bookmark:getList']
      searchBookmarks: IpcInvoke['bookmark:search']
      importBookmarks: IpcInvoke['bookmark:import']
      exportBookmarks: IpcInvoke['bookmark:export']
      // Password manager
      getPasswords: IpcInvoke['password:list']
      searchPasswords: IpcInvoke['password:search']
      savePassword: IpcInvoke['password:save']
      deletePassword: IpcInvoke['password:delete']
      onPasswordsChanged: (handler: () => void) => void
      // Page
      printPage: IpcInvoke['page:print']
      printToPDF: IpcInvoke['page:printToPDF']
      setZoom: IpcInvoke['page:setZoom']
      getZoom: IpcInvoke['page:getZoom']
      // Reader mode
      enterReadingMode: IpcInvoke['page:enterReadingMode']
      exitReadingMode: IpcInvoke['page:exitReadingMode']
      onReaderArticle: (
        handler: (article: {
          title: string
          content: string
          byline: string | null
          url: string
        }) => void
      ) => () => void
      requestReaderArticle: IpcInvoke['reader:requestArticle']
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
      moveBookmark: IpcInvoke['bookmark:move']
      onBookmarksChanged: (handler: () => void) => () => void
      onBookmarkBarChanged: (handler: () => void) => () => void
      onTabBarPositionChanged: (handler: () => void) => () => void
      // Find in Page
      startFind: (opts: FindInPageOptions) => void
      endFind: IpcInvoke['page:endFind']
      findNext: IpcInvoke['page:findNext']
      findPrevious: IpcInvoke['page:findPrevious']
      onFoundInPage: (
        handler: (data: { matches: number; activeMatch: number; tabId: string }) => void
      ) => void
      onOpenFind: (handler: (tabId: string) => void) => void
      onFocusAddressBar: (handler: () => void) => () => void
      onOpenCommandPalette: (handler: () => void) => () => void
      onOpenSettings: (handler: () => void) => () => void
      // Tab reorder
      reorderTabs: IpcInvoke['tab:reorder']
      // Tab thumbnail
      captureThumbnail: IpcInvoke['tab:captureThumbnail']
      // Tab pin / mute / batch close
      setPinned: IpcInvoke['tab:setPinned']
      setMuted: IpcInvoke['tab:setMuted']
      closeTabs: IpcInvoke['tab:closeMany']
      // Undo close tab
      reopenClosed: IpcInvoke['tab:reopenClosed']
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
      // Shell (download closure)
      showInFolder: IpcInvoke['shell:showInFolder']
      openFile: IpcInvoke['shell:openFile']
      openFileInBrowser: IpcInvoke['shell:openFileInBrowser']
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
      // Window controls
      minimizeWindow: IpcInvoke['window:minimize']
      maximizeWindow: IpcInvoke['window:maximize']
      closeWindow: IpcInvoke['window:close']
      createNewWindow: IpcInvoke['window:new']
      getWindowInfo: IpcInvoke['window:getInfo']
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
      activateSubscription: (id: string) => Promise<void>
      deactivateSubscription: (id: string) => Promise<void>
      // Log
      log: (entry: LogEntry) => void
      // Updater
      checkForUpdates: IpcInvoke['updater:check']
      getUpdaterStatus: IpcInvoke['updater:getStatus']
      onUpdaterStatus: (handler: (status: UpdaterStatus) => void) => void
      restartAndInstall: IpcInvoke['updater:restart']
      // App info
      getAppInfo: IpcInvoke['app:info']
      // Popover
      popoverOpen: (popoverId: string, options: PopoverOpenOptions) => Promise<void>
      popoverClose: (popoverId: string) => Promise<void>
      popoverSendData: (popoverId: string, data: unknown) => Promise<void>
      popoverEvent: (payload: PopoverEventPayload) => void
      onPopoverRender: (
        handler: (
          popoverId: string,
          type: PopoverType,
          anchor: PopoverAnchor,
          data?: unknown,
          mode?: PopoverMode
        ) => void
      ) => void
      popoverMeasure: (
        popoverId: string,
        size: { width: number; height: number; gutter?: number; offsetX?: number; offsetY?: number }
      ) => void
      onPopoverData: (handler: (popoverId: string, data: unknown) => void) => void
      onPopoverDismiss: (handler: (popoverId: string) => void) => void
      onPopoverEvent: (handler: (payload: PopoverEventPayload) => void) => void
      // Native Menu
      nativeMenuOpen: (
        menuId: string,
        items: NativeMenuItemDescriptor[],
        position?: { x: number; y: number }
      ) => Promise<void>
      nativeMenuClose: (menuId: string) => Promise<void>
      onNativeMenuAction: (cb: (payload: { menuId: string; itemId: string }) => void) => void
      onNativeMenuClosed: (cb: (menuId: string) => void) => void
      // Proxy traffic broadcast
      onProxyTraffic: (handler: (data: { up: number; down: number }) => void) => void
      // Error / Cert Warning
      getErrorInfo: () => Promise<{
        code: number
        description: string
        requestedUrl: string
      } | null>
      retry: () => Promise<void>
      getCertWarningInfo: () => Promise<{
        host: string
        errorText: string
        requestedUrl: string
      } | null>
      trustCertAndContinue: (scope: 'once' | 'session' | 'always') => Promise<void>
      // Default browser
      setDefaultBrowser: IpcInvoke['default-browser:set']
      isDefaultBrowser: IpcInvoke['default-browser:isDefault']
      // Ad blocker
      getAdBlockStatus: IpcInvoke['adblock:getStatus']
      setAdBlockEnabled: IpcInvoke['adblock:setEnabled']
      getAdBlockRules: IpcInvoke['adblock:getRules']
      getAdBlockLog: IpcInvoke['adblock:getLog']
      // Request Interceptor
      interceptorGetStatus: IpcInvoke['interceptor:getStatus']
      interceptorSetEnabled: IpcInvoke['interceptor:setEnabled']
      interceptorGetRules: IpcInvoke['interceptor:getRules']
      interceptorAddRule: IpcInvoke['interceptor:addRule']
      interceptorUpdateRule: IpcInvoke['interceptor:updateRule']
      interceptorDeleteRule: IpcInvoke['interceptor:deleteRule']
      interceptorGetCaptured: IpcInvoke['interceptor:getCaptured']
      interceptorClearLog: IpcInvoke['interceptor:clearLog']
      // Favicon
      faviconGet: IpcInvoke['favicon:get']
      // Shortcuts
      getShortcuts: IpcInvoke['shortcuts:list']
      // Command Palette
      commandPaletteGetData: () => Promise<CommandPaletteData>
      commandPaletteExecute: (opts: { type: string; id: string; data?: unknown }) => Promise<void>
      commandPaletteSaveRecent: (actionId: string) => Promise<void>
      // Theme change broadcast
      onThemeChange: (handler: (theme: ThemeMode) => void) => void
      // Bookmark bar extras (optional, may be undefined if not implemented)
      openBookmarkFolder?: (folderId: string) => void
      dragBookmarkStart?: (bookmarkId: string) => void
      dragBookmarkDrop?: (opts: { targetParentId?: string | null; targetPosition: number }) => void
      getDragBookmarkId?: () => Promise<string | null>
    }
  }
}
