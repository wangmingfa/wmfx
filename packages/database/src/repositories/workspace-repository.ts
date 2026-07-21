import type { Database as BetterSqlite3Db } from 'better-sqlite3'

export interface WorkspaceRecord {
  id: string
  name: string
  color: string
  position: number
  created_at: number
  updated_at: number
}

export interface WorkspaceTabState {
  workspace_id: string
  tabs_json: string
  active_index: number
}

export class WorkspaceRepository {
  constructor(private db: BetterSqlite3Db) {}

  list(): WorkspaceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM workspace ORDER BY position ASC')
      .all() as WorkspaceRecord[]
    console.debug('[WorkspaceRepository] list: count', rows.length)
    return rows
  }

  getById(id: string): WorkspaceRecord | undefined {
    const row = this.db.prepare('SELECT * FROM workspace WHERE id = ?').get(id) as
      | WorkspaceRecord
      | undefined
    console.debug('[WorkspaceRepository] getById: id found', id, !!row)
    return row
  }

  create(w: Omit<WorkspaceRecord, 'created_at' | 'updated_at'>): WorkspaceRecord {
    console.debug('[WorkspaceRepository] create: id name', w.id, w.name)
    const now = Date.now()
    this.db
      .prepare(
        'INSERT INTO workspace (id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(w.id, w.name, w.color, w.position, now, now)
    return this.getById(w.id)!
  }

  update(id: string, patch: { name?: string; color?: string; position?: number }): WorkspaceRecord {
    const fields: string[] = []
    const values: unknown[] = []
    if (patch.name !== undefined) {
      fields.push('name = ?')
      values.push(patch.name)
    }
    if (patch.color !== undefined) {
      fields.push('color = ?')
      values.push(patch.color)
    }
    if (patch.position !== undefined) {
      fields.push('position = ?')
      values.push(patch.position)
    }
    if (fields.length === 0) {
      console.debug('[WorkspaceRepository] update: id no fields, skip', id)
      return this.getById(id)!
    }
    fields.push('updated_at = ?')
    values.push(Date.now())
    values.push(id)
    this.db.prepare(`UPDATE workspace SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    console.debug('[WorkspaceRepository] update: id fields', id, fields.join(','))
    return this.getById(id)!
  }

  delete(id: string): void {
    console.debug('[WorkspaceRepository] delete: id', id)
    this.db.prepare('DELETE FROM workspace WHERE id = ?').run(id)
    this.db.prepare('UPDATE bookmarks SET workspace_id = NULL WHERE workspace_id = ?').run(id)
  }

  reorder(ids: string[]): void {
    console.debug('[WorkspaceRepository] reorder: ids', ids.join(','))
    const stmt = this.db.prepare('UPDATE workspace SET position = ? WHERE id = ?')
    const tx = this.db.transaction(() => {
      for (let i = 0; i < ids.length; i++) {
        stmt.run(i, ids[i])
      }
    })
    tx()
  }

  getMaxPosition(): number {
    const row = this.db.prepare('SELECT MAX(position) as max_pos FROM workspace').get() as {
      max_pos: number | null
    }
    return row.max_pos ?? -1
  }

  // --- Tab state persistence ---

  getTabState(workspaceId: string): WorkspaceTabState | undefined {
    const row = this.db
      .prepare('SELECT * FROM workspace_tabs WHERE workspace_id = ?')
      .get(workspaceId) as WorkspaceTabState | undefined
    console.debug('[WorkspaceRepository] getTabState: workspaceId found', workspaceId, !!row)
    return row
  }

  setTabState(workspaceId: string, tabsJson: string, activeIndex: number): void {
    console.debug(
      '[WorkspaceRepository] setTabState: workspaceId activeIndex',
      workspaceId,
      activeIndex
    )
    this.db
      .prepare(
        `INSERT INTO workspace_tabs (workspace_id, tabs_json, active_index)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET tabs_json = excluded.tabs_json, active_index = excluded.active_index`
      )
      .run(workspaceId, tabsJson, activeIndex)
  }
}
