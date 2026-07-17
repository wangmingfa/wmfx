import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSearchSuggestions } from './search-suggestions'

describe('getSearchSuggestions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('空 query 直接返回 []', async () => {
    expect(await getSearchSuggestions('', 'google')).toEqual([])
  })

  it('google: 解析 [query,[suggestions]] 第二项', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ['hell', ['hello', 'hello world', 'hello kitty']],
      }))
    )
    const r = await getSearchSuggestions('hell', 'google')
    expect(r).toEqual(['hello', 'hello world', 'hello kitty'])
  })

  it('baidu: 解析 JSONP su(...) 取 s 数组（GBK 解码）', async () => {
    const jsonp = 'window.baidu.sug({q:"hell",p:false,s:["hello","hello world"]});'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        // Baidu 返回 GBK 编码；iconv.decode(bytes, 'GBK') 才能正确还原
        arrayBuffer: async () => new Uint8Array(Buffer.from(jsonp)).buffer,
      }))
    )
    const r = await getSearchSuggestions('hell', 'baidu')
    expect(r).toEqual(['hello', 'hello world'])
  })

  it('bing: 解析 JSON 建议列表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          suggestionGroups: [
            { searchSuggestions: [{ displayText: 'hello' }, { displayText: 'hello world' }] },
          ],
        }),
      }))
    )
    const r = await getSearchSuggestions('hell', 'bing')
    expect(r).toEqual(['hello', 'hello world'])
  })

  it('fetch 抛错时返回 []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net')
      })
    )
    const r = await getSearchSuggestions('hell', 'google')
    expect(r).toEqual([])
  })

  it('超时（timeoutMs 很小）返回 []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_, opts) => {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 500)
          opts?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new DOMException('aborted', 'AbortError'))
          })
        })
        return { ok: true, json: async () => ['x'] }
      })
    )
    const r = await getSearchSuggestions('hell', 'google', { timeoutMs: 10 })
    expect(r).toEqual([])
  })
})
