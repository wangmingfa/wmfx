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
    incognitoWindow: string
    newWindow: string
    bookmarks: string
    passwords: string
    showBookmarkBar: string
    hideBookmarkBar: string
    allBookmarks: string
    history: string
    downloads: string
    proxy: string
    settings: string
    clearData: string
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
    remove: string
    addSubfolder: string
    rename: string
    delete: string
    promptTitle: string
    promptUrl: string
    promptNewTitle: string
    deleteConfirm: string
    deleteTitle: string
    labelTitle: string
    labelUrl: string
    confirmOk: string
    cancel: string
    more: string
  }
  find: {
    placeholder: string
  }
  reader: {
    enter: string
    exit: string
    failed: string
    byline: string
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
    searchSuggestions: string
    launchBehavior: string
    launchBehaviorOptions: {
      restore: string
      newtab: string
      homepage: string
    }
    defaultFont: string
    defaultFontSize: string
    defaultEncoding: string
    defaultZoom: string
    zoomPlaceholder: string
    openInNewTab: string
    openBookmarkInNewTab: string
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
    navPrivacy: string
    navShortcuts: string
    openClearDialog: string
    clearDataDesc: string
    clearDataTitle: string
    adBlock: string
    adBlockStats: string
    adBlockRulesTitle: string
    adBlockRulesSearch: string
    adBlockRulesEmpty: string
    adBlockRulesHint: string
    adBlockLogTitle: string
    adBlockLogEmpty: string
    forceDarkOn: string
    forceDarkOff: string
    printPage: string
    adBlockLogTime: string
    adBlockSourceBuiltin: string
    adBlockSourceCustom: string
    adBlockSourceAllow: string
    clearDataSuccess: string
    dataCookies: string
    dataCache: string
    dataLocalStorage: string
    dataFormData: string
    clearDataError: string
    clearDataCancel: string
    sections: {
      basic: string
      appearance: string
      system: string
      language: string
      downloadLocation: string
      theme: string
      privacy: string
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
    tabBarPosition: string
    tabBarPositionOptions: { top: string; left: string }
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
    clearTitle: string
    clearPositive: string
    clearNegative: string
    today: string
    yesterday: string
    thisWeek: string
    earlier: string
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
  passwords: {
    title: string
    searchPlaceholder: string
    add: string
    edit: string
    delete: string
    save: string
    cancel: string
    domain: string
    domainPlaceholder: string
    username: string
    usernamePlaceholder: string
    password: string
    passwordPlaceholder: string
    note: string
    notePlaceholder: string
    reveal: string
    hide: string
    copy: string
    empty: string
    noResult: string
    deleteConfirm: string
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
    showInFolder: string
    openFile: string
    dangerousWarning: string
    copyLink: string
    delete: string
    deleted: string
    today: string
    yesterday: string
    earlier: string
    unknown: string
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
  shortcuts: {
    navGroupNavigation: string
    navGroupTab: string
    navGroupWindow: string
    navGroupDevtools: string
    scopeInApp: string
    scopeGlobal: string
    emptyGlobal: string
  }
  files: {
    systemDirs: string
    bookmarks: string
    searchPlaceholder: string
    sortName: string
    sortSize: string
    sortModified: string
    sortType: string
    listView: string
    iconView: string
    emptyDir: string
    itemCount: string
    open: string
    openInNewTab: string
    rename: string
    delete: string
    copy: string
    cut: string
    newFolder: string
    addBookmark: string
    paste: string
    selectAll: string
    selected: string
    totalCount: string
    selectedCount: string
    nameCol: string
    kindCol: string
    sizeCol: string
    dateCol: string
    openInBrowser: string
    kindFolder: string
    kindImage: string
    kindVideo: string
    kindAudio: string
    kindPdf: string
    kindArchive: string
    kindCode: string
    kindDoc: string
    kindOther: string
    accessDenied: string
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
  'passwords.deleteConfirm': { domain: string }
  'settings.adBlockStats': { count: number | string; rules: number | string }
  'about.updateAvailable': { version: string }
  'about.downloading': { percent: string | number }
  'about.versionArch': { version: string; arch: string }
  'files.itemCount': { count: number | string }
  'files.totalCount': { count: number | string }
  'files.selectedCount': { count: number | string }
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
      incognitoWindow: '无痕窗口',
      newWindow: '新建窗口',
      bookmarks: '书签',
      passwords: '密码',
      showBookmarkBar: '显示书签栏',
      hideBookmarkBar: '隐藏书签栏',
      allBookmarks: '所有书签',
      history: '历史',
      downloads: '下载',
      proxy: '代理',
      settings: '设置',
      clearData: '清空缓存',
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
      remove: '移除书签',
      addSubfolder: '添加子文件夹',
      rename: '重命名',
      delete: '删除',
      promptTitle: '书签标题：',
      promptUrl: '书签网址：',
      promptNewTitle: '新标题：',
      deleteConfirm: '删除 {title}？',
      deleteTitle: '删除书签',
      labelTitle: '标题',
      labelUrl: '网址',
      confirmOk: '确定',
      cancel: '取消',
      more: '更多书签',
    },
    find: {
      placeholder: '在页面中查找',
    },
    reader: {
      enter: '阅读模式',
      exit: '退出阅读模式',
      failed: '当前页面无法进入阅读模式',
      byline: '作者',
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
      searchSuggestions: '实时搜索建议',
      launchBehavior: '启动行为',
      launchBehaviorOptions: {
        restore: '恢复上次会话',
        newtab: '打开新标签页',
        homepage: '打开主页',
      },
      defaultFont: '默认字体',
      defaultFontSize: '默认字号',
      defaultEncoding: '默认编码',
      defaultZoom: '默认缩放',
      zoomPlaceholder: '例如 https://www.baidu.com',
      openInNewTab: '在新标签页打开链接',
      openBookmarkInNewTab: '书签栏书签在新标签页打开',
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
      navPrivacy: '隐私与安全',
      openClearDialog: '清除浏览数据',
      clearDataDesc: '清除 Cookie、缓存等浏览数据',
      clearDataTitle: '清除浏览数据',
      adBlock: '广告拦截',
      adBlockStats: '已拦截 {count} 个请求，共 {rules} 条规则',
      adBlockRulesTitle: '广告拦截规则',
      adBlockRulesSearch: '搜索域名...',
      adBlockRulesEmpty: '暂无规则',
      adBlockRulesHint:
        '每行是一个被拦截的域名，覆盖其所有子域（如 a.doubleclick.net）。标签含义：内置=预置清单，自定义=你添加的黑名单，白名单=放行域名。规则在请求发出前生效，仅按域名匹配，不含具体网页路径。',
      adBlockLogTitle: '拦截历史',
      adBlockLogEmpty: '暂无拦截记录',
      forceDarkOn: '强制暗色：开启',
      forceDarkOff: '强制暗色：关闭',
      printPage: '打印',
      adBlockLogTime: '时间',
      adBlockSourceBuiltin: '内置',
      adBlockSourceCustom: '自定义',
      adBlockSourceAllow: '白名单',
      dataCookies: 'Cookie',
      dataCache: '缓存',
      dataLocalStorage: '本地存储',
      dataFormData: '表单数据（近似清除）',
      clearDataSuccess: '已清除浏览数据',
      clearDataError: '清除失败',
      clearDataCancel: '取消',
      sections: {
        basic: '启动与首页',
        appearance: '外观',
        system: '系统',
        language: '语言',
        downloadLocation: '下载位置',
        theme: '主题',
        privacy: '隐私与安全',
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
      tabBarPosition: '标签栏位置',
      tabBarPositionOptions: { top: '顶部', left: '左侧' },
      navShortcuts: '快捷键',
    },
    shortcuts: {
      navGroupNavigation: '导航',
      navGroupTab: '标签',
      navGroupWindow: '窗口',
      navGroupDevtools: '开发者工具',
      scopeInApp: '应用内',
      scopeGlobal: '全局',
      emptyGlobal: '暂无全局快捷键',
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
      clearTitle: '清空历史记录',
      clearPositive: '清空',
      clearNegative: '取消',
      today: '今天',
      yesterday: '昨天',
      thisWeek: '本周',
      earlier: '更早',
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
    passwords: {
      title: '密码',
      searchPlaceholder: '搜索站点或用户名...',
      add: '添加密码',
      edit: '编辑密码',
      delete: '删除',
      save: '保存',
      cancel: '取消',
      domain: '站点',
      domainPlaceholder: 'example.com',
      username: '用户名',
      usernamePlaceholder: '用户名 / 邮箱',
      password: '密码',
      passwordPlaceholder: '请输入密码',
      note: '备注',
      notePlaceholder: '可选',
      reveal: '显示',
      hide: '隐藏',
      copy: '复制',
      empty: '暂无保存的密码',
      noResult: '没有匹配的密码',
      deleteConfirm: '确定要删除 {domain} 的密码吗？',
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
      showInFolder: '在文件夹中显示',
      openFile: '打开文件',
      dangerousWarning: '此文件类型可能存在安全风险',
      copyLink: '复制链接',
      delete: '删除',
      deleted: '已删除',
      today: '今天',
      yesterday: '昨天',
      earlier: '更早',
      unknown: '未知',
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
    files: {
      systemDirs: '系统目录',
      bookmarks: '文件书签',
      searchPlaceholder: '搜索当前目录…',
      sortName: '名称',
      sortSize: '大小',
      sortModified: '修改时间',
      sortType: '类型',
      listView: '列表视图',
      iconView: '图标视图',
      emptyDir: '此文件夹为空',
      itemCount: '共 {count} 项',
      open: '打开',
      openInNewTab: '在新标签页打开',
      rename: '重命名',
      delete: '删除',
      copy: '复制',
      cut: '剪切',
      newFolder: '新建文件夹',
      addBookmark: '添加当前目录为书签',
      paste: '粘贴',
      selectAll: '全选',
      selected: '已选中',
      totalCount: '总共 {count} 个项目',
      selectedCount: '已选择 {count} 个项目',
      nameCol: '名称',
      kindCol: '种类',
      sizeCol: '大小',
      dateCol: '修改时间',
      openInBrowser: '在浏览器中打开',
      kindFolder: '文件夹',
      kindImage: '图片',
      kindVideo: '视频',
      kindAudio: '音频',
      kindPdf: 'PDF',
      kindArchive: '压缩包',
      kindCode: '代码',
      kindDoc: '文档',
      kindOther: '其他',
      accessDenied: '该目录受保护或无权访问',
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
      incognitoWindow: 'Incognito Window',
      newWindow: 'New Window',
      bookmarks: 'Bookmarks',
      passwords: 'Passwords',
      showBookmarkBar: 'Show bookmark bar',
      hideBookmarkBar: 'Hide bookmark bar',
      allBookmarks: 'All bookmarks',
      history: 'History',
      downloads: 'Downloads',
      proxy: 'Proxy',
      settings: 'Settings',
      clearData: 'Clear cache',
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
      remove: 'Remove bookmark',
      addSubfolder: 'Add subfolder',
      rename: 'Rename',
      delete: 'Delete',
      promptTitle: 'Bookmark title:',
      promptUrl: 'Bookmark URL:',
      promptNewTitle: 'New title:',
      deleteConfirm: 'Delete {title}?',
      deleteTitle: 'Delete bookmark',
      labelTitle: 'Title',
      labelUrl: 'URL',
      confirmOk: 'OK',
      cancel: 'Cancel',
      more: 'More bookmarks',
    },
    find: {
      placeholder: 'Find in page',
    },
    reader: {
      enter: 'Reader mode',
      exit: 'Exit reader mode',
      failed: 'This page cannot be simplified',
      byline: 'By',
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
      searchSuggestions: 'Live search suggestions',
      launchBehavior: 'On startup',
      launchBehaviorOptions: {
        restore: 'Restore last session',
        newtab: 'Open a new tab',
        homepage: 'Open homepage',
      },
      defaultFont: 'Default font',
      defaultFontSize: 'Default font size',
      defaultEncoding: 'Default encoding',
      defaultZoom: 'Default zoom',
      zoomPlaceholder: 'e.g. https://www.baidu.com',
      openInNewTab: 'Open links in new tab',
      openBookmarkInNewTab: 'Open bookmark bar items in new tab',
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
      navPrivacy: 'Privacy & Security',
      openClearDialog: 'Clear browsing data',
      clearDataDesc: 'Clear cookies, cache and other browsing data',
      clearDataTitle: 'Clear browsing data',
      adBlock: 'Ad blocker',
      adBlockStats: 'Blocked {count} requests, {rules} rules in total',
      adBlockRulesTitle: 'Ad block rules',
      adBlockRulesSearch: 'Search domain...',
      adBlockRulesEmpty: 'No rules',
      adBlockRulesHint:
        'Each row is a blocked domain, covering all its subdomains (e.g. a.doubleclick.net). Tags: Built-in=preset list, Custom=your blacklist, Allow=whitelisted domain. Rules apply before a request is sent and match by domain only, not by page path.',
      adBlockLogTitle: 'Block history',
      adBlockLogEmpty: 'No blocked requests yet',
      forceDarkOn: 'Force dark: on',
      forceDarkOff: 'Force dark: off',
      printPage: 'Print',
      adBlockLogTime: 'Time',
      adBlockSourceBuiltin: 'Built-in',
      adBlockSourceCustom: 'Custom',
      adBlockSourceAllow: 'Allow',
      dataCookies: 'Cookies',
      dataCache: 'Cache',
      dataLocalStorage: 'Local storage',
      dataFormData: 'Form data (approximate)',
      clearDataSuccess: 'Browsing data cleared',
      clearDataError: 'Failed to clear',
      clearDataCancel: 'Cancel',
      sections: {
        basic: 'Startup & Home',
        appearance: 'Appearance',
        system: 'System',
        language: 'Language',
        downloadLocation: 'Download location',
        theme: 'Theme',
        privacy: 'Privacy & Security',
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
      tabBarPosition: 'Tab bar position',
      tabBarPositionOptions: { top: 'Top', left: 'Left' },
      navShortcuts: 'Shortcuts',
    },
    shortcuts: {
      navGroupNavigation: 'Navigation',
      navGroupTab: 'Tabs',
      navGroupWindow: 'Window',
      navGroupDevtools: 'Developer Tools',
      scopeInApp: 'In-app',
      scopeGlobal: 'Global',
      emptyGlobal: 'No global shortcuts',
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
      clearTitle: 'Clear history',
      clearPositive: 'Clear',
      clearNegative: 'Cancel',
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This week',
      earlier: 'Earlier',
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
    passwords: {
      title: 'Passwords',
      searchPlaceholder: 'Search site or username...',
      add: 'Add password',
      edit: 'Edit password',
      delete: 'Delete',
      save: 'Save',
      cancel: 'Cancel',
      domain: 'Site',
      domainPlaceholder: 'example.com',
      username: 'Username',
      usernamePlaceholder: 'Username / email',
      password: 'Password',
      passwordPlaceholder: 'Enter password',
      note: 'Note',
      notePlaceholder: 'Optional',
      reveal: 'Show',
      hide: 'Hide',
      copy: 'Copy',
      empty: 'No saved passwords',
      noResult: 'No matching passwords',
      deleteConfirm: 'Delete the password for {domain}?',
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
      showInFolder: 'Show in folder',
      openFile: 'Open file',
      dangerousWarning: 'This file type may be risky',
      copyLink: 'Copy link',
      delete: 'Delete',
      deleted: 'Deleted',
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier',
      unknown: 'Unknown',
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
    files: {
      systemDirs: 'System Directories',
      bookmarks: 'File Bookmarks',
      searchPlaceholder: 'Search current directory…',
      sortName: 'Name',
      sortSize: 'Size',
      sortModified: 'Modified',
      sortType: 'Type',
      listView: 'List view',
      iconView: 'Icon view',
      emptyDir: 'This folder is empty',
      itemCount: '{count} items',
      open: 'Open',
      openInNewTab: 'Open in new tab',
      rename: 'Rename',
      delete: 'Delete',
      copy: 'Copy',
      cut: 'Cut',
      newFolder: 'New Folder',
      addBookmark: 'Add current directory to bookmarks',
      paste: 'Paste',
      selectAll: 'Select All',
      selected: 'selected',
      totalCount: '{count} items total',
      selectedCount: '{count} items selected',
      nameCol: 'Name',
      kindCol: 'Kind',
      sizeCol: 'Size',
      dateCol: 'Modified',
      openInBrowser: 'Open in Browser',
      kindFolder: 'Folder',
      kindImage: 'Image',
      kindVideo: 'Video',
      kindAudio: 'Audio',
      kindPdf: 'PDF',
      kindArchive: 'Archive',
      kindCode: 'Code',
      kindDoc: 'Document',
      kindOther: 'Other',
      accessDenied: 'This directory is protected or access denied',
    },
  },
}
