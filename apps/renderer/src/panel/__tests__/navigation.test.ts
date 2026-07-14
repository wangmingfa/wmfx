import type { MenuItem } from '@browser/ipc-contract'
import { describe, expect, it } from 'vitest'
import {
  findItem,
  getLevelItems,
  getSelectable,
  pathToItem,
  selectableIndexOf,
} from '../navigation'

const items: MenuItem[] = [
  { id: 'a', label: 'A' },
  { id: 'sep', type: 'separator' },
  { id: 'a2', label: 'A2', disabled: true },
  {
    id: 'b',
    label: 'B',
    children: [
      { id: 'b1', label: 'B1' },
      { id: 'b2', label: 'B2', children: [{ id: 'b2x', label: 'B2X' }] },
    ],
  },
]

describe('navigation', () => {
  it('getLevelItems 按 path 下钻', () => {
    expect(getLevelItems(items, ['b']).map((i) => i.id)).toEqual(['b1', 'b2'])
    expect(getLevelItems(items, ['b', 'b2']).map((i) => i.id)).toEqual(['b2x'])
    expect(getLevelItems(items, []).map((i) => i.id)).toEqual(['a', 'a2', 'b'])
  })
  it('getSelectable 跳过 separator 和 disabled', () => {
    expect(getSelectable(items).map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('findItem 在全树中按 id 查找', () => {
    expect(findItem(items, 'b2x')?.id).toBe('b2x')
    expect(findItem(items, 'a2')?.disabled).toBe(true)
    expect(findItem(items, 'missing')).toBeNull()
  })
  it('selectableIndexOf 在可选中项中定位', () => {
    expect(selectableIndexOf(items, 'b')).toBe(1)
    expect(selectableIndexOf(items, 'nope')).toBe(-1)
  })
  it('pathToItem 返回祖先链', () => {
    expect(pathToItem(items, 'b2x')).toEqual(['b', 'b2'])
    expect(pathToItem(items, 'a')).toEqual([])
    expect(pathToItem(items, 'missing')).toBeNull()
  })
})
