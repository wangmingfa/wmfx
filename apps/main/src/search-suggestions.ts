/**
 * 搜索引擎实时建议抓取 —— 主进程侧，统一用 Node 原生 fetch。
 * 各引擎适配器返回建议短语 string[]；任何失败/超时/空 query 均返回 []，绝不抛错，
 * 保证地址栏本地补全不受影响。
 */
import type { SearchEngine } from '@browser/ipc-contract'
import iconv from 'iconv-lite'

const GOOGLE_URL = 'https://www.google.com/complete/search?client=chrome&q='
const BING_URL = 'https://www.bing.com/AS/Suggestions?pt=page.home&mkt=zh-CN&q='
const BAIDU_URL = 'https://suggestion.baidu.com/su?wd='

/**
 * 给一个可产生 AbortController 的异步操作加超时：
 * ms 到期后 abort 并执行 onTimeout，操作返回 null；成功返回结果。
 */
async function withTimeout<T>(
  ms: number,
  onTimeout: () => void,
  createPromise: (signal: AbortSignal) => Promise<T>
): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => {
    ctrl.abort()
    onTimeout()
  }, ms)
  try {
    return await createPromise(ctrl.signal)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseGoogle(body: unknown): string[] {
  if (Array.isArray(body) && Array.isArray(body[1])) {
    return (body[1] as unknown[]).map(String)
  }
  return []
}

function parseBing(body: unknown): string[] {
  const groups = (
    body as { suggestionGroups?: { searchSuggestions?: { displayText?: string }[] }[] }
  )?.suggestionGroups
  if (!groups) return []
  return groups
    .flatMap((g) => g.searchSuggestions ?? [])
    .map((s) => s.displayText ?? '')
    .filter(Boolean)
}

function parseBaidu(text: string): string[] {
  const m = text.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/)
  if (!m) return []
  // Baidu returns JSONP with unquoted keys (e.g. {q:"x",s:["a","b"]}); normalize to valid JSON
  const normalized = m[1].replace(/([{,])\s*([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":')
  try {
    const obj = JSON.parse(normalized)
    if (Array.isArray(obj.s)) return obj.s.map(String)
  } catch {
    return []
  }
  return []
}

async function fetchSuggestions(
  query: string,
  engine: SearchEngine,
  timeoutMs: number
): Promise<string[]> {
  const q = encodeURIComponent(query)
  let url = ''
  if (engine === 'google') url = `${GOOGLE_URL}${q}`
  else if (engine === 'bing') url = `${BING_URL}${q}`
  else url = `${BAIDU_URL}${q}&cb=`

  const res = await withTimeout(
    timeoutMs,
    () => console.debug('[SearchSuggestions] timeout: engine=%s query=%s', engine, query),
    (signal) => fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal })
  )
  if (!res?.ok) return []
  if (engine === 'baidu') {
    // 百度建议接口返回 GBK 编码的 JSONP，Node fetch 默认 UTF-8 会乱码，用 iconv-lite 正确解码
    const raw = Buffer.from(await res.arrayBuffer())
    const text = iconv.decode(raw, 'GBK')
    return parseBaidu(text)
  }
  const body = await res.json()
  if (engine === 'google') return parseGoogle(body)
  return parseBing(body)
}

/** 拉取指定引擎的实时搜索建议；空 query / 失败 / 超时均返回 [] */
export async function getSearchSuggestions(
  query: string,
  engine: SearchEngine,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const timeoutMs = opts?.timeoutMs ?? 800
  try {
    return await fetchSuggestions(trimmed, engine, timeoutMs)
  } catch (err) {
    console.debug(
      '[SearchSuggestions] error: engine=%s query=%s err=%s',
      engine,
      trimmed,
      String(err)
    )
    return []
  }
}
