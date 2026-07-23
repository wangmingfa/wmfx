import type { FileEntry } from '@browser/ipc-contract'
import { type ComputedRef, computed, type Ref, ref, watch } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

import { useI18n } from '@/composables/useI18n'
import { useToast } from '@/composables/useToast'

/** useFileNavigation 依赖的共享状态（由 useFileStore 持有，打破与 selection/rename 的循环依赖） */
export interface FileNavigationDeps {
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  sortBy: Ref<string>
  searchQuery: Ref<string>
  viewMode: Ref<'icon' | 'list'>
  directoryError: Ref<string | null>
  navHistory: Ref<string[]>
  navIndex: Ref<number>
  protocol: ComputedRef<'local' | 'ftp' | 'sftp'>
  /** 路由对象（由 useFileStore 传入，useFileStore 负责调用 useRoute()） */
  route: RouteLocationNormalizedLoaded
  /** 路由器实例（由 useFileStore 传入，useFileStore 负责调用 useRouter()） */
  router: Router
}

export interface FileNavigationResult {
  setup: () => Promise<void>
  teardown: () => void
  currentPath: Ref<string>
  isLoading: Ref<boolean>
  showSkeleton: Ref<boolean>
  fileEntries: Ref<FileEntry[]>
  directoryError: Ref<string | null>
  viewMode: Ref<'icon' | 'list'>
  sortBy: Ref<string>
  searchQuery: Ref<string>
  sortedFiles: ComputedRef<FileEntry[]>
  breadcrumbSegments: ComputedRef<Array<{ label: string; path: string }>>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  loadDirectory: (path: string) => Promise<void>
  reloadCurrentDir: () => Promise<void>
  navigateTo: (path: string) => Promise<void>
  navigateToBreadcrumb: (index: number) => void
  handleSearch: () => Promise<void>
  clearSearch: () => void
  handleSortChange: (value: string) => void
}

/**
 * 目录导航与浏览状态：路由解析、目录加载、搜索/排序/视图模式、面包屑、
 * 导航历史（后退/前进）、实时目录监听（外部变更感知）。
 * 生命周期（初始加载、watcher 建立与释放）由 setup()/teardown() 管理，调用方负责执行。
 */
export function useFileNavigation(deps: FileNavigationDeps): FileNavigationResult {
  const {
    currentPath,
    fileEntries,
    selectedPaths,
    lastClickedIndex,
    sortBy,
    searchQuery,
    viewMode,
    directoryError,
    navHistory,
    navIndex,
    protocol,
  } = deps
  const route = deps.route
  const router = deps.router
  const { t } = useI18n()
  const toast = useToast()

  /**
   * 把内部路由的 hash 路径（/files/<encodedPath>）转换为渲染端使用的绝对本地路径。
   * hash 中可能含编码字符（%2F / 空格等），统一解码；结果为绝对路径（补前导 /）。
   */
  function toLocalPath(encoded: string): string {
    let decoded = encoded
    try {
      decoded = decodeURIComponent(encoded)
    } catch {
      /* 非编码字符串，原样使用 */
    }
    return decoded.startsWith('/') ? decoded : `/${decoded}`
  }

  // 内部状态（不通过 deps 共享）
  const isLoading = ref(false)
  // 仅在加载超过阈值后才展示骨架屏，避免本地目录秒回时一闪而过
  const showSkeleton = ref(false)
  let skeletonTimer: ReturnType<typeof setTimeout> | null = null
  // 实时目录监听：当前已建立 watcher 的目录、变更去抖定时器
  const watchedDir = ref<string | null>(null)
  const filesChangedTimer = ref<number | null>(null)
  // 变更事件监听的取消函数（setup 注册，teardown 调用）
  let filesChangedUnsub: (() => void) | undefined

  // 面包屑
  const breadcrumbSegments = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean)
    let accumulated = ''
    return parts.map((part) => {
      accumulated = accumulated ? `${accumulated}/${part}` : `/${part}`
      return { label: part, path: accumulated }
    })
  })

  // 排序后的文件列表
  const sortedFiles = computed(() => {
    const entries = [...fileEntries.value]
    const lower = sortBy.value
    entries.sort((a, b) => {
      // 文件夹始终排在前面
      if (a.type === 'directory' && b.type !== 'directory') {
        return -1
      }
      if (a.type !== 'directory' && b.type === 'directory') {
        return 1
      }
      switch (lower) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'size':
          return b.size - a.size
        case 'modified':
          return b.modifiedAt - a.modifiedAt
        case 'type':
          return a.extension.localeCompare(b.extension)
        default:
          return 0
      }
    })
    return entries
  })

  // 导航历史管理
  function pushHistory(newPath: string): void {
    if (navIndex.value < navHistory.value.length - 1) {
      navHistory.value.splice(navIndex.value + 1)
    }
    navHistory.value.push(newPath)
    navIndex.value = navHistory.value.length - 1
  }

  // 开始加载：标记 isLoading 并延迟后再展示骨架屏，避免快速返回时闪烁
  function beginLoading(): void {
    isLoading.value = true
    if (skeletonTimer) {
      clearTimeout(skeletonTimer)
    }
    skeletonTimer = setTimeout(() => {
      if (isLoading.value) {
        showSkeleton.value = true
      }
    }, 120)
  }

  // 结束加载：清理计时器与骨架屏
  function endLoading(): void {
    isLoading.value = false
    showSkeleton.value = false
    if (skeletonTimer) {
      clearTimeout(skeletonTimer)
      skeletonTimer = null
    }
  }

  // 加载目录
  async function loadDirectory(dirPath: string): Promise<void> {
    console.debug('[useFileNavigation] loadDirectory: dirPath', dirPath)
    if (protocol.value !== 'local') {
      console.warn('[useFileNavigation] 远程协议暂未实现')
      return
    }
    beginLoading()
    try {
      fileEntries.value = await window.browserAPI.readDir(dirPath)
      directoryError.value = null
      lastClickedIndex.value = -1
    } catch (err) {
      const message = (err as Error).message || '读取目录失败'
      console.error('[useFileNavigation] loadDirectory error:', err)
      // 敏感目录 / 无权限等受保护目录：页面内提示，不弹 toast
      if (isAccessDeniedError(message)) {
        console.debug('[useFileNavigation] loadDirectory 受保护目录，页面内提示:', message)
        directoryError.value = t('files.accessDenied')
        fileEntries.value = []
      } else {
        toast.error(message)
      }
    } finally {
      endLoading()
    }
  }

  // 判断读取目录失败是否属于"受保护/无权限"类（敏感目录、权限不足），这类走页面内提示而非 toast
  function isAccessDeniedError(message: string): boolean {
    return /不允许访问|受保护|permission|EACCES|EPERM/i.test(message)
  }

  // 切换当前监听目录：释放旧目录 watcher，建立新目录 watcher（主进程按路径引用计数）
  function setWatchDir(dirPath: string): void {
    if (watchedDir.value === dirPath) {
      return
    }
    if (watchedDir.value) {
      window.browserAPI.unwatchDir(watchedDir.value)
    }
    watchedDir.value = dirPath
    window.browserAPI.watchDir(dirPath)
    console.debug('[useFileNavigation] setWatchDir:', dirPath)
  }

  // 外部变更后重载当前目录，并尽量保留原有选中项（仅保留仍存在者）
  async function reloadCurrentDir(): Promise<void> {
    console.debug('[useFileNavigation] reloadCurrentDir:', currentPath.value)
    const prevSelected = new Set(selectedPaths.value)
    await loadDirectory(currentPath.value)
    if (prevSelected.size > 0) {
      const existing = new Set(fileEntries.value.map((f) => f.path))
      selectedPaths.value = [...prevSelected].filter((p) => existing.has(p))
    }
  }

  // 路由跳转：更新 hash（#/files/<path>），主进程据此更新地址栏 displayUrl
  function gotoPath(dirPath: string): void {
    console.debug('[useFileNavigation] gotoPath: dirPath', dirPath)
    const rel = dirPath.replace(/^\/+/, '')
    router.push({ path: `/files/${rel}` })
  }

  // 导航到目录
  async function navigateTo(dirPath: string): Promise<void> {
    console.debug('[useFileNavigation] navigateTo: dirPath', dirPath)
    if (dirPath === currentPath.value) {
      return
    }
    pushHistory(dirPath)
    currentPath.value = dirPath
    selectedPaths.value = []
    searchQuery.value = ''
    directoryError.value = null
    gotoPath(dirPath)
  }

  // 面包屑导航
  function navigateToBreadcrumb(index: number): void {
    const segment = breadcrumbSegments.value[index]
    if (segment) {
      navigateTo(segment.path)
    }
  }

  // 搜索
  async function handleSearch(): Promise<void> {
    console.debug('[useFileNavigation] handleSearch: query', searchQuery.value)
    if (!searchQuery.value) {
      await loadDirectory(currentPath.value)
      return
    }
    beginLoading()
    directoryError.value = null
    try {
      fileEntries.value = await window.browserAPI.searchDir(currentPath.value, searchQuery.value)
    } catch (err) {
      console.error('[useFileNavigation] handleSearch error:', err)
      toast.error((err as Error).message || '搜索失败')
    } finally {
      endLoading()
    }
  }

  // 清除搜索
  function clearSearch(): void {
    searchQuery.value = ''
    fileEntries.value = []
    void loadDirectory(currentPath.value)
  }

  // 排序
  function handleSortChange(value: string): void {
    console.debug('[useFileNavigation] handleSortChange: value', value)
    sortBy.value = value
  }

  // 后退
  async function goBack(): Promise<void> {
    console.debug('[useFileNavigation] goBack')
    if (navIndex.value > 0) {
      navIndex.value--
      const path = navHistory.value[navIndex.value]
      selectedPaths.value = []
      gotoPath(path)
    }
  }

  // 前进
  async function goForward(): Promise<void> {
    console.debug('[useFileNavigation] goForward')
    if (navIndex.value < navHistory.value.length - 1) {
      navIndex.value++
      const path = navHistory.value[navIndex.value]
      selectedPaths.value = []
      gotoPath(path)
    }
  }

  // 从 URL 解析初始路径
  function parseInitialPath(): string {
    const fullPath = route.path
    const match = fullPath.match(/^(\/files|\/ftp|\/sftp)\/(.+)$/)
    if (match) {
      return toLocalPath(match[2])
    }
    return '~'
  }

  // 路由变化的 watcher
  let routeWatcher: (() => void) | null = null
  // 视图模式持久化 watcher
  let viewModeWatcher: (() => void) | null = null

  // 生命周期初始化（调用方在 onMounted 中执行）
  async function setup(): Promise<void> {
    console.debug('[useFileNavigation] setup')
    // 恢复视图模式（本地持久化）
    const savedView = (await window.browserAPI.getSetting('files.viewMode')) as string | null
    if (savedView === 'list' || savedView === 'icon') {
      viewMode.value = savedView
    }
    const dirPath = parseInitialPath()
    currentPath.value = dirPath
    pushHistory(dirPath)
    await loadDirectory(dirPath)
    setWatchDir(dirPath)
    filesChangedUnsub = window.browserAPI.onFilesChanged((changedDir: string) => {
      if (changedDir !== currentPath.value) {
        return
      }
      if (filesChangedTimer.value !== null) {
        window.clearTimeout(filesChangedTimer.value)
      }
      filesChangedTimer.value = window.setTimeout(() => {
        filesChangedTimer.value = null
        void reloadCurrentDir()
      }, 300)
    })
    routeWatcher = watch(
      () => route.path,
      async () => {
        const dirPath = parseInitialPath()
        currentPath.value = dirPath
        selectedPaths.value = []
        await loadDirectory(dirPath)
        setWatchDir(dirPath)
      },
      { immediate: false }
    )
    viewModeWatcher = watch(viewMode, (mode) => {
      console.debug('[useFileNavigation] viewMode changed:', mode)
      window.browserAPI.setSetting({ key: 'files.viewMode', value: mode })
    })
  }

  // 生命周期销毁（调用方在 onUnmounted 中执行）
  function teardown(): void {
    console.debug('[useFileNavigation] teardown')
    if (filesChangedTimer.value !== null) {
      window.clearTimeout(filesChangedTimer.value)
      filesChangedTimer.value = null
    }
    if (typeof filesChangedUnsub === 'function') {
      filesChangedUnsub()
    }
    if (watchedDir.value) {
      window.browserAPI.unwatchDir(watchedDir.value)
    }
    if (routeWatcher) {
      routeWatcher()
    }
    if (viewModeWatcher) {
      viewModeWatcher()
    }
  }

  return {
    setup,
    teardown,
    currentPath,
    isLoading,
    showSkeleton,
    fileEntries,
    directoryError,
    viewMode,
    sortBy,
    searchQuery,
    sortedFiles,
    breadcrumbSegments,
    goBack,
    goForward,
    loadDirectory,
    reloadCurrentDir,
    navigateTo,
    navigateToBreadcrumb,
    handleSearch,
    clearSearch,
    handleSortChange,
  }
}
