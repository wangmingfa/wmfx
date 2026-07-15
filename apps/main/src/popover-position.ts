import type { PopoverAnchor } from '@browser/ipc-contract'

export interface BoxSize {
  width: number
  height: number
}
export interface Point {
  x: number
  y: number
}

const MARGIN = 4

/**
 * 依据锚点 + 内容尺寸 + 窗口尺寸计算 popover 视图左上角，并夹紧进窗口。
 * cursor 锚点由调用方把屏幕光标转为窗口局部坐标后通过 cursor 传入。
 */
export function computePopoverBounds(
  anchor: PopoverAnchor,
  size: BoxSize,
  win: { width: number; height: number },
  cursor?: { x: number; y: number }
): Point {
  let refLeft = 0
  let refTop = 0
  let refRight = 0
  let refBottom = 0

  if (anchor.type === 'rect') {
    refLeft = anchor.rect.x
    refTop = anchor.rect.y
    refRight = anchor.rect.x + anchor.rect.width
    refBottom = anchor.rect.y + anchor.rect.height
  } else if (anchor.type === 'point') {
    refLeft = refRight = anchor.x
    refTop = refBottom = anchor.y
  } else {
    const x = cursor?.x ?? 0
    const y = cursor?.y ?? 0
    refLeft = refRight = x
    refTop = refBottom = y
  }

  const place = anchor.placement ?? 'bottom-start'
  const [v, h] = place.split('-') as [
    'cover' | 'bottom' | 'top' | 'right' | 'left',
    'start' | 'end',
  ]

  let left = 0
  let top = 0
  if (v === 'cover') {
    left = h === 'end' ? refRight - size.width : refLeft
    top = refTop
  } else if (v === 'bottom') {
    top = refBottom
    left = h === 'end' ? refRight - size.width : refLeft
  } else if (v === 'top') {
    top = refTop - size.height
    left = h === 'end' ? refRight - size.width : refLeft
  } else if (v === 'right') {
    left = refRight
    top = h === 'end' ? refBottom - size.height : refTop
  } else {
    left = refLeft - size.width
    top = h === 'end' ? refBottom - size.height : refTop
  }

  left = Math.max(MARGIN, Math.min(left, win.width - size.width - MARGIN))
  top = Math.max(MARGIN, Math.min(top, win.height - size.height - MARGIN))
  return { x: left, y: top }
}
