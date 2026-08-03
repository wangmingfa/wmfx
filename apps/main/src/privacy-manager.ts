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
  cache: ['cachestorage'],
  localStorage: ['localstorage'],
  formData: ['indexdb'],
}

export class PrivacyManager {
  async clear(opts: ClearDataOptions): Promise<void> {
    if (!opts || !opts.types?.length) {
      console.warn('[PrivacyManager] clear: no valid types')
      return
    }
    const storages = Array.from(new Set(opts.types.flatMap((t) => STORAGE_MAP[t] ?? [])))
    if (!storages.length) {
      console.warn('[PrivacyManager] clear: no storages to clear')
      return
    }
    let sessions: Session[]
    try {
      sessions = (session as unknown as { getAllSessions(): Session[] }).getAllSessions()
    } catch (err) {
      console.warn('[PrivacyManager] getAllSessions failed:', err)
      return
    }
    console.info(
      `[PrivacyManager] clear: sessions=${sessions.length} storages=${JSON.stringify(storages)}`
    )
    for (const sess of sessions) {
      try {
        await sess.clearStorageData({ storages })
      } catch (err) {
        console.warn(
          `[PrivacyManager] clearStorageData failed for session ${sess.partition}:`,
          err instanceof Error ? err.message : String(err)
        )
      }
    }
    console.info(`[PrivacyManager] clear: done`)
  }
}
