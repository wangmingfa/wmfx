import { beforeEach, describe, expect, it } from 'vitest'
import { requestAddressBarFocus, useAddressBarFocus } from './useAddressBarFocus'

describe('useAddressBarFocus', () => {
  beforeEach(() => {
    // Reset nonce between tests by creating a fresh ref
    requestAddressBarFocus()
  })

  it('returns a ref with numeric value', () => {
    const nonce = useAddressBarFocus()
    expect(typeof nonce.value).toBe('number')
  })

  it('increments nonce on each requestAddressBarFocus call', () => {
    const nonce = useAddressBarFocus()
    const initial = nonce.value
    requestAddressBarFocus()
    expect(nonce.value).toBe(initial + 1)
    requestAddressBarFocus()
    expect(nonce.value).toBe(initial + 2)
  })

  it('same ref is returned from multiple calls', () => {
    const a = useAddressBarFocus()
    const b = useAddressBarFocus()
    expect(a).toBe(b)
  })
})
