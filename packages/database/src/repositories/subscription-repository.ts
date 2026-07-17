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

  update(id: string, fields: Partial<Omit<SubscriptionRecord, 'id'>>): void {
    const entries = Object.entries(fields)
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
