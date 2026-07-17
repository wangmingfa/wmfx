// biome-ignore-all lint/suspicious/noExplicitAny: 测试用手写 fake repo，需要 any
import { BookmarkRepository } from '@wmfx/database'
import { beforeEach, describe, expect, it } from 'vitest'
import { BookmarkManager } from '../bookmark-manager'

function makeRepo() {
  const rows: any[] = []
  const fakeDb: any = {
    prepare: (sql: string) => ({
      run: (...args: any[]) => {
        const s = sql.trim()
        if (s.startsWith('INSERT')) {
          const id = args[0]
          rows.push({
            id,
            parent_id: args[1] ?? null,
            title: args[2],
            url: args[3],
            favicon: args[4],
            position: args[5],
            created_at: Date.now(),
          })
          return { lastInsertRowid: id }
        }
        if (s.startsWith('UPDATE')) {
          const id = args[args.length - 1]
          const row = rows.find((r) => r.id === id)
          if (row) {
            // 解析 SET 子句中的列名，按顺序映射到参数（最后一个参数是 id）
            const setCols =
              (sql.match(/SET\s+(.+?)\s+WHERE/is)?.[1] ?? '')
                .match(/(\w+)\s*=/g)
                ?.map((m: string) => m.replace(/\s*=/, '')) ?? []
            setCols.forEach((col: string, i: number) => {
              if (col === 'parent_id') row.parent_id = args[i]
              if (col === 'position') row.position = args[i]
              if (col === 'title') row.title = args[i]
              if (col === 'url') row.url = args[i]
              if (col === 'favicon') row.favicon = args[i]
            })
          }
          return { changes: 1 }
        }
        if (s.startsWith('DELETE')) return { changes: 1 }
        return { changes: 0 }
      },
      all: (...args: any[]) =>
        rows
          .filter((r) => r.parent_id === (sql.includes('IS NULL') ? null : args[0]))
          .sort((a: any, b: any) => a.position - b.position),
      get: () => undefined,
    }),
  }
  return new BookmarkRepository(fakeDb)
}

describe('BookmarkManager.move', () => {
  let repo: BookmarkRepository
  let mgr: BookmarkManager
  beforeEach(() => {
    repo = makeRepo()
    mgr = new BookmarkManager(repo)
  })

  it('reparents a bookmark and reorders siblings', () => {
    const a = mgr.create({ title: 'a', url: 'https://a' })
    const b = mgr.create({ title: 'b', url: 'https://b' })
    mgr.create({ title: 'c', url: 'https://c' })
    // 把 b 移到首位
    mgr.move(b.id, null, 0)
    const list = mgr.getList(null)
    expect(list[0].id).toBe(b.id)
    expect(list.find((x) => x.id === a.id)!.position).toBe(1)
  })

  it('rejects moving a folder into its own descendant', () => {
    const folder = mgr.create({ title: 'f', url: null })
    const child = mgr.create({ title: 'c', url: null, parentId: folder.id })
    // 把 folder 移入 child 应被拒绝（不抛错但保持原样）
    mgr.move(folder.id, child.id, 0)
    expect(mgr.getList(null).some((x) => x.id === folder.id)).toBe(true)
    expect(mgr.getList(folder.id).some((x) => x.id === child.id)).toBe(true)
  })
})
