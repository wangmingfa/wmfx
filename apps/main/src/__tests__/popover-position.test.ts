import { describe, expect, it } from 'vitest'
import { computePopoverBounds } from '../popover-position'

describe('computePopoverBounds', () => {
  const win = { width: 1000, height: 800 }

  it('bottom-start 放在 rect 下方、左对齐', () => {
    const r = computePopoverBounds(
      { type: 'rect', rect: { x: 100, y: 100, width: 200, height: 30 }, placement: 'bottom-start' },
      { width: 300, height: 120 },
      win
    )
    expect(r).toEqual({ x: 100, y: 130 })
  })

  it('cover-start 视图左上角对齐 rect 左上角', () => {
    const r = computePopoverBounds(
      { type: 'rect', rect: { x: 100, y: 100, width: 200, height: 30 }, placement: 'cover-start' },
      { width: 200, height: 150 },
      win
    )
    expect(r).toEqual({ x: 100, y: 100 })
  })

  it('cursor 用传入光标位置', () => {
    const r = computePopoverBounds(
      { type: 'cursor', placement: 'bottom-start' },
      { width: 100, height: 40 },
      win,
      { x: 500, y: 400 }
    )
    expect(r).toEqual({ x: 500, y: 400 })
  })

  it('夹紧到窗口内（不超出右/下边界）', () => {
    const r = computePopoverBounds(
      { type: 'point', x: 990, y: 790, placement: 'bottom-start' },
      { width: 300, height: 200 },
      win
    )
    expect(r.x).toBeLessThanOrEqual(win.width - 300 - 4)
    expect(r.y).toBeLessThanOrEqual(win.height - 200 - 4)
  })
})
