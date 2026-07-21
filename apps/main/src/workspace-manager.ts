/**
 * 工作区管理器 — Arc-style Space 的核心模块
 *
 * 职责：
 * - workspace CRUD（创建/读取/更新/删除/排序）
 * - workspace 切换（保存当前标签 → 隐藏 → 恢复目标标签 → 显示）
 * - 标签状态持久化（通过 WorkspaceRepository 存入 SQLite）
 *
 * 设计原则：
 * - 每个窗口独立 WorkspaceManager 实例（由 WindowManager 创建）
 * - 切换操作是窗口级的，不影响其他窗口
 * - Session partition 映射：默认 workspace = persist:default，其他 = persist:space-{id}
 */
import type { Workspace } from '@browser/ipc-contract'
import type { WorkspaceRecord, WorkspaceRepository } from '@wmfx/database'
import type { BrowserWindow } from 'electron'
import { session } from 'electron'
import type { TabManager } from './tab-manager'

/** 默认 workspace 的标识（向后兼容） */
const DEFAULT_WORKSPACE_ID = 'default'

export class WorkspaceManager {
  private activeWorkspaceId: string = DEFAULT_WORKSPACE_ID
  private workspaceRepo: WorkspaceRepository
  private tabManager: TabManager
  private window: BrowserWindow

  constructor(workspaceRepo: WorkspaceRepository, tabManager: TabManager, window: BrowserWindow) {
    this.workspaceRepo = workspaceRepo
    this.tabManager = tabManager
    this.window = window
    this.ensureDefaultWorkspace()
  }

  /** 确保默认 workspace 存在（升级兼容） */
  private ensureDefaultWorkspace(): void {
    const existing = this.workspaceRepo.getById(DEFAULT_WORKSPACE_ID)
    if (!existing) {
      console.info('[WorkspaceManager] ensureDefaultWorkspace: creating default workspace')
      this.workspaceRepo.create({
        id: DEFAULT_WORKSPACE_ID,
        name: '默认',
        color: '#636e72',
        position: 0,
      })
    }
  }

  list(): Workspace[] {
    const records = this.workspaceRepo.list()
    return records.map((r) => this.toWorkspace(r))
  }

  getActive(): Workspace | null {
    const record = this.workspaceRepo.getById(this.activeWorkspaceId)
    return record ? this.toWorkspace(record) : null
  }

  getActiveId(): string {
    return this.activeWorkspaceId
  }

  create(name: string, color: string): Workspace {
    const maxPos = this.workspaceRepo.getMaxPosition()
    const id = crypto.randomUUID()
    const record = this.workspaceRepo.create({
      id,
      name,
      color,
      position: maxPos + 1,
    })
    console.info('[WorkspaceManager] create: id=%s name=%s', id, name)
    return this.toWorkspace(record)
  }

  update(id: string, patch: { name?: string; color?: string; position?: number }): Workspace {
    const record = this.workspaceRepo.update(id, patch)
    console.debug('[WorkspaceManager] update: id=%s', id)
    return this.toWorkspace(record)
  }

  delete(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) {
      console.warn('[WorkspaceManager] delete: cannot delete default workspace')
      return
    }
    console.info('[WorkspaceManager] delete: id=%s', id)

    // 如果删除的是当前活跃 workspace，先切换到默认
    if (this.activeWorkspaceId === id) {
      this.switchTo(DEFAULT_WORKSPACE_ID)
    }

    // 清理 session partition
    const partition = this.getSessionPartition(id)
    const sess = session.fromPartition(partition)
    void sess.clearStorageData()
    void sess.clearCache()

    this.workspaceRepo.delete(id)
  }

  reorder(ids: string[]): void {
    this.workspaceRepo.reorder(ids)
  }

  /**
   * 切换到目标 workspace（核心方法）
   *
   * 流程：
   * 1. 保存当前 workspace 的标签状态
   * 2. 关闭当前所有标签（释放视图）
   * 3. 更新活跃 workspace
   * 4. 从 DB 恢复目标 workspace 的标签
   * 5. 广播切换事件
   */
  switchTo(id: string): void {
    if (id === this.activeWorkspaceId) return
    const target = this.workspaceRepo.getById(id)
    if (!target) return

    console.info('[WorkspaceManager] switchTo: from=%s to=%s', this.activeWorkspaceId, id)

    // 1. 保存当前标签状态
    this.saveCurrentTabs()

    // 2. 关闭当前所有标签（释放视图）
    const currentTabs = this.tabManager.getList()
    const currentIds = currentTabs.map((t) => t.id)
    this.tabManager.closeMany(currentIds)

    // 3. 更新活跃 workspace
    this.activeWorkspaceId = id
    this.tabManager.setWorkspaceId(id)

    // 4. 恢复目标标签
    this.restoreTabsForWorkspace(id)

    // 5. 广播切换事件
    this.window.webContents.send('workspace:switched', this.getActive())
  }

  /** 保存当前 workspace 的标签状态到 DB */
  saveCurrentTabs(): void {
    const tabs = this.tabManager.serializeTabs()
    const activeIndex = this.tabManager.getActiveTabIndex()
    const tabsJson = JSON.stringify(tabs)
    this.workspaceRepo.setTabState(this.activeWorkspaceId, tabsJson, activeIndex)
    console.debug(
      '[WorkspaceManager] saveCurrentTabs: workspaceId=%s tabCount=%d',
      this.activeWorkspaceId,
      tabs.length
    )
  }

  /** 从 DB 恢复指定 workspace 的标签 */
  restoreTabsForWorkspace(workspaceId: string): void {
    const state = this.workspaceRepo.getTabState(workspaceId)
    if (state) {
      try {
        const tabs = JSON.parse(state.tabs_json) as { url: string; title: string }[]
        if (tabs.length > 0) {
          this.tabManager.restoreTabs(tabs, state.active_index)
          return
        }
      } catch {
        console.warn(
          '[WorkspaceManager] restoreTabsForWorkspace: corrupt tabs_json for workspace=%s',
          workspaceId
        )
      }
    }
    // 无保存状态：创建新标签页
    this.tabManager.createNewTab()
  }

  /** 获取 workspace 对应的 Electron session partition 名（含 persist: 前缀） */
  getSessionPartition(workspaceId: string): string {
    if (workspaceId === DEFAULT_WORKSPACE_ID) return 'persist:default'
    return `persist:space-${workspaceId}`
  }

  /** 将 DB 记录转换为 IPC Workspace 类型 */
  private toWorkspace(record: WorkspaceRecord): Workspace {
    // tabCount 从 TabManager 实时获取（仅当前活跃 workspace 有标签）
    const tabCount =
      record.id === this.activeWorkspaceId
        ? this.tabManager.getList().length
        : this.getSavedTabCount(record.id)
    return {
      id: record.id,
      name: record.name,
      color: record.color,
      position: record.position,
      tabCount,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    }
  }

  /** 获取已保存的标签数量（非活跃 workspace 从 DB 读取） */
  private getSavedTabCount(workspaceId: string): number {
    const state = this.workspaceRepo.getTabState(workspaceId)
    if (!state) return 0
    try {
      const tabs = JSON.parse(state.tabs_json) as unknown[]
      return tabs.length
    } catch {
      return 0
    }
  }
}
