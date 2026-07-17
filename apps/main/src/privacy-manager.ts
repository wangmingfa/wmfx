/**
 * 隐私管理器 — 封装 Electron session.clearStorageData
 * 遍历所有 session 分区（default / incognito / 各 persist:*），
 * 按用户选择的数据类型与时间窗口清除 Web 存储。
 *
 * 注意：Electron 没有独立的「表单自动填充」storage 类型，
 * 表单数据实际持久化在 IndexedDB / localStorage，故 formData 以 indexeddb 近似覆盖。
 */
import { type Session, session } from 'electron'

export type ClearDataType = 'cookies' | 'cache' | 'localStorage' | 'formData'

export interface ClearDataOptions {
  types: ClearDataType[]
}

type StorageKind =
  | 'cookies'
  | 'filesystem'
  | 'indexdb'
  | 'localstorage'
  | 'shadercache'
  | 'serviceworkers'
  | 'cachestorage'

const STORAGE_MAP: Record<ClearDataType, StorageKind[]> = {
  cookies: ['cookies'],
  cache: ['cachestorage', 'shadercache'],
  localStorage: ['localstorage'],
  formData: ['indexdb'],
}

export class PrivacyManager {
  async clear(opts: ClearDataOptions): Promise<void> {
    const storages = Array.from(new Set(opts.types.flatMap((t) => STORAGE_MAP[t] ?? [])))
    const sessions = (session as unknown as { getAllSessions(): Session[] }).getAllSessions()
    console.info(
      `[PrivacyManager] clear: sessions=${sessions.length} storages=${JSON.stringify(storages)}`
    )
    for (const sess of sessions as Session[]) {
      await sess.clearStorageData({ storages })
    }
    console.info(`[PrivacyManager] clear: done`)
  }
}
