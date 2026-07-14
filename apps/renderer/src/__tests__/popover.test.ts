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
    onPopoverAction: vi.fn((cb: (p: { popoverId: string; menu: unknown }) => void) => {
      ;(browserAPI as { __cb?: typeof cb }).__cb = cb
    }),
    onPopoverDismiss: vi.fn(),
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
    vi.clearAllMocks()
  })

  it('autoOpen 时构造即调用 popoverOpen，且注册 popoverId', () => {
    new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction: () => {},
    })
    expect(calls.open?.[0]).toBe('id-1')
    expect(calls.open?.[2]).toMatchObject({ id: 't' })
  })

  it('close 调用 popoverClose 并注销', () => {
    const p = new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction: () => {},
    })
    p.close()
    expect(calls.close?.[0]).toBe('id-1')
  })

  it('onPopoverAction 回填时调用 onAction 且 context.close 可关闭', () => {
    const onAction = vi.fn()
    new Popover({
      anchor: { type: 'point', x: 1, y: 2 },
      descriptor: { id: 't', kind: 'menu', items: [] },
      onAction,
    })
    const cb = (browserAPI as { __cb?: (p: { popoverId: string; menu: unknown }) => void }).__cb!
    const closed = false
    cb({ popoverId: 'id-1', menu: { id: 'x' } })
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ menu: { id: 'x' }, context: expect.any(Object) })
    )
    const ctx = onAction.mock.calls[0][0].context
    const closeSpy = vi.spyOn(browserAPI, 'popoverClose')
    ctx.close()
    expect(closeSpy).toHaveBeenCalledWith('id-1')
    expect(closed).toBe(false)
  })
})
