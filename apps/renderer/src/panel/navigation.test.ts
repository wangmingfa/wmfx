import type { MenuItem } from '@browser/ipc-contract'
import { describe, expect, it } from 'vitest'
import { findItem, getLevelItems, getSelectable, pathToItem, selectableIndexOf } from './navigation'

const sampleMenu: MenuItem[] = [
  { id: 'reload', label: '重新加载' },
  { id: 'sep-1', type: 'separator' },
  {
    id: 'edit',
    label: '编辑',
    children: [
      { id: 'edit-copy', label: '复制' },
      { id: 'edit-paste', label: '粘贴' },
    ],
  },
  { id: 'disabled', label: '禁用项', disabled: true },
]

describe('getLevelItems', () => {
  it('returns top-level items for empty path', () => {
    const result = getLevelItems(sampleMenu, [])
    expect(result.map((i) => i.id)).toEqual(['reload', 'edit', 'disabled'])
  })

  it('drills into submenu by path', () => {
    const result = getLevelItems(sampleMenu, ['edit'])
    expect(result.map((i) => i.id)).toEqual(['edit-copy', 'edit-paste'])
  })

  it('skips separators at every level', () => {
    const result = getLevelItems(sampleMenu, [])
    expect(result.some((i) => i.type === 'separator')).toBe(false)
  })

  it('stops drilling when id not found', () => {
    const result = getLevelItems(sampleMenu, ['nonexistent'])
    expect(result.map((i) => i.id)).toEqual(['reload', 'edit', 'disabled'])
  })
})

describe('getSelectable', () => {
  it('filters out separators and disabled items', () => {
    const result = getSelectable(sampleMenu)
    expect(result.map((i) => i.id)).toEqual(['reload', 'edit'])
  })

  it('returns all items if none are disabled or separator', () => {
    const items = [
      { id: 'a', label: 'a' },
      { id: 'b', label: 'b' },
    ]
    const result = getSelectable(items)
    expect(result.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('selectableIndexOf', () => {
  it('returns index in selectable subset', () => {
    expect(selectableIndexOf(sampleMenu, 'edit')).toBe(1)
  })

  it('returns -1 for separator', () => {
    expect(selectableIndexOf(sampleMenu, 'sep-1')).toBe(-1)
  })

  it('returns -1 for disabled item', () => {
    expect(selectableIndexOf(sampleMenu, 'disabled')).toBe(-1)
  })
})

describe('pathToItem', () => {
  it('returns ancestor chain for leaf item', () => {
    const result = pathToItem(sampleMenu, 'edit-copy')
    expect(result).toEqual(['edit'])
  })

  it('returns empty array for top-level item', () => {
    const result = pathToItem(sampleMenu, 'reload')
    expect(result).toEqual([])
  })

  it('returns null for nonexistent item', () => {
    const result = pathToItem(sampleMenu, 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('findItem', () => {
  it('finds top-level item', () => {
    const result = findItem(sampleMenu, 'reload')
    expect(result?.id).toBe('reload')
  })

  it('finds nested item', () => {
    const result = findItem(sampleMenu, 'edit-copy')
    expect(result?.id).toBe('edit-copy')
  })

  it('returns null for nonexistent item', () => {
    const result = findItem(sampleMenu, 'nonexistent')
    expect(result).toBeNull()
  })
})
