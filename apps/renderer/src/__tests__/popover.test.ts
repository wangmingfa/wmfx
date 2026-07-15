import { beforeEach, describe, expect, it, vi } from 'vitest'

const { browserAPI, calls } = vi.hoisted(() => {
  const calls: Record<string, unknown[] | undefined> = {}
  const browserAPI = {
    popoverOpen: vi.fn((...a: unknown[]) => {
      calls.open = a
      return Promise.resolve()
    }),
    popoverClose: vi.fn((...a: unknown[]) => {
      calls.close = a
      return Promise.resolve()
    }),
    popoverSendData: vi.fn((...a: unknown[]) => {
      calls.sendData = a
      return Promise.resolve()
    }),
    popoverMeasure: vi.fn((...a: unknown[]) => {
      calls.measure = a
      return undefined
    }),
    onPopoverEvent: vi.fn(
      (cb: (p: { popoverId: string; eventName: string; eventData?: unknown }) => void) => {
        ;(browserAPI as { __eventCb?: typeof cb }).__eventCb = cb
      }
    ),
    onPopoverDismiss: vi.fn((cb: (popoverId: string) => void) => {
      ;(browserAPI as { __dismissCb?: typeof cb }).__dismissCb = cb
    }),
  }
  vi.stubGlobal('window', { browserAPI })
  vi.stubGlobal('crypto', { randomUUID: () => 'id-1' })
  return { browserAPI, calls }
})

import { Popover } from '../lib/popover'

describe('Popover', () => {
  beforeEach(() => {
    calls.open = undefined
    calls.close = undefined
    calls.sendData = undefined
    vi.clearAllMocks()
  })

  it('autoOpen 时构造即调用 popoverOpen，传递 type+anchor+data', () => {
    new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      data: { items: [] },
    })
    expect(calls.open?.[0]).toBe('id-1')
    expect(calls.open?.[1]).toMatchObject({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      data: { items: [] },
    })
  })

  it('open 透传 mode 到 popoverOpen', () => {
    new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      mode: 'bounded',
    })
    expect(calls.open?.[1]).toMatchObject({ mode: 'bounded' })
  })

  it('close 调用 popoverClose 并注销', () => {
    const p = new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
    })
    p.close()
    expect(calls.close?.[0]).toBe('id-1')
  })

  it('onPopoverEvent 回填时调用 onEvent', () => {
    const onEvent = vi.fn()
    new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      onEvent,
    })
    const cb = (
      browserAPI as {
        __eventCb?: (p: { popoverId: string; eventName: string; eventData?: unknown }) => void
      }
    ).__eventCb!
    cb({ popoverId: 'id-1', eventName: 'select', eventData: 'item-1' })
    expect(onEvent).toHaveBeenCalledWith('select', 'item-1')
  })

  it('sendData 调用 popoverSendData', () => {
    const p = new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
    })
    p.sendData({ query: 'test' })
    expect(calls.sendData?.[0]).toBe('id-1')
    expect(calls.sendData?.[1]).toMatchObject({ query: 'test' })
  })

  it('id 返回 popoverId', () => {
    const p = new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      autoOpen: false,
    })
    expect(p.id).toBe('id-1')
  })

  it('onPopoverDismiss 清理 eventMap', () => {
    const onEvent = vi.fn()
    new Popover({
      type: 'menu',
      anchor: { type: 'point', x: 1, y: 2 },
      onEvent,
    })
    const dismissCb = (browserAPI as { __dismissCb?: (id: string) => void }).__dismissCb!
    dismissCb('id-1')
    // 关闭后，面板回发该 popover 的事件不应再触发原回调（eventMap 已清理）
    const eventCb = (
      browserAPI as {
        __eventCb?: (p: { popoverId: string; eventName: string; eventData?: unknown }) => void
      }
    ).__eventCb!
    eventCb({ popoverId: 'id-1', eventName: 'select', eventData: 'x' })
    expect(onEvent).not.toHaveBeenCalled()
  })
})
