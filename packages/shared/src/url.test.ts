import { describe, expect, it } from 'vitest'
import { normalizeAddressBarInput } from './url'

describe('normalizeAddressBarInput', () => {
  it('treats a full URL as a url', () => {
    expect(normalizeAddressBarInput('https://example.com')).toEqual({
      type: 'url',
      value: 'https://example.com',
    })
  })

  it('adds https:// to a bare domain', () => {
    expect(normalizeAddressBarInput('example.com')).toEqual({
      type: 'url',
      value: 'https://example.com',
    })
  })

  it('treats free text as a search query', () => {
    expect(normalizeAddressBarInput('hello world')).toEqual({
      type: 'search',
      value: 'hello world',
    })
  })
})
