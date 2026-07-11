import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS, isIpcChannel } from './channels'

describe('ipc channels', () => {
  it('includes the app:ping channel', () => {
    expect(IPC_CHANNELS).toContain('app:ping')
  })

  it('recognizes a valid channel', () => {
    expect(isIpcChannel('app:ping')).toBe(true)
  })

  it('rejects an unknown channel', () => {
    expect(isIpcChannel('bogus:channel')).toBe(false)
  })
})
