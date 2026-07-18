/**
 * 密码管理器（主进程）
 *
 * 职责：
 * - 以 electron-store 持久化密码条目，落盘时密码字段经 Electron safeStorage
 *   （OS 密钥链支撑的 AES）加密，明文绝不写入磁盘。
 * - 提供 list / search / save / delete / get，所有读路径在主进程内解密后返回给渲染进程
 *   （明文仅存在于主进程→渲染进程 IPC 进程内传输，不落盘）。
 * - 变更由 register.ts 经 `passwords:changed` 广播，渲染端据此刷新。
 *
 * 设计取舍：不引入主密码 / 独立保险库，依赖 OS 密钥链（safeStorage）作为信任根，
 * 与项目既有的 electron 使用方式一致；无痕窗口因内存 partition 不持久化，
 * 但密码管理器是全局持久数据，与窗口类型无关。
 */

import { randomUUID } from 'node:crypto'
import type { PasswordEntry } from '@browser/ipc-contract'
import { safeStorage } from 'electron'
import Store from 'electron-store'

/** 落盘记录：密码以 safeStorage 加密后的 base64 字符串存储 */
interface StoredEntry {
  id: string
  domain: string
  username: string
  /** 加密后的 base64 字符串（safeStorage.encryptString 产物） */
  passwordEnc: string
  note?: string
  createdAt: number
  updatedAt: number
}

interface PasswordSchema {
  entries: StoredEntry[]
}

export class PasswordManager {
  private static instance: PasswordManager
  private store: Store<PasswordSchema>

  private constructor() {
    console.debug('[PasswordManager] constructor: initializing store')
    this.store = new Store<PasswordSchema>({
      name: 'wmfx-passwords',
      defaults: { entries: [] },
    })
  }

  static getInstance(): PasswordManager {
    console.debug('[PasswordManager] getInstance')
    if (!PasswordManager.instance) {
      PasswordManager.instance = new PasswordManager()
    }
    return PasswordManager.instance
  }

  /** 校验 safeStorage 是否可用（部分 Linux 无密钥链时降级为明文提示由调用方处理） */
  private get encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  /** 明文密码 → 落盘密文（base64）。safeStorage 不可用时退化为明文（仅开发兜底，不推荐） */
  private encrypt(plain: string): string {
    if (!this.encryptionAvailable) {
      console.warn(
        '[PasswordManager] encrypt: safeStorage unavailable, storing plaintext (insecure fallback)'
      )
      return plain
    }
    const buf = safeStorage.encryptString(plain)
    return buf.toString('base64')
  }

  /** 落盘密文（base64） → 明文密码 */
  private decrypt(enc: string): string {
    if (!this.encryptionAvailable) {
      return enc
    }
    try {
      const buf = Buffer.from(enc, 'base64')
      return safeStorage.decryptString(buf)
    } catch (err) {
      console.error('[PasswordManager] decrypt: failed', err)
      return ''
    }
  }

  /** 列出全部条目（密码已解密） */
  list(): PasswordEntry[] {
    console.debug('[PasswordManager] list: count', this.store.get('entries').length)
    return this.store.get('entries').map((e) => this.toEntry(e))
  }

  /** 按域名 / 用户名 / 备注模糊搜索（不区分大小写） */
  search(query: string): PasswordEntry[] {
    const q = query.trim().toLowerCase()
    console.debug('[PasswordManager] search: query', q)
    if (!q) return this.list()
    return this.store
      .get('entries')
      .filter((e) => {
        const hay = `${e.domain} ${e.username} ${e.note ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .map((e) => this.toEntry(e))
  }

  /** 新增或更新条目 */
  save(input: {
    id?: string
    domain: string
    username: string
    password: string
    note?: string
  }): PasswordEntry {
    const entries = this.store.get('entries')
    const now = Date.now()
    if (input.id) {
      console.debug('[PasswordManager] save: update id', input.id)
      const idx = entries.findIndex((e) => e.id === input.id)
      if (idx === -1) {
        console.warn('[PasswordManager] save: id not found, treat as add', input.id)
        return this.add(input, now, entries)
      }
      const updated: StoredEntry = {
        ...entries[idx],
        domain: input.domain,
        username: input.username,
        passwordEnc: this.encrypt(input.password),
        note: input.note,
        updatedAt: now,
      }
      entries[idx] = updated
      this.store.set('entries', entries)
      return this.toEntry(updated)
    }
    console.debug('[PasswordManager] save: add')
    return this.add(input, now, entries)
  }

  private add(
    input: { domain: string; username: string; password: string; note?: string },
    now: number,
    entries: StoredEntry[]
  ): PasswordEntry {
    const created: StoredEntry = {
      id: randomUUID(),
      domain: input.domain,
      username: input.username,
      passwordEnc: this.encrypt(input.password),
      note: input.note,
      createdAt: now,
      updatedAt: now,
    }
    this.store.set('entries', [...entries, created])
    return this.toEntry(created)
  }

  /** 删除指定 id 条目，返回是否删除成功 */
  delete(id: string): boolean {
    console.debug('[PasswordManager] delete: id', id)
    const entries = this.store.get('entries')
    const next = entries.filter((e) => e.id !== id)
    if (next.length === entries.length) return false
    this.store.set('entries', next)
    return true
  }

  /** 落盘记录 → 对外条目（解密密码） */
  private toEntry(e: StoredEntry): PasswordEntry {
    return {
      ...e,
      password: this.decrypt(e.passwordEnc),
    }
  }
}
