# Omnibox 实时搜索建议 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在地址栏下拉中，除本地历史/书签补全外，增加来自用户所选搜索引擎（Google/Baidu/Bing）官方 suggest 接口的实时查询建议，合并展示，并提供总开关。

**Architecture:** 主进程新建 `search-suggestions.ts` 按引擎分发适配器（原生 fetch + AbortController 超时），扩展现有 `autocomplete:suggestions` IPC 在单次 invoke 内合并本地结果与引擎建议；渲染侧 `AutocompleteSuggestion.type` 增加 `'engine'` 并在 `AddressBarSuggestions.vue` 渲染对应图标；设置项 `searchSuggestions` 经 `SettingsManager` 持久化，开关置于 `GeneralView.vue`。渲染进程零联网。

**Tech Stack:** Electron 主进程（Node fetch）、TypeScript、Vitest（单测）、Vue3 + Naive UI（设置开关）、现有 popover/autocomplete 架构、`@browser/shared` / `@browser/ipc-contract` 包。

## Global Constraints

- 包管理用 `bun`；测试命令 `bun x vitest run`（vitest 配置 `include: ['packages/**/*.test.ts', 'apps/**/*.test.ts']`）。
- 渲染进程**不得**直接 fetch 搜索引擎接口；联网一律走主进程。
- 引擎建议失败/超时**必须**返回 `[]`，绝不抛错中断本地补全；失败记 `console.debug`（非 `error`）。
- 关键 IPC / 数据变更路径必须加 `console.debug` 日志（格式 `[模块] 方法: 描述含关键参数`）。
- 所有新增/修改 `.ts` 走 biome lint：`bun run lint:ts`；`.vue` 走 eslint：`bun run lint:vue`；类型 `bun run lint:typecheck`。
- i18n 文案加到 `packages/shared/src/i18n/messages.ts` 的 `settings:` 命名空间（zh-CN 与 en-US 两处）。
- `AutocompleteSuggestion.type` 取值最终为 `'history' | 'bookmark' | 'search' | 'engine'`，代码中每个分支需注释来源区分。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `apps/main/src/search-suggestions.ts` | 新建。引擎适配器（google/bing/baidu）+ `getSearchSuggestions(query, engine, opts?)`，超时/容错返回 `string[]` |
| `apps/main/src/search-suggestions.test.ts` | 新建。单测：各引擎解析、超时、空 query、错误 |
| `packages/ipc-contract/src/channels.ts` | `AutocompleteSuggestion.type` 加 `'engine'` + 注释 |
| `apps/main/src/ipc/register.ts` | 扩展 `autocomplete:suggestions` handler：读设置、调引擎、合并排序、加日志 |
| `apps/main/src/settings-manager.ts` | `SettingsSchema` + `defaultSettings` 加 `searchSuggestions: boolean`（默认 `true`） |
| `apps/renderer/src/panel/AddressBarSuggestions.vue` | 加 `item.type === 'engine'` 图标/分支 + 注释 |
| `apps/renderer/src/views/settings/GeneralView.vue` | 「基础」分组加「实时搜索建议」`NSwitch`，`loadSettings`/`watch` 配对 |
| `packages/shared/src/i18n/messages.ts` | 加 `settings.searchSuggestions` 中英文案 |
| `packages/shared/src/url.ts` | （无需改）`resolveAddressBarTarget` 已可复用 |

---

### Task 1: 扩展 `AutocompleteSuggestion` 类型并加注释

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts:253-257`

**Interfaces:**
- Consumes: 无
- Produces: `AutocompleteSuggestion.type` 新增 `'engine'`，供 Task 3 / Task 5 使用

- [ ] **Step 1: 修改类型定义并加注释**

将：
```ts
export interface AutocompleteSuggestion {
  type: 'history' | 'bookmark' | 'search'
  title: string
  url: string
}
```
改为：
```ts
export interface AutocompleteSuggestion {
  /** history: 本地历史记录；bookmark: 本地书签；search: 地址栏“用X搜索”直达项；engine: 搜索引擎实时建议 */
  type: 'history' | 'bookmark' | 'search' | 'engine'
  title: string
  url: string
}
```

- [ ] **Step 2: 构建共享包确认类型无误**

Run: `bun run --filter @browser/ipc-contract build`
Expected: 退出码 0，`dist/index.d.ts` 含 `engine` 类型

- [ ] **Step 3: 提交**

```bash
git add packages/ipc-contract/src/channels.ts
git commit -m "feat(ipc): add 'engine' type to AutocompleteSuggestion"
```

---

### Task 2: 新增 `searchSuggestions` 设置项

**Files:**
- Modify: `apps/main/src/settings-manager.ts:5-22`（schema）、`apps/main/src/settings-manager.ts:24-41`（defaults）

**Interfaces:**
- Consumes: 无
- Produces: `SettingsManager.getInstance().get('searchSuggestions')` 返回 `boolean`（Task 3 读取）

- [ ] **Step 1: 在 `SettingsSchema` 增加字段**

在第 21 行 `openBookmarkInNewTab: boolean` 之后加一行：
```ts
  searchSuggestions: boolean
```

- [ ] **Step 2: 在 `defaultSettings` 增加默认值**

在第 40 行 `openBookmarkInNewTab: false,` 之后加一行：
```ts
  searchSuggestions: true,
```

- [ ] **Step 3: 构建主进程确认无类型错误**

Run: `bun run --filter @browser/main typecheck`
Expected: 退出码 0

- [ ] **Step 4: 提交**

```bash
git add apps/main/src/settings-manager.ts
git commit -m "feat(settings): add searchSuggestions toggle (default true)"
```

---

### Task 3: 主进程 `search-suggestions.ts` 模块 + 单测

**Files:**
- Create: `apps/main/src/search-suggestions.ts`
- Create: `apps/main/src/search-suggestions.test.ts`

**Interfaces:**
- Consumes: `SearchEngine` 类型（`packages/ipc-contract`，`'google'|'baidu'|'bing'`）
- Produces: `getSearchSuggestions(query: string, engine: SearchEngine, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<string[]>`

- [ ] **Step 1: 写失败单测（mock fetch）**

`apps/main/src/search-suggestions.test.ts`：
```ts
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
      })),
    )
    const r = await getSearchSuggestions('hell', 'google')
    expect(r).toEqual(['hello', 'hello world', 'hello kitty'])
  })

  it('baidu: 解析 JSONP su(...) 取 s 数组', async () => {
    const jsonp = 'window.baidu.sug({q:"hell",p:false,s:["hello","hello world"]});'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => jsonp })),
    )
    const r = await getSearchSuggestions('hell', 'baidu')
    expect(r).toEqual(['hello', 'hello world'])
  })

  it('bing: 解析 JSON 建议列表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ suggestionGroups: [{ searchSuggestions: [{ displayText: 'hello' }, { displayText: 'hello world' }] }] }),
      })),
    )
    const r = await getSearchSuggestions('hell', 'bing')
    expect(r).toEqual(['hello', 'hello world'])
  })

  it('fetch 抛错时返回 []', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net') }))
    const r = await getSearchSuggestions('hell', 'google')
    expect(r).toEqual([])
  })

  it('超时（timeoutMs 很小）返回 []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await new Promise((res) => setTimeout(res, 500))
        return { ok: true, json: async () => ['x'] }
      }),
    )
    const r = await getSearchSuggestions('hell', 'google', { timeoutMs: 10 })
    expect(r).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun x vitest run apps/main/src/search-suggestions.test.ts`
Expected: FAIL（模块不存在 / `getSearchSuggestions` undefined）

- [ ] **Step 3: 实现 `search-suggestions.ts`**

`apps/main/src/search-suggestions.ts`：
```ts
/**
 * 搜索引擎实时建议抓取 —— 主进程侧，统一用 Node 原生 fetch。
 * 各引擎适配器返回建议短语 string[]；任何失败/超时/空 query 均返回 []，绝不抛错，
 * 保证地址栏本地补全不受影响。
 */
import type { SearchEngine } from '@browser/ipc-contract'

const GOOGLE_URL = 'https://www.google.com/complete/search?client=chrome&q='
const BING_URL = 'https://www.bing.com/AS/Suggestions?pt=page.home&mkt=zh-CN&q='
const BAIDU_URL = 'https://suggestion.baidu.com/su?wd='

async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => {
    ctrl.abort()
    onTimeout()
  }, ms)
  try {
    return await p
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
  const groups = (body as { suggestionGroups?: { searchSuggestions?: { displayText?: string }[] }[] })?.suggestionGroups
  if (!groups) return []
  return groups
    .flatMap((g) => g.searchSuggestions ?? [])
    .map((s) => s.displayText ?? '')
    .filter(Boolean)
}

function parseBaidu(text: string): string[] {
  const m = text.match(/^[^\(]*\(([\s\S]*)\)\s*;?\s*$/)
  if (!m) return []
  try {
    const obj = JSON.parse(m[1])
    if (Array.isArray(obj.s)) return obj.s.map(String)
  } catch {
    return []
  }
  return []
}

async function fetchSuggestions(query: string, engine: SearchEngine, timeoutMs: number): Promise<string[]> {
  const q = encodeURIComponent(query)
  let url = ''
  if (engine === 'google') url = `${GOOGLE_URL}${q}`
  else if (engine === 'bing') url = `${BING_URL}${q}`
  else url = `${BAIDU_URL}${q}&cb=`

  const res = await withTimeout(
    fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }),
    timeoutMs,
    () => console.debug('[SearchSuggestions] timeout: engine=%s query=%s', engine, query),
  )
  if (!res || !res.ok) return []
  if (engine === 'baidu') return parseBaidu(await res.text())
  const body = await res.json()
  if (engine === 'google') return parseGoogle(body)
  return parseBing(body)
}

/** 拉取指定引擎的实时搜索建议；空 query / 失败 / 超时均返回 [] */
export async function getSearchSuggestions(
  query: string,
  engine: SearchEngine,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<string[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const timeoutMs = opts?.timeoutMs ?? 800
  try {
    return await fetchSuggestions(trimmed, engine, timeoutMs)
  } catch (err) {
    console.debug('[SearchSuggestions] error: engine=%s query=%s err=%s', engine, trimmed, String(err))
    return []
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun x vitest run apps/main/src/search-suggestions.test.ts`
Expected: PASS（全部 6 个用例）

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/search-suggestions.ts apps/main/src/search-suggestions.test.ts
git commit -m "feat(search): add engine suggestion fetcher with adapters + tests"
```

---

### Task 4: 扩展 `autocomplete:suggestions` IPC handler

**Files:**
- Modify: `apps/main/src/ipc/register.ts:506-530`（handler）

**Interfaces:**
- Consumes: `getSearchSuggestions`（`search-suggestions.ts`）、`SettingsManager.getInstance().get('searchSuggestions' | 'searchEngine')`、`resolveAddressBarTarget`（`@browser/shared`）
- Produces: 返回结果中新增 `type:'engine'` 项，供渲染侧 `AddressBarSuggestions.vue` 使用

- [ ] **Step 1: 引入依赖**

在 `apps/main/src/ipc/register.ts` 顶部 import 区添加：
```ts
import { getSearchSuggestions } from '../search-suggestions'
import { resolveAddressBarTarget } from '@browser/shared'
```

- [ ] **Step 2: 改写 handler**

将现有 `handle('autocomplete:suggestions', ...)` 整体替换为：
```ts
  handle('autocomplete:suggestions', async (event, opts) => {
    const inst = getInstance(event)
    if (!inst) return []
    const { query = '', limit = 8 } = opts
    const settings = SettingsManager.getInstance()
    const engine = (settings.get('searchEngine') as SearchEngine) ?? 'google'
    const enabled = settings.get('searchSuggestions') !== false

    // 1. 本地结果（history + bookmark），保持现有逻辑
    const historyResults = inst.historyManager.search(query, limit, 0).map((item) => ({
      type: 'history' as const,
      title: item.title ?? item.url,
      url: item.url,
    }))
    const bookmarkResults = inst.bookmarkManager.search(query).map((item) => ({
      type: 'bookmark' as const,
      title: item.title,
      url: item.url ?? '',
    }))
    const local: AutocompleteSuggestion[] = [...historyResults, ...bookmarkResults]

    // 2. 搜索引擎实时建议（受开关控制，失败/超时静默降级）
    let engineHits: AutocompleteSuggestion[] = []
    if (enabled && query.trim()) {
      const phrases = await getSearchSuggestions(query, engine)
      engineHits = phrases.map((phrase) => ({
        type: 'engine' as const,
        title: phrase,
        url: resolveAddressBarTarget(phrase, engine),
      }))
    }

    console.debug(
      '[Autocomplete] suggestions: query=%s engine=%s local=%d engine=%d',
      query,
      engine,
      local.length,
      engineHits.length,
    )

    // 3. 合并排序：本地优先，引擎其后；按 url 去重；顶部保留 search 直达项
    const isUrlLike =
      /^https?:\/\//i.test(query.trim()) ||
      (!query.includes(' ') && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(query.trim()))
    const out: AutocompleteSuggestion[] = []
    if (!isUrlLike && query.trim()) {
      out.push({
        type: 'search',
        title: `用 ${engine} 搜索 "${query.trim()}"`,
        url: resolveAddressBarTarget(query.trim(), engine),
      })
    }
    const seen = new Set<string>(out.map((s) => s.url))
    for (const s of [...local, ...engineHits]) {
      if (s.url && !seen.has(s.url)) {
        seen.add(s.url)
        out.push(s)
      }
    }
    return out.slice(0, limit).filter((s) => s.url)
  })
```

> 注：`AutocompleteSuggestion` 已在 `register.ts` 顶部 import（来自 `@browser/ipc-contract`）；但 `SearchEngine` **尚未**引入，需在 `import { ..., AutocompleteSuggestion, ... } from '@browser/ipc-contract'` 中补上 `SearchEngine`（或单独 `import type { SearchEngine } from '@browser/ipc-contract'`）。

- [ ] **Step 3: 类型检查**

Run: `bun run --filter @browser/main typecheck`
Expected: 退出码 0

- [ ] **Step 4: 全量类型检查 + 构建共享包**

Run: `bun run --filter @browser/shared build && bun run --filter @browser/ipc-contract build && bun run lint:typecheck`
Expected: 全部退出码 0

- [ ] **Step 5: 提交**

```bash
git add apps/main/src/ipc/register.ts
git commit -m "feat(autocomplete): merge live engine suggestions with local results"
```

---

### Task 5: 渲染侧 `AddressBarSuggestions.vue` 支持 `engine` 项

**Files:**
- Modify: `apps/renderer/src/panel/AddressBarSuggestions.vue:20-22`（图标分支）

**Interfaces:**
- Consumes: `AutocompleteSuggestion.type === 'engine'`（Task 1 已定义）
- Produces: 无

- [ ] **Step 1: 添加 engine 图标分支**

将现有模板中图标部分：
```vue
        <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
        <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
        <Icon v-else icon="ic:round-search" width="14" height="14" />
```
改为（engine 用 `mdi:magnify` 与 search 的 `ic:round-search` 区分，注释标明来源）：
```vue
        <!-- history: 本地历史；bookmark: 本地书签；search: 地址栏“用X搜索”直达；engine: 搜索引擎实时建议 -->
        <Icon v-if="item.type === 'history'" icon="carbon:time" width="14" height="14" />
        <Icon v-else-if="item.type === 'bookmark'" icon="carbon:bookmark-filled" width="14" height="14" />
        <Icon v-else-if="item.type === 'engine'" icon="mdi:magnify" width="14" height="14" />
        <Icon v-else icon="ic:round-search" width="14" height="14" />
```

- [ ] **Step 2: 渲染 lint + 类型检查**

Run: `bun run lint:vue && bun run --filter @browser/renderer typecheck`
Expected: 退出码 0（仅可能有既有告警，无新增 error）

- [ ] **Step 3: 提交**

```bash
git add apps/renderer/src/panel/AddressBarSuggestions.vue
git commit -m "feat(suggestions): render engine-type item with magnify icon"
```

---

### Task 6: 设置页「实时搜索建议」开关 + i18n

**Files:**
- Modify: `packages/shared/src/i18n/messages.ts`（zh-CN 与 en-US 的 `settings:` 块）
- Modify: `apps/renderer/src/views/settings/GeneralView.vue`

**Interfaces:**
- Consumes: `window.browserAPI.getSetting('searchSuggestions')` / `setSetting({ key:'searchSuggestions', value })`（来自 `settings:get` / `settings:set` IPC）
- Produces: 无

- [ ] **Step 1: 加 i18n 文案**

在 zh-CN `settings:` 块（约 `messages.ts:337` 附近，`searchEngine` 之后）加：
```ts
      searchSuggestions: '实时搜索建议',
```
在 en-US `settings:` 块（对应 `searchEngine: 'Default search engine'` 之后）加：
```ts
      searchSuggestions: 'Live search suggestions',
```

- [ ] **Step 2: GeneralView 加开关**

在 `GeneralView.vue` 模板「基础」`SettingsSection` 内，`searchEngine` 的 `SettingsItem` 之后加：
```vue
    <SettingsItem :label="t('settings.searchSuggestions')">
      <NSwitch v-model:value="searchSuggestions" />
    </SettingsItem>
```

在 `<script setup>` 的 ref 声明区（约 `openBookmarkInNewTabSetting` 之后）加：
```ts
const searchSuggestions = ref(true)
```

在 `loadSettings()` 内（约 `currentLang` 赋值前）加：
```ts
  searchSuggestions.value = Boolean(await window.browserAPI.getSetting('searchSuggestions'))
```

在文件末尾 `watch` 区（已有的 `watch(openBookmarkInNewTabSetting, ...)` 之后）加：
```ts
watch(searchSuggestions, (value) => {
  void saveSetting('searchSuggestions', value)
})
```

- [ ] **Step 3: 构建共享包 + 渲染类型检查 + vue lint**

Run: `bun run --filter @browser/shared build && bun run lint:vue && bun run --filter @browser/renderer typecheck`
Expected: 全部退出码 0

- [ ] **Step 4: 提交**

```bash
git add packages/shared/src/i18n/messages.ts apps/renderer/src/views/settings/GeneralView.vue
git commit -m "feat(settings): add live search suggestions toggle to GeneralView"
```

---

### Task 7: 端到端验证

**Files:**
- 无代码改动，仅运行验证

**Interfaces:**
- Consumes: 全部前述任务产物

- [ ] **Step 1: 全量 lint + typecheck**

Run: `bun run lint`
Expected: 退出码 0（仅允许既有、与本次无关的告警）

- [ ] **Step 2: 运行单测**

Run: `bun x vitest run`
Expected: 全部 PASS（含 Task 3 新增 6 个用例）

- [ ] **Step 3: 构建 renderer**

Run: `bun run --filter @browser/renderer build`
Expected: 退出码 0

- [ ] **Step 4: 手动验收要点（供开发者自查）**

- 地址栏输入「goo」→ 下拉含「用 google 搜索 “goo”」直达项 + 本地匹配 + 引擎实时建议（带 `mdi:magnify` 图标）。
- 设置 → 常规 → 关闭「实时搜索建议」→ 重新输入，下拉不再出现引擎项。
- 断网 / 引擎超时 → 本地补全照常，控制台仅有 `[SearchSuggestions] timeout/error` 的 debug 日志，无报错中断。
- 切换搜索引擎为 baidu/bing 后，引擎建议来源随之变化。

- [ ] **Step 5: 若发现问题回到对应 Task 修复并补提交**

```bash
git add -A
git commit -m "fix(omnibox): <具体问题描述>"
```
