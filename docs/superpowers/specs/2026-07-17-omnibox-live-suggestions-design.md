# 设计文档：搜索实时建议（Omnibox）

日期：2026-07-17
状态：已评审，待实现

## 目标

为地址栏（Omnibox）增加「实时搜索建议」能力：用户在地址栏输入时，除现有本地历史/书签补全外，额外从用户所选搜索引擎（Google / Baidu / Bing）的官方 suggest 接口拉取实时查询建议，合并展示在下拉列表中。

设计原则（来自项目约定 AGENTS.md）：
- 联网请求统一由**主进程代理**，渲染进程不直接 fetch（规避 CORS、统一走 preload 白名单）。
- 引擎建议失败/超时**绝不**影响本地补全；默认静默降级。
- 关键路径加 `console.debug` 日志。

## 当前现状（探索结论）

- `autocomplete:suggestions` IPC（`packages/ipc-contract/src/channels.ts:418`）目前只返回**本地** history + bookmark 结果，去重后 `slice(limit)`。
- `AutocompleteSuggestion.type` 现有取值：`'history' | 'bookmark' | 'search'`。
- 搜索设置：`SettingsSchema` 已有 `defaultSearch` / `searchEngine`（`'google'|'baidu'|'bing'`），`SEARCH_ENGINE_BASE` 在 `packages/shared/src/url.ts:11` 定义了三个引擎的搜索落地页前缀。
- 渲染侧：`AddressBar.vue` 已有 200ms 防抖（`@input` → `update-query` → `fetchSuggestions`），下拉由 `AddressBarSuggestions.vue` 在 popover 内渲染（已支持 favicon / 类型图标 / `search` 直达项）。
- 设置页 UI（main 分支现状）：已重构为分节视图，搜索相关设置在 `apps/renderer/src/views/settings/GeneralView.vue`，采用 `SettingsSection` + `SettingsItem` 组合模式；`searchEngine` 开关即在此处。本设计的「实时搜索建议」开关将加在同文件「基础」分组内。
- `resolveAddressBarTarget(input, engine)`（`packages/shared/src/url.ts:34`）可把短语构造为对应引擎的搜索 URL —— engine 建议项直接复用。

## 方案

**方案 A（采用）：主进程新增 `search-suggestions.ts` 模块 + 扩展 `autocomplete:suggestions` IPC**
- 改动集中、渲染进程零联网、复用既有 popover/preload 架构、风险低。
- 否决方案 B（独立 `search:suggest` IPC，渲染侧合并）——竞态/排序更复杂，收益不足；方案 C（渲染进程直连）因 CORS 被否。

## 设计分节

### 1. 数据层 —— 主进程 `apps/main/src/search-suggestions.ts`（新建）

导出：
```ts
export async function getSearchSuggestions(
  query: string,
  engine: SearchEngine,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<string[]>
```
- 内部按 `engine` 分发到各自的适配器（`google` / `bing` / `baidu`）。
- 各适配器返回 `string[]`（建议短语），统一 `AbortController` + 超时（默认 800ms），失败/超时/空 query 一律返回 `[]`，**不抛错**。
- 请求使用 Node 自带 `fetch`，带 `User-Agent` 头降低被拒概率。
- URL 构造：
  - Google：`https://www.google.com/complete/search?client=chrome&q=<encoded>`，返回 JSON 数组 `[query, [suggestions...], ...]`，取 index 1。
  - Bing：`https://www.bing.com/AS/Suggestions?pt=page.home&mkt=zh-CN&q=<encoded>`，解析 JSON 取建议列表。
  - Baidu：`https://suggestion.baidu.com/su?wd=<encoded>&cb=`（JSONP），剥离 `cb(` 前缀与尾 `)` 后 `JSON.parse`，取 `s` 字段数组。
- 超时用 `Promise.race([fetch(...), timeout(opts.timeoutMs ?? 800)])`；`timeout` 触发 `controller.abort()` 并返回 `[]`。

### 2. IPC 与合并逻辑 —— `apps/main/src/ipc/register.ts` `autocomplete:suggestions`

改造现有 handler（`register.ts:450`）：
1. 读取 `settings.searchSuggestions`（默认 true）与 `settings.searchEngine`（默认 google）。
2. 本地结果（history + bookmark）保持现有同步计算逻辑。
3. 若开关开启且 `query.trim()` 非空：
   - `const engineHits = await withTimeout(getSearchSuggestions(query, engine), 800)`（容错：包 try/catch，异常记 `console.debug` 并返回 `[]`）。
   - 映射为 `{ type: 'engine', title: phrase, url: resolveAddressBarTarget(phrase, engine) }`。
4. 合并排序：
   - 顶部保留一条 `type:'search'` 的「用 <engine> 搜索 “query”」直达项（若 query 本身已是 URL 则不插入）。
   - 本地匹配（title/url 包含 query）优先，engine 建议其后。
   - 按 `url` 去重（engine 与本地可能重复）。
   - `limit` 提到 8（本地 ~4 + 引擎 ~4 量级）。
5. 日志：`console.debug('[Autocomplete] suggestions: query=%s engine=%s local=%d engine=%d', query, engine, local.length, engineHits.length)`。

`AutocompleteSuggestion` 类型（`channels.ts:253`）扩展并加注释区分：
```ts
export interface AutocompleteSuggestion {
  /** history: 本地历史记录；bookmark: 本地书签；search: 地址栏“用X搜索”直达项；engine: 搜索引擎实时建议 */
  type: 'history' | 'bookmark' | 'search' | 'engine'
  title: string
  url: string
}
```

### 3. 渲染层 —— `AddressBar.vue` / `AddressBarSuggestions.vue`

- `AddressBar.vue`：防抖已有，无需改结构；`fetchSuggestions()` 拿到的列表（已含 engine 项）直接 `sendData` 给 popover。
- `AddressBarSuggestions.vue`：
  - `item.type === 'engine'` → 用搜索类图标（如 `mdi:magnify`），标题显示建议短语；与 `search` 项（搜索图标）在样式/注释上区分。
  - 点击 engine 项 → 走现有 `onSelect(item.url)` → 打开搜索结果页，行为不变。
  - 无 favicon 的 engine 项回退 `DefaultFavicon`（已由 `Favicon.vue` 统一处理，无需额外改动）。
- `AutocompleteSuggestion` 类型已扩展，渲染侧 `item.type` 判别补 `engine` 分支并注释说明来源。

### 4. 设置项与错误处理

- **设置项**：`SettingsSchema` 新增 `searchSuggestions: boolean`（默认 `true`），`defaultSettings` 补默认值。`settings:set` / `settings:get` 已支持任意 key，IPC 无需改。
- **设置页 UI**：在 `apps/renderer/src/views/settings/GeneralView.vue` 的「基础」`SettingsSection` 中（紧挨 `searchEngine` 项之后）加一个 `SettingsItem` + `NSwitch`「实时搜索建议」，模式与现有 `openInNewTab` 等开关一致：
  ```vue
  <SettingsItem :label="t('settings.searchSuggestions')">
    <NSwitch v-model:value="searchSuggestions" />
  </SettingsItem>
  ```
  并在 `loadSettings()` 中 `searchSuggestions.value = Boolean(await window.browserAPI.getSetting('searchSuggestions'))`，加 `watch(searchSuggestions, v => saveSetting('searchSuggestions', v))`。i18n 需补 `settings.searchSuggestions` 文案。
- **错误处理**：
  - 每个引擎适配器 `try/catch` + `AbortController`，超时/网络错误返回 `[]`。
  - handler 对 engine 部分用带超时的调用，确保本地结果先算、engine 结果在单次 invoke 内合并返回（popover 一次性拿到完整列表，无需二次 sendData）。
  - 引擎请求失败记 `console.debug`（非 `error`，避免刷屏）。
- **测试**：
  - `search-suggestions.ts` 单测（mock `fetch` / `global.fetch`）：Google JSON 解析、Baidu JSONP 解析、超时返回 `[]`、空 query 返回 `[]`、错误返回 `[]`。
  - `autocomplete:suggestions` 集成测试：开关关 → 无 engine 项；开关开 + mock → 含 engine 项且本地优先排序。
  - 渲染层：`AddressBarSuggestions` engine 项渲染正确图标（组件测试，如可行）。

## 涉及文件清单

| 文件 | 改动 |
|------|------|
| `apps/main/src/search-suggestions.ts` | 新建，引擎适配器 + `getSearchSuggestions` |
| `apps/main/src/ipc/register.ts` | 扩展 `autocomplete:suggestions` handler（合并 engine 建议） |
| `apps/main/src/settings-manager.ts` | `SettingsSchema` + `defaultSettings` 加 `searchSuggestions` |
| `packages/ipc-contract/src/channels.ts` | `AutocompleteSuggestion.type` 加 `'engine'` + 注释 |
| `apps/renderer/src/panel/AddressBarSuggestions.vue` | `engine` 类型图标/分支 + 注释 |
| `apps/renderer/src/views/settings/GeneralView.vue` | 「实时搜索建议」`NSwitch` 开关（基础 `SettingsSection`） |
| `apps/main/src/search-suggestions.test.ts` | 单测（新建） |
| 集成/组件测试 | 视框架补充 |

## 不在范围内（YAGNI）

- 多搜索引擎并行混合建议（仅用用户所选单个引擎）。
- 建议项的个性化排名/点击反馈上报。
- 离线缓存建议结果。
