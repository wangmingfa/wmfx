/**
 * 云同步类型定义
 *
 * 所有云端路径约定：
 *   /.wmfx/settings.wmfx  — 加密同步包
 *   /.wmfx/._meta.json    — 明文元信息（schema 版本、导出时间、设备名）
 */

import type { WebDAVConfig } from '../webdav-client'

/** 同步状态 */
export type SyncStatus = 'idle' | 'syncing' | 'restoring' | 'connected' | 'error'

/** 同步记录 */
export interface SyncRecord {
  /** unix ms */
  timestamp: number
  /** 'upload' | 'download' | 'test' */
  action: 'upload' | 'download' | 'test'
  /** 成功时 true */
  ok: boolean
  message: string
  bytes?: number
}

/** 云端同步的配置，存进 SettingsManager */
export interface CloudSyncConfig {
  /** 是否启用云同步 */
  enabled: boolean
  /** 云盘类型，当前仅支持 webdav */
  type: 'webdav'
  /** WebDAV 连接参数 */
  webdav: WebDAVConfig
  /** 上次同步成功的时间戳，展示用 */
  lastSyncAt?: number
  /** 上次同步大小（字节），展示用 */
  lastSyncSize?: number
  /** 上次同步状态信息，展示用 */
  lastSyncMessage?: string
  /** 最近几条同步记录 */
  recentRecords: SyncRecord[]
}

/** 同步状态（传给 UI） */
export type CloudSyncStatus = 'idle' | 'syncing' | 'restoring' | 'connected' | 'error'

/** 同步状态（传给 UI） */
export interface CloudSyncState {
  config: CloudSyncConfig
  status: CloudSyncStatus
  connected: boolean
}

/** 本地导出数据：主进程组装，然后交给 crypto.ts 加密上传 */
export interface ExportData {
  /** 应用设置快照 */
  settings: Record<string, unknown>
  /** 书签列表 */
  bookmarks: {
    id: string
    title: string
    url?: string
    parent_id?: string
    position?: number
    createdAt: number
  }[]
  /** 历史记录列表 */
  history: {
    id: string
    url: string
    title?: string
    favicon?: string
    visitTime: number
    visitCount: number
  }[]
  /** 密码条目（已由 safeStorage 加密，二次加密上传） */
  passwords: {
    id: string
    domain: string
    username: string
    note?: string
    createdAt: number
  }[]
  /** 订阅（代理规则 / 广告规则） */
  subscriptions: {
    id: string
    title: string
    url: string
    enabled: boolean
  }[]
  /** 快捷链接 */
  quickLinks: {
    id: string
    title: string
    url: string
  }[]
  /** 导出时间 */
  exportedAt: number
}

/** 恢复回来的数据，结构同 ExportData */
export type ImportData = ExportData

/** 用户提供的恢复选项 */
export type RestoreMode = 'replace' | 'merge'

/** 恢复结果 */
export interface RestoreResult {
  /** 实际执行了多少项数据恢复 */
  restored: {
    settings: boolean
    bookmarks: boolean
    history: boolean
    passwords: boolean
    subscriptions: boolean
    quickLinks: boolean
  }
  /** 各数据项恢复的数量统计 */
  stats: Record<string, number>
}

/** 校验结果（恢复前展示给用户） */
export interface PreviewData {
  schemaVersion: number
  exportedAt: number
  stats: Record<string, number>
}
