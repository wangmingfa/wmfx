/**
 * 所有 i18n key 的嵌套结构（单语言形状）。
 * 重要约束：本接口所有字段必须为必填（不得出现 `?:` 可选字段），且不得添加索引签名
 *（`[key: string]: ...`）。只有这样，`messages` 的 `Record<string, Message>` 类型才能强制
 * 每个语言对象与 Message "完全一模一样"——不能多写 key、也不能漏写 key、value 类型必须一致，
 * 从而从 TS 层面保证翻译完整性（多/少 key 均编译报错）。
 */
export interface Message {
  tab: {
    newTab: string
    incognito: string
    close: string
    closeOthers: string
    pinned: string
    unpinned: string
    duplicate: string
    reload: string
    mute: string
    unmute: string
    closeLeft: string
    closeRight: string
    closeRightTabs: string
    menu: string
  }
  appMenu: {
    incognito: string
    bookmarks: string
    history: string
    downloads: string
    proxy: string
    settings: string
  }
  search: {
    engines: {
      google: string
      baidu: string
      bing: string
    }
    placeholder: string
  }
  newTab: {
    title: string
    recentHistory: string
    openInNewTab: string
  }
  bookmark: {
    title: string
    searchPlaceholder: string
    empty: string
    import: string
    export: string
    add: string
    addBookmark: string
    addSubfolder: string
    rename: string
    delete: string
    promptTitle: string
    promptUrl: string
    promptNewTitle: string
    deleteConfirm: string
  }
  find: {
    placeholder: string
  }
  addressBar: {
    placeholder: string
    zoom: string
    secure: string
    insecure: string
    internal: string
  }
  settings: {
    title: string
    theme: string
    themeModes: {
      light: string
      dark: string
      system: string
    }
    newTabUrl: string
    searchEngine: string
    defaultZoom: string
    zoomPlaceholder: string
    openInNewTab: string
    language: string
    languageOptions: {
      system: string
      chinese: string
      english: string
    }
    navAppearance: string
    navGeneral: string
    navDownloads: string
    navAbout: string
    sections: {
      basic: string
      appearance: string
      system: string
      language: string
      downloadLocation: string
      theme: string
    }
    defaultBrowser: string
    makeDefault: string
    isDefaultBrowser: string
    notDefaultBrowser: string
    defaultBrowserFailed: string
    downloadPath: string
    downloadPathEmpty: string
    selectFolder: string
    aboutTitle: string
    aboutVersion: string
  }
  history: {
    title: string
    placeholder: string
    empty: string
    contextOpenInNewTab: string
    contextDelete: string
    visits: string
    clear: string
    clearConfirm: string
  }
  proxy: {
    modeRule: string
    modeRuleDesc: string
    modeGlobal: string
    modeGlobalDesc: string
    modeDirect: string
    modeDirectDesc: string
    testing: string
    testDelay: string
    timeout: string
    noNodes: string
    noNodesDesc: string
    subscriptions: string
    tabNodes: string
    tabSubscriptions: string
    tabTraffic: string
    tabLogs: string
    on: string
    off: string
    addNamePlaceholder: string
    addUrlPlaceholder: string
    adding: string
    add: string
    noSubscriptions: string
    noSubscriptionsDesc: string
    active: string
    deactivate: string
    activate: string
    refresh: string
    delete: string
    used: string
    expire: string
    notAvailable: string
    trafficRunning: string
    trafficIdle: string
    upload: string
    download: string
    logsEmpty: string
  }
  downloads: {
    title: string
    showAll: string
    empty: string
    resume: string
    pause: string
    cancel: string
    pending: string
    downloading: string
    paused: string
    completed: string
    cancelled: string
    error: string
  }
  about: {
    updates: string
    updateLabel: string
    checkForUpdates: string
    checking: string
    upToDate: string
    latestVersion: string
    versionArch: string
    restartToUpdate: string
    updateAvailable: string
    downloading: string
    downloaded: string
    notAvailable: string
    updateFailed: string
  }
  error: {
    title: string
    description: string
    retry: string
    goBack: string
    suggestions: {
      default: string
      dns: string
      connection: string
    }
    codes: {
      '-105': string
      '-102': string
      '-118': string
      '-106': string
      '-109': string
      '-101': string
    }
  }
  certWarning: {
    title: string
    description: string
    goBack: string
    showDetails: string
    hideDetails: string
    continueAnyway: string
    trustOnce: string
    trustSession: string
    trustAlways: string
    host: string
    error: string
  }
}

/**
 * 从 Message 嵌套结构递归推导所有"叶子路径"的联合类型（点分字符串）。
 * 例：'tab.newTab' | 'downloads.showAll' | 'about.updateAvailable' ...
 * 用于约束 t() 的 key 参数，拼写错误或不存在的 key 在编译期即报错。
 */
export type I18nKey = LeafPaths<Message>

/** 递归提取嵌套对象所有叶子（string）的点分路径联合类型 */
type LeafPaths<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : T extends object
    ? {
        [K in keyof T & string]: LeafPaths<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
      }[keyof T & string]
    : never

/**
 * 需要插值的 key → 其必须接收的参数（手写维护，与 messages 同步）。
 * 仅列出含占位符（如 {title}）的 key；配合 t() 重载，使插值参数也享受编译期校验：
 * 漏传参数、参数名拼错、给不需要参数的 key 传参均报错。
 */
export interface I18nParams {
  'bookmark.deleteConfirm': { title: string }
  'about.updateAvailable': { version: string }
  'about.downloading': { percent: string | number }
  'about.versionArch': { version: string; arch: string }
}

export const messages: Record<string, Message> = {
  'zh-CN': {
    tab: {
      newTab: '新建标签页',
      incognito: '新建隐身标签页',
      close: '关闭',
      closeOthers: '关闭其它标签页',
      pinned: '固定',
      unpinned: '取消固定',
      duplicate: '复制',
      reload: '重新加载',
      mute: '将这个网站静音',
      unmute: '取消静音',
      closeLeft: '关闭左侧标签页',
      closeRight: '在右侧新增标签页',
      closeRightTabs: '关闭右侧标签页',
      menu: '菜单',
    },
    appMenu: {
      incognito: '新建隐身标签页',
      bookmarks: '书签',
      history: '历史',
      downloads: '下载',
      proxy: '代理',
      settings: '设置',
    },
    search: {
      engines: {
        google: 'Google',
        baidu: 'Baidu',
        bing: 'Bing',
      },
      placeholder: '搜索或输入网址',
    },
    newTab: {
      title: '新标签页',
      recentHistory: '最近访问',
      openInNewTab: '在新标签页中打开链接',
    },
    bookmark: {
      title: '书签',
      searchPlaceholder: '搜索书签...',
      empty: '暂无书签',
      import: '导入',
      export: '导出',
      add: '添加',
      addBookmark: '添加书签',
      addSubfolder: '添加子文件夹',
      rename: '重命名',
      delete: '删除',
      promptTitle: '书签标题：',
      promptUrl: '书签网址：',
      promptNewTitle: '新标题：',
      deleteConfirm: '删除 {title}？',
    },
    find: {
      placeholder: '在页面中查找',
    },
    addressBar: {
      placeholder: '输入网址',
      zoom: '100%',
      secure: '安全连接',
      insecure: '不安全连接',
      internal: '内部页面',
    },
    settings: {
      title: '设置',
      theme: '主题',
      themeModes: {
        light: '浅色',
        dark: '深色',
        system: '跟随系统',
      },
      newTabUrl: '新标签页地址',
      searchEngine: '默认搜索引擎',
      defaultZoom: '默认缩放',
      zoomPlaceholder: '例如 https://www.baidu.com',
      openInNewTab: '在新标签页打开链接',
      language: '语言',
      languageOptions: {
        system: '跟随系统',
        chinese: '中文',
        english: '英文',
      },
      navAppearance: '外观',
      navGeneral: '常规',
      navDownloads: '下载',
      navAbout: '关于',
      sections: {
        basic: '启动与首页',
        appearance: '外观',
        system: '系统',
        language: '语言',
        downloadLocation: '下载位置',
        theme: '主题',
      },
      defaultBrowser: '默认浏览器',
      makeDefault: '设为默认浏览器',
      isDefaultBrowser: 'WMFX 已是默认浏览器',
      notDefaultBrowser: 'WMFX 不是默认浏览器',
      defaultBrowserFailed: '设置失败，请手动在系统设置中更改',
      downloadPath: '下载路径',
      downloadPathEmpty: '未选择下载路径，点击右侧按钮选择',
      selectFolder: '选择文件夹',
      aboutTitle: '关于',
      aboutVersion: '版本',
    },
    history: {
      title: '历史记录',
      placeholder: '搜索历史...',
      empty: '无历史记录',
      contextOpenInNewTab: '在新标签页打开',
      contextDelete: '删除',
      visits: '次访问',
      clear: '清空记录',
      clearConfirm: '确定要清空所有历史记录吗？',
    },
    proxy: {
      modeRule: '规则',
      modeRuleDesc: '根据规则决定走代理还是直连（如国内直连、国外走代理）',
      modeGlobal: '全局',
      modeGlobalDesc: '所有流量都走代理节点',
      modeDirect: '直连',
      modeDirectDesc: '所有流量直连，不走代理',
      testing: '测试中...',
      testDelay: '测试延迟',
      timeout: '超时',
      noNodes: '暂无代理节点',
      noNodesDesc: '请先在「订阅」页添加订阅，然后返回选择节点。',
      subscriptions: '订阅',
      tabNodes: '节点',
      tabSubscriptions: '订阅',
      tabTraffic: '流量',
      tabLogs: '日志',
      on: '开启',
      off: '关闭',
      addNamePlaceholder: '名称',
      addUrlPlaceholder: '订阅链接',
      adding: '添加中...',
      add: '添加',
      noSubscriptions: '暂无订阅',
      noSubscriptionsDesc: '添加一个代理订阅链接开始使用。你可以从代理服务商处获取订阅地址。',
      active: '已启用',
      deactivate: '停用',
      activate: '启用',
      refresh: '刷新',
      delete: '删除',
      used: '已用',
      expire: '到期',
      notAvailable: '无',
      trafficRunning: 'Mihomo 运行中 — 实时流量监控已开启。',
      trafficIdle: 'Mihomo 运行时将显示实时流量数据。',
      upload: '上传',
      download: '下载',
      logsEmpty: '暂无日志。Mihomo 运行时将显示日志。',
    },
    downloads: {
      title: '下载',
      showAll: '查看全部',
      empty: '暂无下载',
      resume: '继续',
      pause: '暂停',
      cancel: '取消',
      pending: '等待中',
      downloading: '下载中',
      paused: '已暂停',
      completed: '已完成',
      cancelled: '已取消',
      error: '错误',
    },
    about: {
      updates: '更新',
      updateLabel: '更新检查',
      checkForUpdates: '检查更新',
      checking: '正在检查更新...',
      upToDate: '已是最新版本',
      latestVersion: '已是最新版本',
      versionArch: '版本 {version} · {arch}',
      restartToUpdate: '重启更新',
      updateAvailable: '发现新版本：v{version}',
      downloading: '正在下载... {percent}%',
      downloaded: '更新已下载，将在退出时安装',
      notAvailable: '已是最新版本',
      updateFailed: '更新检查失败',
    },
    error: {
      title: '无法访问此网站',
      description: '网页加载时出错',
      retry: '重试',
      goBack: '返回',
      suggestions: {
        default: '请检查你的网络连接后重试。',
        dns: '请检查 DNS 设置或稍后重试。',
        connection: '请检查网站地址是否正确，或稍后重试。',
      },
      codes: {
        '-105': '找不到服务器（DNS 解析失败）',
        '-102': '连接被重置',
        '-118': '连接超时',
        '-106': '网络连接中断',
        '-109': '无法访问此服务器',
        '-101': '连接被拒绝',
      },
    },
    certWarning: {
      title: '您的连接不是私密连接',
      description: '此网站的安全证书存在问题，继续访问可能存在风险。',
      goBack: '返回',
      showDetails: '显示详情',
      hideDetails: '隐藏详情',
      continueAnyway: '仍然继续',
      trustOnce: '仅本次信任',
      trustSession: '本次会话信任',
      trustAlways: '始终信任此网站',
      host: '主机',
      error: '错误',
    },
  },
  'en-US': {
    tab: {
      newTab: 'New Tab',
      incognito: 'New Incognito Tab',
      close: 'Close',
      closeOthers: 'Close Other Tabs',
      pinned: 'Pin',
      unpinned: 'Unpin',
      duplicate: 'Duplicate',
      reload: 'Reload',
      mute: 'Mute Site',
      unmute: 'Unmute Site',
      closeLeft: 'Close Tabs to the Left',
      closeRight: 'Open New Tab to the Right',
      closeRightTabs: 'Close Tabs to the Right',
      menu: 'Menu',
    },
    appMenu: {
      incognito: 'New Incognito Tab',
      bookmarks: 'Bookmarks',
      history: 'History',
      downloads: 'Downloads',
      proxy: 'Proxy',
      settings: 'Settings',
    },
    search: {
      engines: {
        google: 'Google',
        baidu: 'Baidu',
        bing: 'Bing',
      },
      placeholder: 'Search or enter URL',
    },
    newTab: {
      title: 'New Tab',
      recentHistory: 'Recent History',
      openInNewTab: 'Open links in new tab',
    },
    bookmark: {
      title: 'Bookmarks',
      searchPlaceholder: 'Search bookmarks...',
      empty: 'No bookmarks',
      import: 'Import',
      export: 'Export',
      add: 'Add',
      addBookmark: 'Add bookmark',
      addSubfolder: 'Add subfolder',
      rename: 'Rename',
      delete: 'Delete',
      promptTitle: 'Bookmark title:',
      promptUrl: 'Bookmark URL:',
      promptNewTitle: 'New title:',
      deleteConfirm: 'Delete {title}?',
    },
    find: {
      placeholder: 'Find in page',
    },
    addressBar: {
      placeholder: 'Enter URL',
      zoom: '100%',
      secure: 'Secure connection',
      insecure: 'Insecure connection',
      internal: 'Internal page',
    },
    settings: {
      title: 'Settings',
      theme: 'Theme',
      themeModes: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
      newTabUrl: 'New Tab URL',
      searchEngine: 'Default search engine',
      defaultZoom: 'Default zoom',
      zoomPlaceholder: 'e.g. https://www.baidu.com',
      openInNewTab: 'Open links in new tab',
      language: 'Language',
      languageOptions: {
        system: 'Follow system',
        chinese: 'Chinese',
        english: 'English',
      },
      navAppearance: 'Appearance',
      navGeneral: 'General',
      navDownloads: 'Downloads',
      navAbout: 'About',
      sections: {
        basic: 'Startup & Home',
        appearance: 'Appearance',
        system: 'System',
        language: 'Language',
        downloadLocation: 'Download location',
        theme: 'Theme',
      },
      defaultBrowser: 'Default browser',
      makeDefault: 'Make WMFX the default browser',
      isDefaultBrowser: 'WMFX is already the default browser',
      notDefaultBrowser: 'WMFX is not the default browser',
      defaultBrowserFailed: 'Failed to set, please change it in system settings',
      downloadPath: 'Download path',
      downloadPathEmpty: 'No download path selected, click the button on the right to choose',
      selectFolder: 'Select folder',
      aboutTitle: 'About',
      aboutVersion: 'Version',
    },
    history: {
      title: 'History',
      placeholder: 'Search history...',
      empty: 'No history',
      contextOpenInNewTab: 'Open in new tab',
      contextDelete: 'Delete',
      visits: 'visits',
      clear: 'Clear history',
      clearConfirm: 'Clear all history records?',
    },
    proxy: {
      modeRule: 'Rule',
      modeRuleDesc: 'Decide proxy or direct by rules (e.g., direct for China, proxy for overseas)',
      modeGlobal: 'Global',
      modeGlobalDesc: 'All traffic goes through proxy',
      modeDirect: 'Direct',
      modeDirectDesc: 'All traffic goes direct, no proxy',
      testing: 'Testing...',
      testDelay: 'Test Delay',
      timeout: 'timeout',
      noNodes: 'No proxy nodes available',
      noNodesDesc:
        'Please add a subscription in the Subscriptions tab first, then come back to select nodes.',
      subscriptions: 'Subscriptions',
      tabNodes: 'Nodes',
      tabSubscriptions: 'Subscriptions',
      tabTraffic: 'Traffic',
      tabLogs: 'Logs',
      on: 'ON',
      off: 'OFF',
      addNamePlaceholder: 'Name',
      addUrlPlaceholder: 'Subscription URL',
      adding: 'Adding...',
      add: 'Add',
      noSubscriptions: 'No subscriptions yet',
      noSubscriptionsDesc:
        'Add a proxy subscription link to get started. You can get a subscription URL from your proxy service provider.',
      active: 'Active',
      deactivate: 'Deactivate',
      activate: 'Activate',
      refresh: 'Refresh',
      delete: 'Delete',
      used: 'Used',
      expire: 'Expire',
      notAvailable: 'N/A',
      trafficRunning: 'Mihomo is running — live traffic monitoring active.',
      trafficIdle: 'Real-time traffic data will be available when mihomo is running.',
      upload: 'Upload',
      download: 'Download',
      logsEmpty: 'No logs yet. Logs will appear when mihomo is running.',
    },
    downloads: {
      title: 'Downloads',
      showAll: 'Show all',
      empty: 'No downloads',
      resume: 'Resume',
      pause: 'Pause',
      cancel: 'Cancel',
      pending: 'Pending',
      downloading: 'Downloading',
      paused: 'Paused',
      completed: 'Completed',
      cancelled: 'Cancelled',
      error: 'Error',
    },
    about: {
      updates: 'Updates',
      updateLabel: 'Update check',
      checkForUpdates: 'Check for updates',
      checking: 'Checking for updates...',
      upToDate: 'Up to date',
      latestVersion: 'Up to date',
      versionArch: 'Version {version} · {arch}',
      restartToUpdate: 'Restart to update',
      updateAvailable: 'New version available: v{version}',
      downloading: 'Downloading... {percent}%',
      downloaded: 'Update downloaded, will be installed on quit',
      notAvailable: 'Up to date',
      updateFailed: 'Update check failed',
    },
    error: {
      title: "This site can't be reached",
      description: 'An error occurred while loading the page',
      retry: 'Retry',
      goBack: 'Go back',
      suggestions: {
        default: 'Check your network connection and try again.',
        dns: 'Check your DNS settings or try again later.',
        connection: 'Check the website address and try again later.',
      },
      codes: {
        '-105': 'Server not found (DNS resolution failed)',
        '-102': 'Connection was reset',
        '-118': 'Connection timed out',
        '-106': 'Network connection was interrupted',
        '-109': 'Server unreachable',
        '-101': 'Connection refused',
      },
    },
    certWarning: {
      title: 'Your connection is not private',
      description: 'The security certificate of this site has issues. Continuing may pose a risk.',
      goBack: 'Go back',
      showDetails: 'Show details',
      hideDetails: 'Hide details',
      continueAnyway: 'Continue anyway',
      trustOnce: 'Trust once',
      trustSession: 'Trust for this session',
      trustAlways: 'Always trust this site',
      host: 'Host',
      error: 'Error',
    },
  },
}
