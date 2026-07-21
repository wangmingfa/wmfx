import type {
  BookmarkItem,
  CommandPaletteData,
  HistoryItem,
  TabState,
  Workspace,
} from '@browser/ipc-contract'
import { computed, ref } from 'vue'
import {
  COMMAND_CATEGORIES,
  type Command,
  type CommandCategory,
  getCommands,
} from '../lib/commandRegistry'
import { fuzzyMatchAll } from '../lib/fuzzyMatch'

export type CommandType = 'command' | 'tab' | 'history' | 'bookmark'
export type PaletteCategory = CommandCategory | 'recent' | 'history' | 'bookmark'

export interface CommandPaletteItem {
  id: string
  type: CommandType
  icon: string
  title: string
  subtitle?: string
  category: PaletteCategory
  action: () => void | Promise<void>
  score: number
}

/**
 * 命令面板核心逻辑：数据获取、模糊匹配、动作执行。
 * 在面板 Vue 上下文内使用，所有搜索本地完成。
 */
export function useCommandPalette(t: (key: string, params?: Record<string, unknown>) => string) {
  const query = ref('')
  const items = ref<CommandPaletteItem[]>([])
  const selectedIndex = ref(0)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  // 原始数据
  let tabs: TabState[] = []
  let history: HistoryItem[] = []
  let bookmarks: BookmarkItem[] = []
  let recentActions: string[] = []
  let commands: Command[] = []
  let workspaceList: Workspace[] = []
  let activeWorkspaceId: string | null = null

  // 加载数据
  async function loadData(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const data: CommandPaletteData = await window.browserAPI.commandPaletteGetData()
      tabs = data.tabs
      history = data.history
      bookmarks = data.bookmarks
      recentActions = data.recentActions
      commands = getCommands()
      // 加载工作区列表
      workspaceList = await window.browserAPI.listWorkspaces()
      const activeWs = await window.browserAPI.getActiveWorkspace()
      activeWorkspaceId = activeWs?.id ?? null
      console.debug(
        '[CommandPalette] loadData: tabs=%d history=%d bookmarks=%d recent=%d commands=%d workspaces=%d',
        tabs.length,
        history.length,
        bookmarks.length,
        recentActions.length,
        commands.length,
        workspaceList.length
      )
      // 初始显示最近使用的命令
      updateResults()
    } catch (err) {
      console.error('[CommandPalette] loadData: failed', err)
      error.value = '加载失败，请重试'
      // 降级：仅显示静态命令
      commands = getCommands()
      updateResults()
    } finally {
      isLoading.value = false
    }
  }

  // 更新搜索结果
  function updateResults(): void {
    const q = query.value.trim()
    const results: CommandPaletteItem[] = []

    if (!q) {
      // 无输入：显示最近使用的命令
      if (recentActions.length > 0) {
        const recentCmds = recentActions
          .map((id) => commands.find((c) => c.id === id))
          .filter(Boolean) as Command[]
        for (const cmd of recentCmds.slice(0, 5)) {
          results.push({
            id: cmd.id,
            type: 'command',
            icon: cmd.icon,
            title: t(cmd.label),
            subtitle: cmd.shortcut,
            category: 'recent',
            action: cmd.action,
            score: 100,
          })
        }
      }
      // 补充静态命令
      for (const cmd of commands.slice(0, 8 - results.length)) {
        if (!results.find((r) => r.id === cmd.id)) {
          results.push({
            id: cmd.id,
            type: 'command',
            icon: cmd.icon,
            title: t(cmd.label),
            subtitle: cmd.shortcut,
            category: cmd.category,
            action: cmd.action,
            score: 50,
          })
        }
      }
      // 补充工作区命令
      if (results.length < 8) {
        for (const ws of workspaceList.slice(0, 2)) {
          if (results.length >= 8) break
          if (results.find((r) => r.id === `workspace-switch-${ws.id}`)) continue
          const isActive = ws.id === activeWorkspaceId
          results.push({
            id: `workspace-switch-${ws.id}`,
            type: 'command',
            icon: 'carbon:workspace',
            title: `${isActive ? '● ' : ''}${t('commandPalette.actions.switchWorkspace', { name: ws.name })}`,
            category: 'workspace',
            action: () => window.browserAPI.switchWorkspace(ws.id),
            score: 50,
          })
        }
      }
      if (results.length < 8 && !results.find((r) => r.id === 'workspace-create')) {
        results.push({
          id: 'workspace-create',
          type: 'command',
          icon: 'carbon:add-alt',
          title: t('commandPalette.actions.createWorkspace'),
          category: 'workspace',
          action: async () => {
            const name = window.prompt(t('commandPalette.actions.createWorkspace'))
            if (name) {
              await window.browserAPI.createWorkspace(name, '')
            }
          },
          score: 50,
        })
      }
      items.value = results
      selectedIndex.value = 0
      return
    }

    // 模糊匹配标签页
    const tabResults = fuzzyMatchAll(tabs, q, (t) => `${t.title} ${t.navigation.displayUrl}`)
    for (const { item: tab, result } of tabResults.slice(0, 3)) {
      results.push({
        id: tab.id,
        type: 'tab',
        icon: 'carbon:document',
        title: tab.title || tab.navigation.displayUrl,
        subtitle: tab.navigation.displayUrl,
        category: 'tab',
        action: () => window.browserAPI.activateTab(tab.id),
        score: result.score + 20, // 标签页权重加成
      })
    }

    // 模糊匹配历史记录
    const historyResults = fuzzyMatchAll(history, q, (h) => `${h.title ?? ''} ${h.url}`)
    for (const { item: h, result } of historyResults.slice(0, 3)) {
      results.push({
        id: h.id,
        type: 'history',
        icon: 'carbon:time',
        title: h.title || h.url,
        subtitle: h.url,
        category: 'history',
        action: () => window.browserAPI.loadURLCurrent(h.url),
        score: result.score,
      })
    }

    // 模糊匹配书签
    const bookmarkResults = fuzzyMatchAll(bookmarks, q, (b) => `${b.title} ${b.url ?? ''}`)
    for (const { item: b, result } of bookmarkResults.slice(0, 3)) {
      results.push({
        id: b.id,
        type: 'bookmark',
        icon: 'carbon:bookmark',
        title: b.title,
        subtitle: b.url ?? undefined,
        category: 'bookmark',
        action: () => {
          if (b.url) window.browserAPI.loadURLCurrent(b.url)
        },
        score: result.score,
      })
    }

    // 模糊匹配命令
    const commandResults = fuzzyMatchAll(
      commands,
      q,
      (c) => `${t(c.label)} ${c.keywords.join(' ')}`
    )
    for (const { item: cmd, result } of commandResults.slice(0, 5)) {
      // 最近使用加成
      const recentBonus = recentActions.includes(cmd.id) ? 10 : 0
      results.push({
        id: cmd.id,
        type: 'command',
        icon: cmd.icon,
        title: t(cmd.label),
        subtitle: cmd.shortcut,
        category: cmd.category,
        action: cmd.action,
        score: result.score + recentBonus,
      })
    }

    // 模糊匹配工作区
    const wsResults = fuzzyMatchAll(workspaceList, q, (ws) => ws.name)
    for (const { item: ws, result } of wsResults.slice(0, 3)) {
      const isActive = ws.id === activeWorkspaceId
      results.push({
        id: `workspace-switch-${ws.id}`,
        type: 'command',
        icon: 'carbon:workspace',
        title: `${isActive ? '● ' : ''}${t('commandPalette.actions.switchWorkspace', { name: ws.name })}`,
        category: 'workspace',
        action: () => window.browserAPI.switchWorkspace(ws.id),
        score: result.score,
      })
    }
    // 新建工作区命令
    results.push({
      id: 'workspace-create',
      type: 'command',
      icon: 'carbon:add-alt',
      title: t('commandPalette.actions.createWorkspace'),
      category: 'workspace',
      action: async () => {
        const name = window.prompt(t('commandPalette.actions.createWorkspace'))
        if (name) {
          await window.browserAPI.createWorkspace(name, '')
        }
      },
      score: 0,
    })

    // 按分数排序，去重
    const seen = new Set<string>()
    items.value = results
      .filter((r) => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)

    selectedIndex.value = 0
  }

  // 设置查询并更新结果
  function setQuery(q: string): void {
    query.value = q
    updateResults()
  }

  // 键盘导航
  function moveUp(): void {
    if (selectedIndex.value > 0) selectedIndex.value--
  }
  function moveDown(): void {
    if (selectedIndex.value < items.value.length - 1) selectedIndex.value++
  }
  function moveToNextCategory(): void {
    const currentCategory = items.value[selectedIndex.value]?.category
    for (let i = selectedIndex.value + 1; i < items.value.length; i++) {
      if (items.value[i].category !== currentCategory) {
        selectedIndex.value = i
        return
      }
    }
  }

  // 执行选中项
  async function executeSelected(): Promise<void> {
    const item = items.value[selectedIndex.value]
    if (!item) return
    console.info('[CommandPalette] execute: id=%s type=%s', item.id, item.type)
    // 保存到最近使用
    if (item.type === 'command') {
      await window.browserAPI.commandPaletteSaveRecent(item.id)
    }
    // 执行动作
    await item.action()
  }

  // 分组显示结果
  const groupedItems = computed(() => {
    const groups: Array<{ category: string; items: CommandPaletteItem[] }> = []
    let currentGroup: { category: string; items: CommandPaletteItem[] } | null = null

    for (const item of items.value) {
      const catLabel =
        item.category === 'recent'
          ? t('commandPalette.categories.recent')
          : item.category in COMMAND_CATEGORIES
            ? t(COMMAND_CATEGORIES[item.category as CommandCategory].label)
            : item.category
      if (!currentGroup || currentGroup.category !== catLabel) {
        currentGroup = { category: catLabel, items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(item)
    }

    return groups
  })

  return {
    query,
    items,
    selectedIndex,
    isLoading,
    error,
    groupedItems,
    loadData,
    setQuery,
    moveUp,
    moveDown,
    moveToNextCategory,
    executeSelected,
  }
}
