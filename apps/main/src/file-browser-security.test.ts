import { isLocalPath, normalizeLocalPath } from '@browser/shared'
import { describe, expect, it } from 'vitest'

describe('isLocalPath', () => {
  it('detects Unix absolute paths', () => {
    expect(isLocalPath('/home/user/docs')).toBe(true)
    expect(isLocalPath('/tmp/test.txt')).toBe(true)
  })

  it('detects Windows paths', () => {
    expect(isLocalPath('C:/Users/x')).toBe(true)
    expect(isLocalPath('D:\\Documents')).toBe(true)
  })

  it('detects Unix short paths', () => {
    expect(isLocalPath('~/Documents')).toBe(true)
  })

  it('detects relative paths', () => {
    expect(isLocalPath('./src')).toBe(true)
    expect(isLocalPath('../tmp')).toBe(true)
  })

  it('rejects URLs', () => {
    expect(isLocalPath('https://example.com')).toBe(false)
    expect(isLocalPath('http://localhost:3000')).toBe(false)
    expect(isLocalPath('wmfx://files')).toBe(false)
  })

  it('rejects plain text', () => {
    expect(isLocalPath('hello world')).toBe(false)
    expect(isLocalPath('example')).toBe(false)
  })
})

describe('normalizeLocalPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeLocalPath('C:\\Users\\x')).toBe('C:/Users/x')
    expect(normalizeLocalPath('D:\\path\\to\\file')).toBe('D:/path/to/file')
  })

  it('keeps forward slashes unchanged', () => {
    expect(normalizeLocalPath('/home/user/docs')).toBe('/home/user/docs')
    expect(normalizeLocalPath('C:/Users/x')).toBe('C:/Users/x')
  })
})
