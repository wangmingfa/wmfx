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
 * 依据锚点与方向计算菜单盒子左上角，并向窗口内收敛。
 * cursor 锚点由调用方预先解析为 point 后传入（面板侧用最近指针位置）。
 */
export function computeBoxPosition(
  anchor: PopoverAnchor,
  size: BoxSize,
  win: { width: number; height: number }
): Point {
  console.debug(
    '[Position] computeBoxPosition: anchorType sizex%d winx%d',
    anchor.type,
    size.width,
    size.height,
    win.width,
    win.height
  )
  let refLeft = 0
  let refTop = 0
  let refRight = 0
  let refBottom = 0

  if (anchor.type === 'rect') {
    refLeft = anchor.rect.x
    refTop = anchor.rect.y
    refRight = anchor.rect.x + anchor.rect.width
    refBottom = anchor.rect.y + anchor.rect.height
  } else {
    const x = anchor.type === 'point' ? anchor.x : 0
    const y = anchor.type === 'point' ? anchor.y : 0
    refLeft = refRight = x
    refTop = refBottom = y
  }

  const place = anchor.type === 'cursor' ? 'bottom-start' : (anchor.placement ?? 'bottom-start')
  const [v, h] = place.split('-') as ['bottom' | 'top' | 'right' | 'left', 'start' | 'end']

  let left = 0
  let top = 0
  if (v === 'bottom') {
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
