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
    downloadPath: string
    downloadPathPlaceholder: string
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
    checkForUpdates: string
    checking: string
    upToDate: string
    updateAvailable: string
    downloading: string
    downloaded: string
    notAvailable: string
    updateFailed: string
  }
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
      downloadPath: '下载路径',
      downloadPathPlaceholder: '请输入下载保存路径',
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
      checkForUpdates: '检查更新',
      checking: '正在检查更新...',
      upToDate: '已是最新版本',
      updateAvailable: '发现新版本：v{version}',
      downloading: '正在下载... {percent}%',
      downloaded: '更新已下载，将在退出时安装',
      notAvailable: '已是最新版本',
      updateFailed: '更新检查失败',
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
      downloadPath: 'Download path',
      downloadPathPlaceholder: 'Enter download path',
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
      checkForUpdates: 'Check for updates',
      checking: 'Checking for updates…',
      upToDate: 'Up to date',
      updateAvailable: 'Update available: v{version}',
      downloading: 'Downloading… {percent}%',
      downloaded: 'Update downloaded, will install on quit',
      notAvailable: 'Up to date',
      updateFailed: 'Update check failed',
    },
  },
}
