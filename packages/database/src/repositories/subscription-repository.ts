import crypto from 'node:crypto'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface SubscriptionRecord {
  id: string
  name: string
  url: string
  active: number
  last_update: number
  expire: number
  upload: number
  download: number
  total: number
}

export class SubscriptionRepository {
  constructor(private db: BetterSqlite3Db) {}

  findAll(): SubscriptionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT id, name, url, active, last_update, expire, upload, download, total FROM subscriptions ORDER BY last_update DESC'
      )
      .all() as SubscriptionRecord[]
    console.debug('[SubscriptionRepository] findAll: count', rows.length)
    return rows
  }

  findById(id: string): SubscriptionRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id, name, url, active, last_update, expire, upload, download, total FROM subscriptions WHERE id = ?'
      )
      .get(id) as SubscriptionRecord | undefined
    console.debug('[SubscriptionRepository] findById: id found', id, !!row)
    return row
  }

  findByUrl(url: string): SubscriptionRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id, name, url, active, last_update, expire, upload, download, total FROM subscriptions WHERE url = ?'
      )
      .get(url) as SubscriptionRecord | undefined
    console.debug('[SubscriptionRepository] findByUrl: url found', url, !!row)
    return row
  }

  findActive(): SubscriptionRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id, name, url, active, last_update, expire, upload, download, total FROM subscriptions WHERE active = 1 LIMIT 1'
      )
      .get() as SubscriptionRecord | undefined
    console.debug('[SubscriptionRepository] findActive: found', !!row)
    return row
  }

  deactivateAll(): void {
    console.debug('[SubscriptionRepository] deactivateAll: setting all subscriptions inactive')
    this.db.prepare('UPDATE subscriptions SET active = 0').run()
    console.debug('[SubscriptionRepository] deactivateAll: done')
  }

  /**
   * 原子激活指定订阅：单条 UPDATE 用 CASE 把目标置 1、其余置 0，
   * 替代「deactivateAll + update(active:1)」两步（中间崩溃会导致没有任何激活订阅）。
   */
  activateOnly(id: string): void {
    console.debug('[SubscriptionRepository] activateOnly: id', id)
    this.db.prepare('UPDATE subscriptions SET active = CASE id WHEN ? THEN 1 ELSE 0 END').run(id)
    console.debug('[SubscriptionRepository] activateOnly: done')
  }

  create(sub: Omit<SubscriptionRecord, 'id'>): string {
    console.debug(
      '[SubscriptionRepository] create: name url active',
      sub.name,
      sub.url,
      sub.active ?? 0
    )
    const id = crypto.randomUUID()
    this.db
      .prepare(
        'INSERT INTO subscriptions (id, name, url, active, last_update, expire, upload, download, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        sub.name,
        sub.url,
        sub.active ?? 0,
        sub.last_update,
        sub.expire,
        sub.upload,
        sub.download,
        sub.total
      )
    console.debug('[SubscriptionRepository] create: inserted id', id)
    return id
  }

  /** 允许更新的列白名单：禁止将 Object.entries 的 key 直接拼入 SQL（防注入） */
  private static readonly UPDATABLE_COLUMNS = new Set([
    'name',
    'url',
    'active',
    'last_update',
    'expire',
    'upload',
    'download',
    'total',
  ])

  update(id: string, fields: Partial<Omit<SubscriptionRecord, 'id'>>): void {
    const entries = Object.entries(fields).filter(([k]) =>
      SubscriptionRepository.UPDATABLE_COLUMNS.has(k)
    )
    for (const [k] of Object.entries(fields)) {
      if (!SubscriptionRepository.UPDATABLE_COLUMNS.has(k)) {
        console.warn(`[SubscriptionRepository] update: blocked column '${k}' id=${id}`)
      }
    }
    if (entries.length === 0) {
      console.debug('[SubscriptionRepository] update: id no fields to update, skip', id)
      return
    }
    const sets = entries.map(([k]) => `${k} = ?`).join(', ')
    const values = entries.map(([, v]) => v)
    console.debug('[SubscriptionRepository] update: id sets', id, sets)
    this.db.prepare(`UPDATE subscriptions SET ${sets} WHERE id = ?`).run(...values, id)
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id)
    console.debug('[SubscriptionRepository] delete: id changes', id, result.changes)
    return result.changes > 0
  }
}
