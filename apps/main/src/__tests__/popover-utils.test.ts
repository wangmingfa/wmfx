import type { MenuItem } from '@browser/ipc-contract'
import { describe, expect, it } from 'vitest'
import { findMenuItem } from '../popover-utils'

const items: MenuItem[] = [
  { id: 'a', label: 'A' },
  {
    id: 'b',
    label: 'B',
    children: [
      { id: 'b1', label: 'B1' },
      { id: 'b2', label: 'B2', children: [{ id: 'b2x', label: 'B2X' }] },
    ],
  },
  { id: 'c', type: 'separator' },
]

describe('findMenuItem', () => {
  it('finds top-level item', () => {
    expect(findMenuItem(items, 'a')?.id).toBe('a')
  })
  it('finds nested item recursively', () => {
    expect(findMenuItem(items, 'b2x')?.id).toBe('b2x')
  })
  it('returns null when missing', () => {
    expect(findMenuItem(items, 'nope')).toBeNull()
  })
  it('ignores separator ids', () => {
    expect(findMenuItem(items, 'c')).toBeNull()
  })
})
