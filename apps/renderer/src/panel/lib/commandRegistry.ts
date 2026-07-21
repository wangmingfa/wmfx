/**
 * 静态命令注册表——所有可执行的浏览器操作。
 * 每个命令包含 i18n key、图标、分类、关键词和执行函数。
 * 执行函数通过 preload API 调用主进程 IPC。
 */

import { TAB_ACTION_ICONS } from '../../lib/tab-action-icons'

export type CommandCategory =
  | 'tab'
  | 'navigation'
  | 'view'
  | 'settings'
  | 'page'
  | 'window'
  | 'workspace'

export interface Command {
  id: string
  category: CommandCategory
  label: string // i18n key
  description?: string // i18n key
  icon: string // Iconify icon name
  keywords: string[]
  shortcut?: string // display text like '⌘T'
  action: () => void | Promise<void>
}

export const COMMAND_CATEGORIES: Record<CommandCategory, { label: string; icon: string }> = {
  tab: { label: 'commandPalette.categories.tabs', icon: 'carbon:folder' },
  navigation: { label: 'commandPalette.categories.navigation', icon: 'carbon:navigation' },
  view: { label: 'commandPalette.categories.view', icon: 'carbon:view' },
  settings: { label: 'commandPalette.categories.settings', icon: 'carbon:settings' },
  page: { label: 'commandPalette.categories.page', icon: 'carbon:page' },
  window: { label: 'commandPalette.categories.window', icon: 'carbon:window' },
  workspace: { label: 'commandPalette.categories.workspace', icon: 'carbon:workspace' },
}

/**
 * 获取所有静态命令。
 * 每次调用创建新的命令数组（action 回调引用最新状态）。
 */
export function getCommands(): Command[] {
  const api = window.browserAPI

  return [
    // Tab operations
    {
      id: 'tab.newTab',
      category: 'tab',
      label: 'commandPalette.actions.newTab',
      icon: TAB_ACTION_ICONS.newTab,
      keywords: ['new', 'tab', 'create', 'add', '新建', '标签'],
      shortcut: '⌘T',
      action: () => {
        void api.createNewTab()
      },
    },
    {
      id: 'tab.closeTab',
      category: 'tab',
      label: 'commandPalette.actions.closeTab',
      icon: TAB_ACTION_ICONS.close,
      keywords: ['close', 'tab', '关闭', '标签'],
      shortcut: '⌘W',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.closeTab(active.id)
        }),
    },
    {
      id: 'tab.closeOtherTabs',
      category: 'tab',
      label: 'commandPalette.actions.closeOtherTabs',
      icon: TAB_ACTION_ICONS.closeOthers,
      keywords: ['close', 'other', 'tabs', '关闭', '其他'],
      action: () =>
        api.getList().then((tabs) => {
          const others = tabs.filter((t) => !t.active && !t.isPinned)
          if (others.length > 0) api.closeTabs(others.map((t) => t.id))
        }),
    },
    {
      id: 'tab.reopenClosed',
      category: 'tab',
      label: 'commandPalette.actions.reopenClosed',
      icon: TAB_ACTION_ICONS.reopenClosed,
      keywords: ['reopen', 'closed', 'undo', '恢复', '关闭', '撤销'],
      shortcut: '⌘⇧T',
      action: () => api.reopenClosed(),
    },
    {
      id: 'tab.togglePin',
      category: 'tab',
      label: 'commandPalette.actions.togglePin',
      icon: TAB_ACTION_ICONS.pin,
      keywords: ['pin', 'unpin', '固定', '取消固定'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.setPinned(active.id, !active.isPinned)
        }),
    },
    {
      id: 'tab.toggleMute',
      category: 'tab',
      label: 'commandPalette.actions.toggleMute',
      icon: TAB_ACTION_ICONS.muteOn,
      keywords: ['mute', 'unmute', '静音', '取消静音'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.setMuted(active.id, !active.isMuted)
        }),
    },

    // Navigation
    {
      id: 'nav.goBack',
      category: 'navigation',
      label: 'commandPalette.actions.goBack',
      icon: 'carbon:arrow-left',
      keywords: ['back', 'go', '后退', '返回'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.goBack(active.id)
        }),
    },
    {
      id: 'nav.goForward',
      category: 'navigation',
      label: 'commandPalette.actions.goForward',
      icon: 'carbon:arrow-right',
      keywords: ['forward', 'go', '前进'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.goForward(active.id)
        }),
    },
    {
      id: 'nav.reload',
      category: 'navigation',
      label: 'commandPalette.actions.reload',
      icon: 'carbon:restart',
      keywords: ['reload', 'refresh', '刷新', '重新加载'],
      shortcut: 'F5',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.reload(active.id)
        }),
    },
    {
      id: 'nav.stop',
      category: 'navigation',
      label: 'commandPalette.actions.stop',
      icon: 'carbon:stop',
      keywords: ['stop', 'loading', '停止', '加载'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.stop(active.id)
        }),
    },

    // View
    {
      id: 'view.find',
      category: 'view',
      label: 'commandPalette.actions.findInPage',
      icon: 'carbon:search',
      keywords: ['find', 'search', 'page', '查找', '搜索', '页面'],
      shortcut: '⌘F',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.startFind({ tabId: active.id, searchText: '' })
        }),
    },
    {
      id: 'view.zoomIn',
      category: 'view',
      label: 'commandPalette.actions.zoomIn',
      icon: 'carbon:zoom-in',
      keywords: ['zoom', 'in', '放大', '缩放'],
      shortcut: '⌘+',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.setZoom({ tabId: active.id, factor: active.zoomFactor + 0.1 })
        }),
    },
    {
      id: 'view.zoomOut',
      category: 'view',
      label: 'commandPalette.actions.zoomOut',
      icon: 'carbon:zoom-out',
      keywords: ['zoom', 'out', '缩小', '缩放'],
      shortcut: '⌘-',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active)
            api.setZoom({ tabId: active.id, factor: Math.max(0.25, active.zoomFactor - 0.1) })
        }),
    },
    {
      id: 'view.resetZoom',
      category: 'view',
      label: 'commandPalette.actions.resetZoom',
      icon: 'carbon:zoom-reset',
      keywords: ['zoom', 'reset', '缩放', '重置'],
      shortcut: '⌘0',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.setZoom({ tabId: active.id, factor: 1 })
        }),
    },
    {
      id: 'view.fullscreen',
      category: 'view',
      label: 'commandPalette.actions.toggleFullscreen',
      icon: 'carbon:maximize',
      keywords: ['fullscreen', '全屏'],
      shortcut: '⌘⇧F',
      action: () => {
        // Toggle fullscreen via window API
        document.documentElement.requestFullscreen?.()
      },
    },
    {
      id: 'view.print',
      category: 'view',
      label: 'commandPalette.actions.print',
      icon: 'carbon:printer',
      keywords: ['print', '打印'],
      shortcut: '⌘P',
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.printPage({ tabId: active.id })
        }),
    },
    {
      id: 'view.savePdf',
      category: 'view',
      label: 'commandPalette.actions.saveAsPdf',
      icon: 'carbon:document-pdf',
      keywords: ['save', 'pdf', '保存', 'PDF'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) api.printToPDF({ tabId: active.id })
        }),
    },
    {
      id: 'view.readerMode',
      category: 'view',
      label: 'commandPalette.actions.toggleReaderMode',
      icon: 'carbon:document',
      keywords: ['reader', 'mode', '阅读', '模式'],
      action: () =>
        api.getList().then((tabs) => {
          const active = tabs.find((t) => t.active)
          if (active) {
            if (active.isReaderMode) api.exitReadingMode(active.id)
            else api.enterReadingMode(active.id)
          }
        }),
    },
    {
      id: 'view.darkMode',
      category: 'view',
      label: 'commandPalette.actions.toggleDarkMode',
      icon: 'carbon:moon',
      keywords: ['dark', 'mode', 'theme', '暗色', '模式', '主题'],
      action: () =>
        api.getTheme().then((theme) => {
          api.setTheme(theme === 'dark' ? 'light' : 'dark')
        }),
    },

    // Settings
    {
      id: 'settings.open',
      category: 'settings',
      label: 'commandPalette.actions.openSettings',
      icon: 'carbon:settings',
      keywords: ['settings', 'preferences', '设置', '偏好'],
      action: () => api.loadURLCurrent('wmfx://settings'),
    },
    {
      id: 'settings.bookmarkBar',
      category: 'settings',
      label: 'commandPalette.actions.toggleBookmarkBar',
      icon: 'carbon:bookmark',
      keywords: ['bookmark', 'bar', '书签', '栏'],
      action: () =>
        api.getSetting('showBookmarkBar').then((v) => {
          api.setSetting({ key: 'showBookmarkBar', value: !v })
        }),
    },
    {
      id: 'settings.tabBarPosition',
      category: 'settings',
      label: 'commandPalette.actions.toggleTabBarPosition',
      icon: 'carbon:side-panel-close',
      keywords: ['tab', 'bar', 'position', '标签', '栏', '位置'],
      action: () =>
        api.getSetting('tabBarPosition').then((v) => {
          api.setSetting({ key: 'tabBarPosition', value: v === 'top' ? 'left' : 'top' })
        }),
    },
    {
      id: 'settings.adBlock',
      category: 'settings',
      label: 'commandPalette.actions.toggleAdBlock',
      icon: 'carbon:locked-and-blocked',
      keywords: ['ad', 'block', '广告', '拦截'],
      action: () =>
        api.getAdBlockStatus().then((status) => {
          api.setAdBlockEnabled(!status.enabled)
        }),
    },
    {
      id: 'settings.proxyRule',
      category: 'settings',
      label: 'commandPalette.actions.setProxyRule',
      icon: 'carbon:server-proxy',
      keywords: ['proxy', 'rule', '代理', '规则'],
      action: () => api.setProxyMode('rule'),
    },
    {
      id: 'settings.proxyGlobal',
      category: 'settings',
      label: 'commandPalette.actions.setProxyGlobal',
      icon: 'carbon:server-proxy',
      keywords: ['proxy', 'global', '代理', '全局'],
      action: () => api.setProxyMode('global'),
    },
    {
      id: 'settings.proxyDirect',
      category: 'settings',
      label: 'commandPalette.actions.setProxyDirect',
      icon: 'carbon:server-proxy',
      keywords: ['proxy', 'direct', '代理', '直连'],
      action: () => api.setProxyMode('direct'),
    },

    // Pages
    {
      id: 'page.history',
      category: 'page',
      label: 'commandPalette.actions.openHistory',
      icon: 'carbon:time',
      keywords: ['history', '历史', '记录'],
      action: () => api.loadURLCurrent('wmfx://history'),
    },
    {
      id: 'page.bookmarks',
      category: 'page',
      label: 'commandPalette.actions.openBookmarks',
      icon: 'carbon:bookmark',
      keywords: ['bookmarks', '书签'],
      action: () => api.loadURLCurrent('wmfx://bookmarks'),
    },
    {
      id: 'page.passwords',
      category: 'page',
      label: 'commandPalette.actions.openPasswords',
      icon: 'carbon:password',
      keywords: ['passwords', '密码', '管理'],
      action: () => api.loadURLCurrent('wmfx://passwords'),
    },
    {
      id: 'page.downloads',
      category: 'page',
      label: 'commandPalette.actions.openDownloads',
      icon: 'carbon:download',
      keywords: ['downloads', '下载'],
      action: () => api.loadURLCurrent('wmfx://downloads'),
    },
    {
      id: 'page.proxy',
      category: 'page',
      label: 'commandPalette.actions.openProxy',
      icon: 'carbon:server-proxy',
      keywords: ['proxy', 'settings', '代理', '设置'],
      action: () => api.loadURLCurrent('wmfx://proxy'),
    },
    {
      id: 'page.files',
      category: 'page',
      label: 'commandPalette.actions.openFiles',
      icon: 'carbon:folder',
      keywords: ['files', 'file', 'manager', '文件', '管理'],
      action: () => api.loadURLCurrent('wmfx://files'),
    },

    // Window
    {
      id: 'window.new',
      category: 'window',
      label: 'commandPalette.actions.newWindow',
      icon: 'carbon:add-alt',
      keywords: ['new', 'window', '新建', '窗口'],
      shortcut: '⌘N',
      action: () => api.createNewWindow(),
    },
    {
      id: 'window.incognito',
      category: 'window',
      label: 'commandPalette.actions.newIncognitoWindow',
      icon: 'carbon:view-off',
      keywords: ['incognito', 'private', 'window', '无痕', '隐私', '窗口'],
      shortcut: '⌘⇧N',
      action: () => api.createNewWindow({ incognito: true }),
    },
  ]
}
