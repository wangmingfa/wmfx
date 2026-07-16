# 导航状态模型重构 + 网页加载失败错误页 + SSL 证书警告页

日期：2026-07-16

## 背景与目标

当前 `TabState` 只有单一 `url` 字段，无法区分"用户请求的 URL""实际加载的 URL""地址栏应显示的 URL""最后一次成功提交的 URL"。随着浏览器功能增加（错误页、SSL 警告、崩溃恢复、PDF、Reader Mode、内部页），单一 `url` 会变成"这个 URL 到底代表什么"的歧义来源。

本次一次性把 `TabState.url` 重构为完整的 `navigation` 子对象，并以此为基础实现三个能力：
1. **网页加载失败错误页**（访问不存在或无法访问的网页时显示）。
2. **SSL 证书警告页**（证书错误时拦截并显示警告，用户可选择返回或继续）。
3. **地址栏安全标志**（输入框左侧显示 安全/不安全/内部页 三态图标，类 Chrome）。

## 一、导航状态模型

用 `navigation` 子对象取代 `TabState.url` 与顶层 `isLoading`。

```ts
interface NavigationError {
  code: number          // Chromium errorCode，如 -105
  description: string   // Chromium errorDescription，如 ERR_NAME_NOT_RESOLVED
}

type NavigationRunState = 'loading' | 'success' | 'error' | 'crashed'

/** 地址栏安全标志三态 */
type SecurityState =
  | 'secure'    // https 正常 → 锁
  | 'insecure'  // http / 证书错误但已继续 → 警告三角
  | 'internal'  // wmfx:// 内部页 → 专用图标

interface NavigationState {
  /** 地址栏显示的 URL（成功=committedUrl；失败=requestedUrl，即保留用户看到的地址） */
  displayUrl: string
  /** 用户输入/点击请求访问的 URL（重试用） */
  requestedUrl: string
  /** 最后一次成功 commit 的 URL */
  committedUrl: string
  /** WebContents 当前实际加载的 URL（可能是 wmfx://error / wmfx://cert-warning） */
  internalUrl: string
  /** 是否正在等待导航完成 */
  isLoading: boolean
  /** 当前导航状态 */
  state: NavigationRunState
  /** 导航错误（无错误时为 null） */
  error: NavigationError | null
  /** 地址栏安全标志（由 URL 协议 + 证书信任状态推导） */
  securityState: SecurityState
}

interface TabState {
  id: string
  windowId: string
  sessionId: string
  navigation: NavigationState   // 取代原 url 字段与顶层 isLoading
  title: string
  favicon: string | null
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  isMuted: boolean
  isPinned: boolean
  active: boolean
  isSuspended: boolean
}
```

**关于 `state` 取值**：不设 `idle`。当前架构下 tab 一创建即 `loadURL`，`idle` 无真实落脚点（会成为 renderer 永不出现的死分支），故 create 后立即进入 `loading`。

**字段来源映射**：
- `requestedUrl`：`create()` / `NavigationManager.loadURL()` 发起导航时设置。
- `internalUrl`：`did-navigate` / `did-navigate-in-page` 时 = `wc.getURL()`。
- `committedUrl`：`did-navigate` 成功时 = 规范化后的 URL。
- `displayUrl`：成功时 = committedUrl；失败时 = requestedUrl。
- `state` / `error`：见第三节事件接线。
- `isLoading`：替代原顶层 `TabState.isLoading`，移入 navigation。

## 二、错误页承载（wmfx://error）

复用现有内部页机制（`wmfx://` + vue-router hash 路由），新增错误页组件。

### 承载方式
- 失败时 `loadInternalView(view, 'error')`，导航到 **`wmfx://error`（无 query，internalUrl 干净）**。
- `displayUrl` 保持为 `requestedUrl`，地址栏仍显示原失败 URL（类 Chrome）。

### 错误信息获取：拉模式（invoke），非推送
**不通过 URL 传参**（避免长 URL 超限与编码/解析脆弱），**也不用主进程主动 push**（避免 `send` 早于 ErrorView `onMounted` 监听器就绪的时序竞态）。

- ErrorView 在 `onMounted` 调 `const info = await window.browserAPI.getErrorInfo()`。
- 主进程 `handle('page:getErrorInfo', event)`：按 `event.sender.id`（wcId）反查所属 tab，返回该 tab 的 `{ code, description, requestedUrl }`；无错误或反查不到时返回 `null`。
- 因为在监听器就绪后才拉，且 `did-fail-load` 早于错误页加载完成，`navigation.error` 此时必已就位——**无时序竞态**。

### ErrorView 渲染（双态，永不空白/崩溃）

**正常态（info 非空）**：
- 大标题 + 按错误类型的图标
- 友好描述：按 code 映射的 i18n 文案（如 `-105 → "找不到该网站的服务器 IP 地址"`）
- 失败 URL：显示 `requestedUrl`
- 错误码：`code / description`（排查用）
- 建议：按类型分组（DNS 类 → 检查网址拼写；连接类 → 检查网络；超时 → 稍后重试）
- **重试**按钮 → `window.browserAPI.retry()`

**兜底态（info 为 null 或字段缺失）**：
- 标题/描述：通用 i18n 文案（如"无法显示此页面"）
- 失败 URL 行、错误码行：隐藏
- 隐藏"重试"，改为显示 **"返回上一页"**（→ nav goBack；若无法后退则回 `wmfx://newtab`）

**字段级容错**：即使 info 非空，也对 `requestedUrl` / `code` 逐个判断存在性，有则显示、无则隐藏该行，保证任意组合都能渲染合理页面。

### 错误码 → 文案映射
维护一张 code → 友好文案 + 建议类型的映射表，覆盖常见 Chromium code：
`ERR_NAME_NOT_RESOLVED(-105)`、`ERR_CONNECTION_REFUSED(-102)`、`ERR_CONNECTION_TIMED_OUT(-118)`、`ERR_INTERNET_DISCONNECTED(-106)`、`ERR_ADDRESS_UNREACHABLE(-109)`、`ERR_CONNECTION_RESET(-101)` 等；未命中则回退显示原始 `description`。映射表放 ErrorView（纯展示层）内维护。

## 二·SSL、SSL 证书警告页（wmfx://cert-warning）

证书错误走 **`webContents.on('certificate-error')`**（非 `did-fail-load`），机制与普通加载失败不同：回调可 `event.preventDefault() + callback(true)` 强行信任并继续加载。这是"仍要继续访问"的能力来源。

### 拦截流程（certificate-error 事件）
```
on('certificate-error', (event, url, errorText, cert, callback) => {
  const host = new URL(url).host
  // 1. 命中信任白名单（永久 or 本次运行 or 本次导航）→ 放行
  if (certTrust.isTrusted(host, errorText)) { event.preventDefault(); callback(true); return }
  // 2. 未信任 → 阻止加载（默认 callback(false)），记录证书错误信息，导航到警告页
  //    （不调 preventDefault，Electron 默认拒绝证书；随后主动加载警告页）
  navigation.error = { code: /* cert 错误映射为负码或用 errorText */, description: errorText }
  navigation.state = 'error'          // 复用 error 状态机，与加载失败同一 state
  navigation.securityState = 'insecure'
  navigation.displayUrl 保持 = requestedUrl
  certPending.set(wcId, { host, errorText, requestedUrl })   // 供警告页拉取
  loadInternalView(view, 'cert-warning')   // → wmfx://cert-warning，无 query
})
```

> 注意：`certificate-error` 触发后该次导航已失败，Electron 不会加载原页面。主进程随即 `loadInternalView(..., 'cert-warning')` 把 view 导航到警告内部页。

### 警告信息获取：同 error 页的拉模式
- CertWarningView `onMounted` 调 `window.browserAPI.getCertWarningInfo()`。
- `handle('page:getCertWarningInfo', event)`：按 wcId 反查 tab，返回 `certPending` 中的 `{ host, errorText, requestedUrl }`；无则返回 `null`（→ 兜底态，仅"返回上一页"）。

### CertWarningView 操作（三项，全选）
1. **返回安全页面**（默认主按钮）→ `retry` 语义之外的 goBack；无法后退则回 `wmfx://newtab`。
2. **显示证书错误详情** → 展开 host / errorText（如 `NET::ERR_CERT_DATE_INVALID`、`CERT_AUTHORITY_INVALID`、`CERT_COMMON_NAME_INVALID`）+ 失败 URL。
3. **仍要继续访问**（次要，需展开确认）→ 先选**信任范围**，再 `window.browserAPI.trustCertAndContinue(scope)`。

### 信任范围三选项
```
type CertTrustScope = 'once' | 'session' | 'always'
```
- `once`（仅本次）：把 `host+errorText` 加入 certTrust，但仅在紧接着的这次重新加载生效；重载后从 once 集合移除。实现上用一次性 pending 标记。
- `session`（本次运行/重启前）：加入内存 `Set<`host|errorText`>`，进程存活期间同 host 同错误直接放行。
- `always`（永久）：写入 settings-manager 持久化数组 `trustedCerts: { host, errorText }[]`，重启后仍生效。

**主进程 `handle('page:trustCertAndContinue', event, scope)`**：
```
1. 反查 tab；取 certPending 的 { host, errorText, requestedUrl }
2. certTrust.add(host, errorText, scope)   // once/session 内存，always 落盘
3. navigationManager.loadURL(view, requestedUrl)   // 重新加载，此次 certificate-error 命中白名单 → callback(true)
```

### CertTrustStore（新增，apps/main/src/cert-trust-store.ts）

**信任 key 粒度：`host + '|' + errorText` 复合 key，不是只用 host。**
理由：同一 host 的证书错误类型可能变化（如今天 `ERR_CERT_DATE_INVALID`，明天换证书后变 `ERR_CERT_COMMON_NAME_INVALID`）。若只用 host 作 key，用户当初只放行了一个已知风险，却会连带放行一个他从未见过的新错误——安全漏洞。故 `isTrusted` 必须 host 与 errorText **两者都匹配**才放行；三层集合内部均以复合 key 存储。

统一封装三层信任：
- `isTrusted(host, errorText): boolean` — 依次查 once / session / always（always 从 settings-manager 读入内存缓存）。以复合 key 精确匹配。
- `add(host, errorText, scope)` — 按 scope 写对应层。
- `consumeOnce(host, errorText)` — once 命中后移除（在 certificate-error 放行后调用）。
- 启动时从 settings-manager 载入 `trustedCerts` 到 always 缓存。

### 证书错误 → 文案映射
CertWarningView 内维护 errorText → 友好文案表：`ERR_CERT_DATE_INVALID`（证书已过期或时间错误）、`ERR_CERT_AUTHORITY_INVALID`（颁发机构不受信任）、`ERR_CERT_COMMON_NAME_INVALID`（证书与域名不匹配）、`ERR_CERT_REVOKED`（证书已吊销）等；未命中回退原始 errorText。

## 三、主进程事件接线（tab-manager）

各 webContents 事件 → 更新 navigation 字段 + 触发错误页。

**导航发起时**（`create()` / `NavigationManager.loadURL()`）：
```
navigation.requestedUrl = 目标 URL
navigation.state = 'loading'
navigation.error = null
```

**`did-start-loading`**：
```
navigation.isLoading = true
navigation.state = 'loading'   // 若非 crashed
```

**`did-navigate`（成功 commit）**：
```
navigation.internalUrl  = wc.getURL()
navigation.committedUrl = 规范化 URL（wmfxFromActualUrl 处理后）
navigation.displayUrl   = committedUrl
navigation.state        = 'success'
navigation.error        = null
navigation.securityState = deriveSecurity(committedUrl, host 是否已信任证书)
canGoBack / canGoForward = wc.navigationHistory.*
```

**securityState 推导规则 `deriveSecurity(url, certTrusted)`**：
```
wmfx://*                          → 'internal'
https:// 且 host 未在信任白名单    → 'secure'
https:// 但 host 在信任白名单       → 'insecure'（证书有问题但用户已放行）
其余（http:// / file:// 等）        → 'insecure'
```
成功导航到已信任证书的 https 站点时，虽然加载成功，但因证书本身不受信，安全标志显示 `insecure`（类 Chrome 的"不安全"）。

**securityState 是每次导航按当前页面 URL 无条件重算，不是从上一页继承。**
它不是累积状态。每次 `did-navigate` 成功 commit 都会拿到**新页面的 URL**（`wc.getURL()`），并就在同一个回调里重新调 `deriveSecurity(committedUrl, ...)` 覆盖旧值。因此"不安全 A 页 → 安全 B 页"的场景天然正确：导航到 B 触发新的 did-navigate，用 B 的 https URL 重算得 `'secure'`，A 的 `insecure` 不会残留。落地位置就是 tab-manager `did-navigate` 回调内（现 `tab.state.url = url` 那块，改为一并更新 navigation 各字段含 securityState），**同一事件、同一处，无需额外监听**。`did-navigate-in-page`（SPA 内路由跳转）同样重算，防止协议在页内变化的边缘情况漏更新。

**error 页 / cert-warning 页 did-navigate 特判**：当 `wc.getURL()` 为 `wmfx://error` 或 `wmfx://cert-warning` 时，只设 `internalUrl`，**不覆盖 displayUrl / committedUrl**，`state` 维持 `'error'`，`securityState` 维持 `'insecure'`。地址栏因此仍显示原失败/警告 URL。

**`did-navigate-in-page`**：更新 internalUrl / committedUrl / canGo*，不改 state。

**`did-fail-load`（核心新增）**：
```
仅处理主框架失败（isMainFrame）
忽略 errorCode === -3（ERR_ABORTED，用户取消/重定向中断，不显示错误页）
→ navigation.error = { code: errorCode, description: errorDescription }
→ navigation.state = 'error'
→ navigation.displayUrl 保持 = requestedUrl
→ loadInternalView(view, 'error')   // 导航到 wmfx://error，无 query
```

**`render-process-gone`**：
```
navigation.state = 'crashed'
（现有 reload 逻辑保留，reload 用 committedUrl || requestedUrl）
```

**`did-stop-loading`**：`navigation.isLoading = false`

**历史记录**：维持现状——在 did-navigate 里，仅当 `!isWmfxUrl(url) && state==='success'` 时 `historyManager.add`。失败导航不 commit → 天然不入历史；error 页是 `wmfx://` → 被过滤。**错误不入历史、不占后退栈**（失败导航未 commit；从错误页后退回到上一个正常页）。

**wcId → tab 反查**：tab-manager 维护 `Map<number wcId, string tabId>`，`create` 时登记、`close` 时删除，供 `page:getErrorInfo` / `page:retry` / `page:getCertWarningInfo` / `page:trustCertAndContinue` 按 sender 定位 tab。新增 `getTabByWcId(wcId)` 能力。

## 四、契约 / IPC / preload

**packages/ipc-contract/src/channels.ts**：
- 定义 `NavigationError` / `NavigationRunState` / `SecurityState` / `NavigationState`，`TabState` 用 `navigation` 取代顶层 `url` 与 `isLoading`。
- 定义 `CertTrustScope = 'once' | 'session' | 'always'`。
- 新增 invoke 通道：
  - `'page:getErrorInfo': () => { code: number; description: string; requestedUrl: string } | null`
  - `'page:retry': () => void`
  - `'page:getCertWarningInfo': () => { host: string; errorText: string; requestedUrl: string } | null`
  - `'page:trustCertAndContinue': (scope: CertTrustScope) => void`

**apps/main/src/preload.ts**：
```ts
getErrorInfo: () => ipcRenderer.invoke('page:getErrorInfo'),
retry: () => ipcRenderer.invoke('page:retry'),
getCertWarningInfo: () => ipcRenderer.invoke('page:getCertWarningInfo'),
trustCertAndContinue: (scope) => ipcRenderer.invoke('page:trustCertAndContinue', scope),
```
除 `trustCertAndContinue` 带 scope 外均无参，主进程按 `event.sender` → wcId → tab 定位。

**apps/main/src/ipc/register.ts**：
```ts
handle('page:getErrorInfo', (event) => {
  const inst = getInstance(event); if (!inst) return null
  const tab = inst.tabManager.getTabByWcId(event.sender.id); if (!tab) return null
  const n = tab.state.navigation
  if (!n.error) return null
  return { code: n.error.code, description: n.error.description, requestedUrl: n.requestedUrl }
})

handle('page:retry', (event) => {
  const inst = getInstance(event); if (!inst) return
  const tab = inst.tabManager.getTabByWcId(event.sender.id); if (!tab) return
  // 对齐现有加载入口（NavigationManager.loadURL），用 requestedUrl 重新加载
  inst.navigationManager.loadURL(tab.view, tab.state.navigation.requestedUrl)
})

handle('page:getCertWarningInfo', (event) => {
  const inst = getInstance(event); if (!inst) return null
  const tab = inst.tabManager.getTabByWcId(event.sender.id); if (!tab) return null
  return inst.tabManager.getCertPending(tab.id) ?? null   // { host, errorText, requestedUrl } | null
})

handle('page:trustCertAndContinue', (event, scope: CertTrustScope) => {
  const inst = getInstance(event); if (!inst) return
  const tab = inst.tabManager.getTabByWcId(event.sender.id); if (!tab) return
  const pending = inst.tabManager.getCertPending(tab.id); if (!pending) return
  inst.certTrustStore.add(pending.host, pending.errorText, scope)
  inst.navigationManager.loadURL(tab.view, pending.requestedUrl)
})
```

**apps/main/src/settings-manager.ts**：`SettingsSchema` 新增 `trustedCerts: { host: string; errorText: string }[]`（默认 `[]`），供 always 层持久化；新增 get/add 方法。

**apps/renderer/src/env.d.ts**：新增 `getErrorInfo` / `retry` / `getCertWarningInfo` / `trustCertAndContinue` 声明。

**apps/renderer/src/router.ts**：新增 `{ path: '/error', component: ErrorView }` 与 `{ path: '/cert-warning', component: CertWarningView }`。

## 五、renderer 消费侧改动

`TabState.url` → `navigation.*` 波及所有读 `url` / `isLoading` 处：

- **AddressBar.vue**：地址栏绑定 `navigation.displayUrl`（原 `state.url`）；加载态读 `navigation.isLoading`。
- **TabBar.vue**：标题/图标不变；loading spinner 读 `navigation.isLoading`。
- **ChromeUI.vue**：activeTab 同步逻辑不变（整个 TabState）。
- **后退/前进按钮**：读顶层 `canGoBack` / `canGoForward`（不变）。

### 地址栏安全标志（AddressInput.vue 左侧）
输入框左侧内嵌图标，绑定 `navigation.securityState`：
- `secure` → 锁图标（中性/绿色）
- `insecure` → 警告三角（灰/红），tooltip「不安全」
- `internal` → 专用图标（如 wmfx logo / 齿轮），tooltip「浏览器页面」

图标为纯展示，暂不做点击弹证书面板（YAGNI，未来可扩展）。i18n tooltip 文案入 `security.*`。

**主进程内部读 `tab.state.url` 的处理**：
- 会话保存：存 `navigation.committedUrl`（能恢复的 URL）。
- 会话恢复：用存的 url 作 `requestedUrl`。
- render-process-gone reload：用 `navigation.committedUrl || requestedUrl`。

**新增文件**：
- `apps/renderer/src/components/ErrorView.vue`：错误页组件（第二节双态渲染）。
- `apps/renderer/src/components/CertWarningView.vue`：SSL 证书警告页（二·SSL 节：返回/详情/继续+范围三选）。
- `apps/main/src/cert-trust-store.ts`：CertTrustStore（once/session/always 三层信任）。

**i18n**：新增 `error.*`（加载失败）、`certWarning.*`（证书警告标题/描述/详情/按钮/范围三选/错误映射）、`security.*`（安全标志 tooltip）文案键。

## 测试策略
- E2E：访问不存在域名（如 `http://nonexistent.invalid`）应显示错误页；地址栏保留原 URL；点击重试重新加载。
- E2E：错误页不进历史、后退回到上一正常页。
- E2E：访问自签名证书站点（如 `https://self-signed.badssl.com` 或 `https://expired.badssl.com`）显示证书警告页；「仍要继续（本次运行）」后重新加载成功，安全标志显示 insecure；同 host 再访问不再弹警告（session 生效）。
- E2E：证书信任 always → 重启后（模拟重新读 settings）仍放行。
- 手工验证：中英文 / 深浅色下错误页与证书警告页样式；三态安全标志图标；null 兜底态（手输 `wmfx://error` / `wmfx://cert-warning`）显示"返回上一页"。

## 非目标（YAGNI）
- 点击安全标志弹出证书详情面板 —— 本次仅展示图标 + tooltip。
- PDF 查看、Reader Mode —— 本次仅设计 navigation 模型使其未来无需改结构，不实现。
- `idle` 状态 —— 已删除。
