import type { PopoverAnchor } from '@browser/ipc-contract'
import { describe, expect, it } from 'vitest'
import { computeBoxPosition } from '../position'

const win = { width: 800, height: 600 }

describe('computeBoxPosition', () => {
  it('bottom-start 在 rect 下方左对齐', () => {
    const anchor: PopoverAnchor = {
      type: 'rect',
      rect: { x: 10, y: 20, width: 100, height: 30 },
      placement: 'bottom-start',
    }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos).toEqual({ x: 10, y: 50 })
  })
  it('bottom-end 在 rect 下方右对齐', () => {
    const anchor: PopoverAnchor = {
      type: 'rect',
      rect: { x: 10, y: 20, width: 100, height: 30 },
      placement: 'bottom-end',
    }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos).toEqual({ x: 4, y: 50 })
  })
  it('point 右侧溢出时收敛到窗口内', () => {
    const anchor: PopoverAnchor = { type: 'point', x: 790, y: 300, placement: 'bottom-start' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos.x).toBeLessThanOrEqual(win.width - 120 - 4)
    expect(pos.x).toBeGreaterThanOrEqual(4)
  })
  it('top 越界时收敛到窗口内', () => {
    const anchor: PopoverAnchor = { type: 'point', x: 100, y: 10, placement: 'top-start' }
    const pos = computeBoxPosition(anchor, { width: 120, height: 80 }, win)
    expect(pos.y).toBeGreaterThanOrEqual(4)
  })
})
