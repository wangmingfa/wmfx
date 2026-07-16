# Navigation State Model + Error Page + SSL Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `TabState.url` into a full `NavigationState` sub-object, add load-failure error page (`wmfx://error`), SSL certificate warning page (`wmfx://cert-warning`), CertTrustStore (3-layer trust), and address bar security indicator (secure/insecure/internal).

**Architecture:** Type changes flow bottom-up: ipc-contract types → shared/url routes → tab-manager event wiring → IPC register handlers → preload → renderer components. Error/cert-warning pages use relaunchView to ensure preload is available for IPC communication. SecurityState is recomputed per-navigation in did-navigate.

**Tech Stack:** Electron (WebContentsView, certificate-error, did-fail-load), Vue 3 (vue-router hash routing), Naive UI, TypeScript, bun, biome, vitest, playwright E2E.

## Global Constraints

- Package manager: `bun` (not pnpm/npm)
- Lint: `bun run lint:ts` (biome check), `bun run lint:vue` (eslint), `bun run lint:typecheck` (per-pkg tsc)
- Format: `bun run format`
- Process spawning: use `execa` (not node:child_process)
- wmfx scheme: `wmfx://<path>`, dev=vite hash routing, prod=loadFile+hash
- Internal routes: `['/settings','/history','/bookmarks','/downloads','/proxy','/newtab','/error','/cert-warning']`
- `loadInternalView(view, path)` takes path segment (e.g. `'error'`), loads via hash routing
- `relaunchView(tabId, url)` destroys+recreates WebContentsView when internal/external nature changes
- `Tab.state` is `Omit<TabState, 'active'>` — auto-derives from TabState definition
- `getTabIdByWebContents(wc)` does linear scan (no wcId map exists yet)
- `certificate-error` and `did-fail-load` are NOT yet handled anywhere — both are net-new

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `apps/main/src/cert-trust-store.ts` | 3-layer cert trust (once/session/always) |
| `apps/renderer/src/views/ErrorView.vue` | Load-failure error page |
| `apps/renderer/src/views/CertWarningView.vue` | SSL cert warning page |

### Modified Files
| File | Changes |
|------|---------|
| `packages/ipc-contract/src/channels.ts` | Add NavigationState types, CertTrustScope, new IPC channels |
| `packages/ipc-contract/src/index.ts` | Export new types |
| `packages/shared/src/url.ts` | Add '/error', '/cert-warning' to INTERNAL_ROUTE_PREFIXES |
| `apps/main/src/settings-manager.ts` | Add `trustedCerts` field |
| `apps/main/src/tab-manager.ts` | Navigation state refactoring + did-fail-load + certificate-error + wcToTab map |
| `apps/main/src/navigation-manager.ts` | Adapt to navigation sub-object |
| `apps/main/src/ipc/register.ts` | New handlers (getErrorInfo, retry, getCertWarningInfo, trustCertAndContinue) |
| `apps/main/src/preload.ts` | New browserAPI methods |
| `apps/renderer/src/env.d.ts` | New type declarations |
| `apps/renderer/src/router.ts` | New routes '/error' → ErrorView, '/cert-warning' → CertWarningView |
| `apps/renderer/src/components/ChromeUI.vue` | `activeTab.url` → `activeTab.navigation.displayUrl` etc. |
| `apps/renderer/src/components/AddressBar.vue` | Props rename + security indicator slot |
| `apps/renderer/src/components/AddressInput.vue` | Security indicator icon |
| `apps/renderer/src/components/TabBar.vue` | `tab.url` → `tab.navigation.displayUrl` etc. |
| `apps/renderer/src/components/DownloadIndicator.vue` | `tab.url` → `tab.navigation.displayUrl` |
| `apps/renderer/src/components/AppMenuButton.vue` | `t.url` → `t.navigation.displayUrl` |

---

## Task 1: Navigation Types in ipc-contract

**Files:**
- Modify: `packages/ipc-contract/src/channels.ts:62-77` (TabState), lines 308+ (IpcContract), lines 439+ (IPC_CHANNELS)
- Modify: `packages/ipc-contract/src/index.ts:29` (exports)

**Interfaces:**
- Consumes: none (foundation)
- Produces: `NavigationError`, `NavigationRunState`, `SecurityState`, `NavigationState`, `CertTrustScope`, `CertWarningInfo`, updated `TabState`, 4 new IPC channels

- [ ] **Step 1: Add Navigation types before TabState (channels.ts line ~62)**

```typescript
/** 导航错误信息 */
export interface NavigationError {
  code: number
  description: string
}

export type NavigationRunState = 'loading' | 'success' | 'error' | 'crashed'

/** 地址栏安全标志三态 */
export type SecurityState = 'secure' | 'insecure' | 'internal'

export interface NavigationState {
  /** 地址栏显示的 URL（成功=committedUrl；失败=requestedUrl） */
  displayUrl: string
  /** 用户请求访问的 URL（重试用） */
  requestedUrl: string
  /** 最后一次成功 commit 的 URL */
  committedUrl: string
  /** WebContents 当前实际加载的 URL（可能是 wmfx://error） */
  internalUrl: string
  isLoading: boolean
  state: NavigationRunState
  error: NavigationError | null
  securityState: SecurityState
}

export type CertTrustScope = 'once' | 'session' | 'always'

export interface CertWarningInfo {
  host: string
  errorText: string
  requestedUrl: string
}
```

- [ ] **Step 2: Replace TabState.url + TabState.isLoading (channels.ts lines 62-77)**

Replace:
```typescript
export interface TabState {
  id: string
  windowId: string
  sessionId: string
  url: string
  title: string
  favicon: string | null
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoomFactor: number
  isMuted: boolean
  isPinned: boolean
  active: boolean
  isSuspended: boolean
}
```

With:
```typescript
export interface TabState {
  id: string
  windowId: string
  sessionId: string
  navigation: NavigationState
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

- [ ] **Step 3: Add 4 new IPC channels to IpcContract (after line 372)**

```typescript
  // Error / Cert Warning
  'page:getErrorInfo': () => { code: number; description: string; requestedUrl: string } | null
  'page:retry': () => void
  'page:getCertWarningInfo': () => CertWarningInfo | null
  'page:trustCertAndContinue': (scope: CertTrustScope) => void
```

- [ ] **Step 4: Add 4 channel literals to IPC_CHANNELS array (after line 503)**

```typescript
  // Error / Cert Warning
  'page:getErrorInfo',
  'page:retry',
  'page:getCertWarningInfo',
  'page:trustCertAndContinue',
```

- [ ] **Step 5: Export new types from index.ts (line ~29)**

Add `NavigationError`, `NavigationRunState`, `SecurityState`, `NavigationState`, `CertTrustScope`, `CertWarningInfo` to the import block.

- [ ] **Step 6: Typecheck**

Run: `bun run --filter @browser/ipc-contract typecheck`
Expected: PASS (type-only changes, no runtime)

- [ ] **Step 7: Commit**

```bash
git add packages/ipc-contract/
git commit -m "feat(ipc-contract): add NavigationState types and error/cert-warning IPC channels"
```

---

## Task 2: Shared URL Route Prefixes

**Files:**
- Modify: `packages/shared/src/url.ts:54-61` (INTERNAL_ROUTE_PREFIXES)

**Interfaces:**
- Consumes: none
- Produces: `/error` and `/cert-warning` recognized as internal routes

- [ ] **Step 1: Add routes to INTERNAL_ROUTE_PREFIXES (url.ts line 54-61)**

Replace:
```typescript
export const INTERNAL_ROUTE_PREFIXES: readonly string[] = [
  '/settings',
  '/history',
  '/bookmarks',
  '/downloads',
  '/proxy',
  '/newtab',
]
```

With:
```typescript
export const INTERNAL_ROUTE_PREFIXES: readonly string[] = [
  '/settings',
  '/history',
  '/bookmarks',
  '/downloads',
  '/proxy',
  '/newtab',
  '/error',
  '/cert-warning',
]
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @browser/shared typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/url.ts
git commit -m "feat(shared): add /error and /cert-warning to internal route prefixes"
```

---

## Task 3: Settings Schema — trustedCerts

**Files:**
- Modify: `apps/main/src/settings-manager.ts:5-19` (SettingsSchema), lines 21-35 (defaultSettings), lines 153-195 (validateValue)

**Interfaces:**
- Consumes: none
- Produces: `SettingsManager.get('trustedCerts')`, `SettingsManager.set('trustedCerts', ...)`

- [ ] **Step 1: Add trustedCerts to SettingsSchema (line 19)**

```typescript
  trustedCerts: { host: string; errorText: string }[]
```

- [ ] **Step 2: Add default to defaultSettings (line 35)**

```typescript
  trustedCerts: [],
```

- [ ] **Step 3: Add validation case in validateValue switch (before `default:`)**

```typescript
      case 'trustedCerts': {
        if (!Array.isArray(value)) return defaultSettings.trustedCerts
        return value.filter(
          (item) =>
            item != null &&
            typeof item === 'object' &&
            typeof (item as { host?: unknown }).host === 'string' &&
            typeof (item as { errorText?: unknown }).errorText === 'string'
        ) as SettingsSchema['trustedCerts']
      }
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @browser/main typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/settings-manager.ts
git commit -m "feat(settings): add trustedCerts field for SSL certificate trust persistence"
```

---

## Task 4: CertTrustStore

**Files:**
- Create: `apps/main/src/cert-trust-store.ts`

**Interfaces:**
- Consumes: `SettingsManager.get('trustedCerts')`, `SettingsManager.set('trustedCerts', ...)`
- Produces: `CertTrustStore.isTrusted(host, errorText)`, `.add(host, errorText, scope)`, `.consumeOnce(host, errorText)`

- [ ] **Step 1: Create cert-trust-store.ts**

```typescript
import type { CertTrustScope } from '@browser/ipc-contract'
import type { SettingsManager } from './settings-manager'

/**
 * 三层证书信任存储：once（一次性标记）、session（内存 Set，重启清除）、always（持久化到 settings）。
 * key = host + '|' + errorText 复合键，不是只用 host —— 防止信任某错误类型后连带放行该 host 的全新不同错误。
 */
export class CertTrustStore {
  /** 一次性信任：证书错误放行后立即消费 */
  private once = new Set<string>()
  /** 本次运行期间信任：进程存活期间同 host+errorText 直接放行 */
  private session = new Set<string>()
  /** always 层内存缓存，启动时从 settings-manager 载入 */
  private alwaysCache = new Set<string>()

  constructor(private settingsManager: SettingsManager | null) {
    this.loadAlways()
  }

  private key(host: string, errorText: string): string {
    return `${host}|${errorText}`
  }

  /** 按 once → session → always 顺序查询 */
  isTrusted(host: string, errorText: string): boolean {
    const k = this.key(host, errorText)
    return this.once.has(k) || this.session.has(k) || this.alwaysCache.has(k)
  }

  add(host: string, errorText: string, scope: CertTrustScope): void {
    const k = this.key(host, errorText)
    if (scope === 'once') {
      this.once.add(k)
    } else if (scope === 'session') {
      this.session.add(k)
    } else {
      this.alwaysCache.add(k)
      this.persistAlways()
    }
  }

  /** once 命中后移除（certificate-error 放行后调用） */
  consumeOnce(host: string, errorText: string): void {
    this.once.delete(this.key(host, errorText))
  }

  private loadAlways(): void {
    if (!this.settingsManager) return
    const list = this.settingsManager.get('trustedCerts')
    for (const item of list) {
      this.alwaysCache.add(this.key(item.host, item.errorText))
    }
  }

  private persistAlways(): void {
    if (!this.settingsManager) return
    const list: { host: string; errorText: string }[] = []
    for (const k of this.alwaysCache) {
      const sep = k.indexOf('|')
      list.push({ host: k.slice(0, sep), errorText: k.slice(sep + 1) })
    }
    this.settingsManager.set('trustedCerts', list)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @browser/main typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/main/src/cert-trust-store.ts
git commit -m "feat(main): add CertTrustStore for 3-layer SSL certificate trust"
```

---

## Task 5: TabManager — Navigation State + Event Wiring

**Files:**
- Modify: `apps/main/src/tab-manager.ts` — multiple locations

**Interfaces:**
- Consumes: `NavigationState`, `SecurityState` from ipc-contract
- Produces: updated `Tab.state` shape, `getCertPending(tabId)`, `certTrustStore` integration

This is the largest task. Sub-steps update create(), setNavigating(), event listeners, session save/restore, and add wcId map.

### 5a: Add imports + class fields

- [ ] **Step 1: Update imports (line 1-27)**

Add `NavigationState`, `SecurityState` to the import from `@browser/ipc-contract`. Add import for `CertTrustStore`:

```typescript
import type { CertTrustStore } from './cert-trust-store'
```

- [ ] **Step 2: Add new fields to TabManager class (after line 40)**

```typescript
  /** webContents id → tabId 反查（O(1)，替代 getTabIdByWebContents 线性扫描） */
  private wcToTab = new Map<number, string>()
  /** 等待展示的证书错误信息（cert-warning 页面 onMounted 时拉取） */
  private certPending = new Map<string, { host: string; errorText: string; requestedUrl: string }>()
```

- [ ] **Step 3: Add certTrustStore to constructor (line 42-49)**

Add `certTrustStore: CertTrustStore` parameter:

```typescript
  constructor(
    private window: BrowserWindow,
    private getSession: (name: string) => Session,
    private defaultSessionName: string = 'default',
    private historyManager: HistoryManager,
    private settingsManager: SettingsManager | null = null,
    private popoverManager: PopoverManager,
    private certTrustStore: CertTrustStore,
  ) {
```

- [ ] **Step 4: Add getCertPending public method (after line 269)**

```typescript
  getCertPending(tabId: string) {
    return this.certPending.get(tabId) ?? null
  }

  private deriveSecurity(url: string, host: string | null): SecurityState {
    if (isWmfxUrl(url)) return 'internal'
    if (host && this.certTrustStore.isTrusted(host, '')) return 'insecure'
    if (url.startsWith('https://')) return 'secure'
    return 'insecure'
  }
```

> Note: `deriveSecurity` is a simplified helper. The full version uses the cert trust check against the actual error type. In practice, securityState for https URLs without known cert issues is 'secure'. The cert trust check with empty errorText won't match any real trust entries (they always have errorText), so the `insecure` branch for "https + trusted host" only triggers when we explicitly set it in the certificate-error handler. For did-navigate success, the check is: `deriveSecurity(committedUrl, null)` — passing null for host means no cert trust match, so https → 'secure'.

Actually, let me refine this. The `deriveSecurity` in did-navigate should be:

```typescript
  /** 每次 did-navigate 成功时按当前 URL 无条件重算，不继承上一页 */
  private deriveSecurity(url: string): SecurityState {
    if (isWmfxUrl(url)) return 'internal'
    if (url.startsWith('https://')) return 'secure'
    return 'insecure'
  }
```

The `insecure` override for "https + user-confirmed cert trust" is handled explicitly in the certificate-error success path, not in deriveSecurity. This keeps the logic simple.

- [ ] **Step 5: Commit intermediate**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(tab-manager): add navigation fields, wcToTab map, certPending store"
```

### 5b: Update create() to use navigation sub-object

- [ ] **Step 6: Replace tab.state initialization in create() (lines 69-88)**

Replace:
```typescript
      state: {
        id: tabId,
        windowId: this.windowId,
        sessionId,
        url: resolvedUrl,
        title:
          opts?.title ??
          (wantInternal
            ? internalTitleFromPath(wmfxPath(resolvedUrl), this.settingsManager?.get('currentLang'))
            : ''),
        favicon: null,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        isMuted: false,
        isPinned: false,
        isSuspended: false,
      },
```

With:
```typescript
      state: {
        id: tabId,
        windowId: this.windowId,
        sessionId,
        navigation: {
          displayUrl: resolvedUrl,
          requestedUrl: resolvedUrl,
          committedUrl: '',
          internalUrl: '',
          isLoading: false,
          state: 'loading',
          error: null,
          securityState: isWmfxUrl(resolvedUrl) ? 'internal' : (resolvedUrl.startsWith('https://') ? 'secure' : 'insecure'),
        },
        title:
          opts?.title ??
          (wantInternal
            ? internalTitleFromPath(wmfxPath(resolvedUrl), this.settingsManager?.get('currentLang'))
            : ''),
        favicon: null,
        canGoBack: false,
        canGoForward: false,
        zoomFactor: 1,
        isMuted: false,
        isPinned: false,
        isSuspended: false,
      },
```

- [ ] **Step 7: Register wcId in setupTabListeners (at the start, after line 405 `const wc = tab.view.webContents`)**

```typescript
    this.wcToTab.set(wc.id, tab.id)
```

- [ ] **Step 8: Commit intermediate**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(tab-manager): migrate create() to NavigationState sub-object"
```

### 5c: Update setNavigating()

- [ ] **Step 9: Replace setNavigating (lines 271-279)**

Replace:
```typescript
  setNavigating(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.state.url = url
    tab.state.title = url
    tab.state.favicon = null
    tab.state.isLoading = true
    this.broadcastState(tab)
  }
```

With:
```typescript
  setNavigating(tabId: string, url: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.state.navigation.requestedUrl = url
    tab.state.navigation.displayUrl = url
    tab.state.navigation.state = 'loading'
    tab.state.navigation.error = null
    tab.state.navigation.isLoading = true
    tab.state.title = url
    tab.state.favicon = null
    this.broadcastState(tab)
  }
```

- [ ] **Step 10: Commit**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(tab-manager): update setNavigating to use NavigationState fields"
```

### 5d: Update event listeners

- [ ] **Step 11: Replace did-navigate handler (lines 412-439)**

Replace:
```typescript
    wc.on('did-navigate', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      tab.state.url = url
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      // 内部页跳转到外部站点：异步重建为普通标签，避免在处理旧 webContents 事件时销毁自身
      if (tab.isInternal && !isWmfxUrl(url)) {
        setTimeout(() => {
          try {
            this.relaunchView(tab.id, url)
          } catch {
            /* tab 已被关闭 */
          }
        }, 0)
        return
      }

      if (url && !url.startsWith('about:') && !url.startsWith('chrome:') && !isWmfxUrl(url)) {
        this.historyManager.add({
          url,
          title: tab.state.title || null,
          favicon: tab.state.favicon,
        })
      }
    })
```

With:
```typescript
    wc.on('did-navigate', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      const nav = tab.state.navigation

      // error / cert-warning 页 did-navigate 特判：只更新 internalUrl，不覆盖 displayUrl/committedUrl/state
      if (url === 'wmfx://error' || url === 'wmfx://cert-warning') {
        nav.internalUrl = actual
        tab.state.canGoBack = wc.navigationHistory.canGoBack()
        tab.state.canGoForward = wc.navigationHistory.canGoForward()
        this.broadcastState(tab)
        return
      }

      nav.committedUrl = url
      nav.displayUrl = url
      nav.internalUrl = actual
      nav.state = 'success'
      nav.error = null
      nav.securityState = this.deriveSecurity(url)
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)

      // 内部页跳转到外部站点：异步重建为普通标签
      if (tab.isInternal && !isWmfxUrl(url)) {
        setTimeout(() => {
          try {
            this.relaunchView(tab.id, url)
          } catch {
            /* tab 已被关闭 */
          }
        }, 0)
        return
      }

      // 外部页跳转到内部页（如 error/cert-warning）：重建为内部视图（带 preload）
      if (!tab.isInternal && isWmfxUrl(url)) {
        setTimeout(() => {
          try {
            this.relaunchView(tab.id, url)
          } catch {
            /* tab 已被关闭 */
          }
        }, 0)
        return
      }

      if (url && !url.startsWith('about:') && !url.startsWith('chrome:') && !isWmfxUrl(url)) {
        this.historyManager.add({
          url,
          title: tab.state.title || null,
          favicon: tab.state.favicon,
        })
      }
    })
```

- [ ] **Step 12: Replace did-navigate-in-page handler (lines 441-448)**

Replace:
```typescript
    wc.on('did-navigate-in-page', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      tab.state.url = url
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)
    })
```

With:
```typescript
    wc.on('did-navigate-in-page', () => {
      const actual = wc.getURL()
      const url = wmfxFromActualUrl(actual) ?? actual
      const nav = tab.state.navigation
      nav.internalUrl = actual
      nav.committedUrl = url
      nav.displayUrl = url
      nav.securityState = this.deriveSecurity(url)
      tab.state.canGoBack = wc.navigationHistory.canGoBack()
      tab.state.canGoForward = wc.navigationHistory.canGoForward()
      this.broadcastState(tab)
    })
```

- [ ] **Step 13: Replace did-start-loading handler (lines 466-469)**

Replace:
```typescript
    wc.on('did-start-loading', () => {
      tab.state.isLoading = true
      this.broadcastState(tab)
    })
```

With:
```typescript
    wc.on('did-start-loading', () => {
      tab.state.navigation.isLoading = true
      this.broadcastState(tab)
    })
```

- [ ] **Step 14: Replace did-stop-loading handler (lines 471-474)**

Replace:
```typescript
    wc.on('did-stop-loading', () => {
      tab.state.isLoading = false
      this.broadcastState(tab)
    })
```

With:
```typescript
    wc.on('did-stop-loading', () => {
      tab.state.navigation.isLoading = false
      this.broadcastState(tab)
    })
```

- [ ] **Step 15: Replace render-process-gone handler (lines 476-483)**

Replace:
```typescript
    wc.on('render-process-gone', () => {
      const url = tab.state.url || NEW_TAB_URL
      if (tab.isInternal) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    })
```

With:
```typescript
    wc.on('render-process-gone', () => {
      tab.state.navigation.state = 'crashed'
      this.broadcastState(tab)
      const url = tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl || NEW_TAB_URL
      if (isWmfxUrl(url)) {
        loadInternalView(tab.view, wmfxPath(url))
      } else {
        tab.view.webContents.loadURL(url)
      }
    })
```

- [ ] **Step 16: Add did-fail-load and certificate-error handlers (after did-stop-loading, before render-process-gone)**

Insert before `render-process-gone`:

```typescript
    // --- 错误页：did-fail-load 拦截 ---
    wc.on('did-fail-load', (_event, errorCode, errorDescription, errorURL, isMainFrame) => {
      if (!isMainFrame) return
      // -3 = ERR_ABORTED：用户取消/重定向中断，不显示错误页
      if (errorCode === -3) return
      // 证书错误由 certificate-error 处理，跳过避免双重处理
      if (this.certPending.has(tab.id)) return

      const nav = tab.state.navigation
      nav.error = { code: errorCode, description: errorDescription }
      nav.state = 'error'
      nav.securityState = 'insecure'
      nav.displayUrl = nav.requestedUrl
      this.broadcastState(tab)

      // 存储错误信息供 ErrorView 拉取；relaunchView 会销毁旧 webContents，必须在此之前存储
      this.certPending.set(tab.id, { host: '', errorText: '', requestedUrl: nav.requestedUrl })
      // relaunchView 加载 wmfx://error，内部会重建视图（带 preload）并 loadInternalView
      try {
        this.relaunchView(tab.id, 'wmfx://error')
      } catch {
        /* tab 已被关闭 */
      }
    })

    // --- SSL 证书警告：certificate-error 拦截 ---
    wc.on('certificate-error', (event, url, errorText, cert, callback) => {
      let host: string
      try {
        host = new URL(url).host
      } catch {
        callback(false)
        return
      }

      if (this.certTrustStore.isTrusted(host, errorText)) {
        event.preventDefault()
        callback(true)
        this.certTrustStore.consumeOnce(host, errorText)
        return
      }

      // 未信任 → 阻止加载，导航到证书警告页
      event.preventDefault()
      callback(false)

      const nav = tab.state.navigation
      nav.error = { code: -2000, description: errorText }
      nav.state = 'error'
      nav.securityState = 'insecure'
      nav.displayUrl = nav.requestedUrl
      this.broadcastState(tab)

      // 存储证书错误信息供 CertWarningView 拉取
      this.certPending.set(tab.id, { host, errorText, requestedUrl: nav.requestedUrl })
      try {
        this.relaunchView(tab.id, 'wmfx://cert-warning')
      } catch {
        /* tab 已被关闭 */
      }
    })
```

- [ ] **Step 17: Commit**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(tab-manager): wire did-navigate/did-fail-load/certificate-error to NavigationState"
```

### 5e: Update session save/restore + cleanup

- [ ] **Step 18: Update serializeTabs (line 306-312)**

Replace:
```typescript
  serializeTabs(): { url: string; title: string }[] {
    const tabs: { url: string; title: string }[] = []
    for (const tab of this.tabs.values()) {
      tabs.push({ url: tab.state.url, title: tab.state.title })
    }
    return tabs
  }
```

With:
```typescript
  serializeTabs(): { url: string; title: string }[] {
    const tabs: { url: string; title: string }[] = []
    for (const tab of this.tabs.values()) {
      tabs.push({ url: tab.state.navigation.committedUrl || tab.state.navigation.requestedUrl, title: tab.state.title })
    }
    return tabs
  }
```

- [ ] **Step 19: Clean up wcToTab in close() (line 144-176)**

Add at the beginning of close(), after getting the tab:
```typescript
    this.wcToTab.delete(tab.view.webContents.id)
    this.certPending.delete(tabId)
```

- [ ] **Step 20: Clean up wcToTab in relaunchView (around line 130)**

Before destroying old view in relaunchView, add:
```typescript
    this.wcToTab.delete(tab.view.webContents.id)
```

After spawnView in relaunchView, the new wcId is registered by setupTabListeners (step 7).

- [ ] **Step 21: Typecheck**

Run: `bun run --filter @browser/main typecheck`
Expected: PASS

- [ ] **Step 22: Commit**

```bash
git add apps/main/src/tab-manager.ts
git commit -m "feat(tab-manager): update session save/restore and wcToTab cleanup"
```

---

## Task 6: IPC Register Handlers

**Files:**
- Modify: `apps/main/src/ipc/register.ts` — add 4 handlers after existing page:* handlers (~line 504)

**Interfaces:**
- Consumes: `tabManager.getTabIdByWebContents(event.sender)`, `tabManager.getTabByWcId` (use existing `getTabIdByWebContents`), `tabManager.getCertPending(tabId)`, `certTrustStore.add(...)`, `navigationManager.loadURL(...)`
- Produces: `getErrorInfo`, `retry`, `getCertWarningInfo`, `trustCertAndContinue` handlers

- [ ] **Step 1: Add 4 handlers (after page:findPrevious, ~line 504)**

```typescript
  // --- Error Page ---
  handle('page:getErrorInfo', (event) => {
    const inst = getInstance(event); if (!inst) return null
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    const tab = inst.tabManager.getWebContents(tabId)
    if (!tab) return null
    // 通过 getWebContents 找到 tab 后，需要读取 navigation state
    // 使用 tabManager 的 internal 方法 —— 通过 tabId 取 state
    const pending = inst.tabManager.getCertPending(tabId)
    if (!pending) return null
    return { code: -1, description: 'Page failed to load', requestedUrl: pending.requestedUrl }
  })
```

Wait — `getErrorInfo` needs to read `navigation.error` from the tab state. But `tabManager` doesn't expose a `getTabState(tabId)` method. Let me check what's available...

Actually, looking at the existing code, `getWebContents(tabId)` returns the WebContents. We need to read `tab.state.navigation.error`. But `tab` is the private `Tab` interface inside TabManager. The register handlers can't access it directly.

We need to add a public method to TabManager. Let me add `getNavigationState(tabId)` or `getTabState(tabId)`.

- [ ] **Step 1 (revised): Add getNavigationState to TabManager (in tab-manager.ts, after getCertPending)**

```typescript
  getNavigationState(tabId: string): NavigationState | null {
    const tab = this.tabs.get(tabId)
    return tab?.state.navigation ?? null
  }
```

- [ ] **Step 2: Add 4 handlers to register.ts (after page:findPrevious, ~line 504)**

```typescript
  // --- Error Page ---
  handle('page:getErrorInfo', (event) => {
    const inst = getInstance(event); if (!inst) return null
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    const nav = inst.tabManager.getNavigationState(tabId)
    if (!nav?.error) return null
    return { code: nav.error.code, description: nav.error.description, requestedUrl: nav.requestedUrl }
  })

  handle('page:retry', (event) => {
    const inst = getInstance(event); if (!inst) return
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const nav = inst.tabManager.getNavigationState(tabId)
    if (!nav) return
    inst.navigationManager.loadURL(tabId, nav.requestedUrl)
  })

  // --- Cert Warning ---
  handle('page:getCertWarningInfo', (event) => {
    const inst = getInstance(event); if (!inst) return null
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return null
    return inst.tabManager.getCertPending(tabId)
  })

  handle('page:trustCertAndContinue', (event, scope) => {
    const inst = getInstance(event); if (!inst) return
    const tabId = inst.tabManager.getTabIdByWebContents(event.sender)
    if (!tabId) return
    const pending = inst.tabManager.getCertPending(tabId)
    if (!pending) return
    inst.certTrustStore.add(pending.host, pending.errorText, scope)
    inst.navigationManager.loadURL(tabId, pending.requestedUrl)
  })
```

- [ ] **Step 3: Verify BrowserWindowInstance has certTrustStore**

Check `apps/main/src/index.ts` — the `BrowserWindowInstance` interface must include `certTrustStore`. Read the file to find the interface.

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @browser/main typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/ipc/register.ts apps/main/src/tab-manager.ts
git commit -m "feat(ipc): add getErrorInfo/retry/getCertWarningInfo/trustCertAndContinue handlers"
```

---

## Task 7: Preload + env.d.ts

**Files:**
- Modify: `apps/main/src/preload.ts` — type block (~line 110+) and impl block (~line 269+)
- Modify: `apps/renderer/src/env.d.ts` — Window.browserAPI declaration (~line 72+)

**Interfaces:**
- Consumes: IPC channels from Task 1
- Produces: `window.browserAPI.getErrorInfo()`, `.retry()`, `.getCertWarningInfo()`, `.trustCertAndContinue(scope)`

- [ ] **Step 1: Add type declarations to preload api type (after line 166)**

```typescript
  // Error / Cert Warning
  getErrorInfo: () => Promise<{ code: number; description: string; requestedUrl: string } | null>
  retry: () => Promise<void>
  getCertWarningInfo: () => Promise<{ host: string; errorText: string; requestedUrl: string } | null>
  trustCertAndContinue: (scope: CertTrustScope) => Promise<void>
```

Add `CertTrustScope` to the import from `@browser/ipc-contract` at the top of preload.ts.

- [ ] **Step 2: Add implementations to preload api object (after line 272)**

```typescript
  getErrorInfo: () => ipcRenderer.invoke('page:getErrorInfo'),
  retry: () => ipcRenderer.invoke('page:retry'),
  getCertWarningInfo: () => ipcRenderer.invoke('page:getCertWarningInfo'),
  trustCertAndContinue: (scope) => ipcRenderer.invoke('page:trustCertAndContinue', scope),
```

- [ ] **Step 3: Add declarations to env.d.ts (after line 81)**

```typescript
      // Error / Cert Warning
      getErrorInfo: () => Promise<{ code: number; description: string; requestedUrl: string } | null>
      retry: () => Promise<void>
      getCertWarningInfo: () => Promise<{ host: string; errorText: string; requestedUrl: string } | null>
      trustCertAndContinue: (scope: 'once' | 'session' | 'always') => Promise<void>
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @browser/main typecheck && bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/main/src/preload.ts apps/renderer/src/env.d.ts
git commit -m "feat(preload/env): add error/cert-warning browserAPI methods"
```

---

## Task 8: Router + ErrorView + CertWarningView

**Files:**
- Modify: `apps/renderer/src/router.ts` — add routes
- Create: `apps/renderer/src/views/ErrorView.vue`
- Create: `apps/renderer/src/views/CertWarningView.vue`

**Interfaces:**
- Consumes: `window.browserAPI.getErrorInfo()`, `.retry()`, `.getCertWarningInfo()`, `.trustCertAndContinue(scope)`, `window.browserAPI.goBack()` (via `history.back()`)
- Produces: two routable internal pages

- [ ] **Step 1: Add routes to router.ts**

Add after existing routes (e.g. after '/proxy'):

```typescript
  { path: '/error', component: () => import('../views/ErrorView.vue') },
  { path: '/cert-warning', component: () => import('../views/CertWarningView.vue') },
```

Also add `'error'` and `'cert-warning'` to whatever route guard / nav guard exists (if any).

- [ ] **Step 2: Create ErrorView.vue**

```vue
<template>
  <div class="error-page">
    <div class="error-icon">⚠️</div>
    <h1>{{ title }}</h1>
    <p class="error-desc">{{ description }}</p>
    <p v-if="info" class="error-url">{{ info.requestedUrl }}</p>
    <p v-if="info" class="error-code">{{ info.code }} / {{ info.description }}</p>
    <div class="error-suggestions" v-if="info">
      <p>{{ suggestions }}</p>
    </div>
    <div class="error-actions">
      <button v-if="info" class="btn-primary" @click="retry">{{ t('error.retry') }}</button>
      <button v-else class="btn-primary" @click="goBack">{{ t('error.goBack') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const info = ref<{ code: number; description: string; requestedUrl: string } | null>(null)
const title = ref(t('error.title'))
const description = ref(t('error.description'))
const suggestions = ref(t('error.suggestions.default'))

onMounted(async () => {
  try {
    const result = await window.browserAPI.getErrorInfo()
    if (result) {
      info.value = result
      title.value = t('error.title')
      description.value = getFriendlyDescription(result.code)
      suggestions.value = getSuggestions(result.code)
    }
  } catch {
    // 兜底：info 为 null，显示通用错误页
  }
})

function getFriendlyDescription(code: number): string {
  const map: Record<number, string> = {
    -105: t('error.codes.-105'),
    -102: t('error.codes.-102'),
    -118: t('error.codes.-118'),
    -106: t('error.codes.-106'),
    -109: t('error.codes.-109'),
    -101: t('error.codes.-101'),
  }
  return map[code] ?? info.value?.description ?? t('error.description')
}

function getSuggestions(code: number): string {
  const dns = [-105, -109]
  const conn = [-102, -101, -118, -106]
  if (dns.includes(code)) return t('error.suggestions.dns')
  if (conn.includes(code)) return t('error.suggestions.connection')
  return t('error.suggestions.default')
}

function retry(): void {
  window.browserAPI.retry()
}

function goBack(): void {
  window.history.back()
}
</script>

<style scoped>
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.error-icon { font-size: 4rem; margin-bottom: 1rem; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.error-desc { color: #666; margin-bottom: 1rem; max-width: 500px; }
.error-url { color: #999; font-size: 0.875rem; word-break: break-all; margin-bottom: 0.5rem; }
.error-code { color: #aaa; font-size: 0.75rem; margin-bottom: 1rem; }
.error-suggestions { color: #888; font-size: 0.875rem; margin-bottom: 1.5rem; }
.error-actions { display: flex; gap: 0.75rem; }
.btn-primary {
  padding: 0.5rem 1.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-primary:hover { background: #f5f5f5; }
</style>
```

- [ ] **Step 3: Create CertWarningView.vue**

```vue
<template>
  <div class="cert-warning-page">
    <div class="cert-icon">🔒</div>
    <h1>{{ t('certWarning.title') }}</h1>
    <p class="cert-desc">{{ t('certWarning.description') }}</p>
    <p v-if="info" class="cert-url">{{ info.requestedUrl }}</p>
    <p v-if="info" class="cert-error">{{ info.errorText }}</p>

    <div v-if="showDetails && info" class="cert-details">
      <p><strong>{{ t('certWarning.host') }}:</strong> {{ info.host }}</p>
      <p><strong>{{ t('certWarning.error') }}:</strong> {{ info.errorText }}</p>
    </div>

    <div class="cert-actions">
      <button class="btn-primary" @click="goBack">{{ t('certWarning.goBack') }}</button>
      <button class="btn-secondary" @click="showDetails = !showDetails">
        {{ showDetails ? t('certWarning.hideDetails') : t('certWarning.showDetails') }}
      </button>
      <div class="continue-section">
        <button class="btn-danger" @click="showTrustOptions = !showTrustOptions">
          {{ t('certWarning.continueAnyway') }}
        </button>
        <div v-if="showTrustOptions" class="trust-options">
          <button @click="trustAndContinue('once')">{{ t('certWarning.trustOnce') }}</button>
          <button @click="trustAndContinue('session')">{{ t('certWarning.trustSession') }}</button>
          <button @click="trustAndContinue('always')">{{ t('certWarning.trustAlways') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CertTrustScope } from '@browser/ipc-contract'

const { t } = useI18n()
const info = ref<{ host: string; errorText: string; requestedUrl: string } | null>(null)
const showDetails = ref(false)
const showTrustOptions = ref(false)

onMounted(async () => {
  try {
    info.value = await window.browserAPI.getCertWarningInfo()
  } catch {
    // 兜底
  }
})

function goBack(): void {
  window.history.back()
}

async function trustAndContinue(scope: CertTrustScope): Promise<void> {
  await window.browserAPI.trustCertAndContinue(scope)
}
</script>

<style scoped>
.cert-warning-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.cert-icon { font-size: 4rem; margin-bottom: 1rem; }
h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
.cert-desc { color: #666; margin-bottom: 1rem; max-width: 500px; }
.cert-url { color: #999; font-size: 0.875rem; word-break: break-all; margin-bottom: 0.5rem; }
.cert-error { color: #c00; font-size: 0.875rem; margin-bottom: 1rem; }
.cert-details { text-align: left; background: #f8f8f8; padding: 1rem; border-radius: 6px; margin-bottom: 1rem; max-width: 500px; width: 100%; }
.cert-details p { margin: 0.25rem 0; font-size: 0.875rem; }
.cert-actions { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
.btn-primary, .btn-secondary, .btn-danger {
  padding: 0.5rem 1.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-primary:hover { background: #f5f5f5; }
.btn-danger { border-color: #c00; color: #c00; }
.btn-danger:hover { background: #fff0f0; }
.trust-options { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
.trust-options button {
  padding: 0.35rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.75rem;
}
.trust-options button:hover { background: #f5f5f5; }
.continue-section { display: flex; flex-direction: column; align-items: center; }
</style>
```

- [ ] **Step 4: Typecheck**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 5: Lint Vue**

Run: `bun run lint:vue`
Expected: PASS (or only pre-existing WIP warnings)

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/router.ts apps/renderer/src/views/ErrorView.vue apps/renderer/src/views/CertWarningView.vue
git commit -m "feat(renderer): add ErrorView and CertWarningView with routes"
```

---

## Task 9: Address Bar Security Indicator

**Files:**
- Modify: `apps/renderer/src/components/AddressInput.vue` — add security icon

**Interfaces:**
- Consumes: `securityState` prop
- Produces: visual indicator (lock/warning/internal icon)

- [ ] **Step 1: Read AddressInput.vue to understand current structure**

- [ ] **Step 2: Add securityState prop and icon to AddressInput.vue**

Add a prop `securityState: 'secure' | 'insecure' | 'internal'` and render an icon at the start of the input:

```vue
<template>
  <div class="address-input-wrap">
    <span class="security-indicator" :class="securityState" :title="securityTitle">
      <Icon :icon="securityIcon" :width="14" :height="14" />
    </span>
    <input ... />
  </div>
</template>
```

Add computed:
```typescript
const securityIcon = computed(() => {
  if (props.securityState === 'secure') return 'mdi:lock'
  if (props.securityState === 'insecure') return 'mdi:alert'
  return 'mdi:application'
})

const securityTitle = computed(() => {
  if (props.securityState === 'secure') return t('security.secure')
  if (props.securityState === 'insecure') return t('security.insecure')
  return t('security.internal')
})
```

Style the icon to sit inside the input area on the left.

- [ ] **Step 3: Pass securityState from AddressBar.vue to AddressInput**

In AddressBar.vue, add `securityState` to props and pass it through:

```vue
<AddressInput
  ref="inputRef"
  v-model="urlInput"
  :placeholder="ADDRESS_BAR_PLACEHOLDER"
  :security-state="securityState"
  @focus="onFocus"
  @keydown.enter="onEnter"
/>
```

- [ ] **Step 4: Pass securityState from ChromeUI.vue to AddressBar**

In ChromeUI.vue, bind the security state:

```vue
:security-state="activeTab.navigation.securityState"
```

- [ ] **Step 5: Typecheck**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/components/AddressInput.vue apps/renderer/src/components/AddressBar.vue apps/renderer/src/components/ChromeUI.vue
git commit -m "feat(renderer): add security indicator icon to address bar"
```

---

## Task 10: Renderer Migration — url → navigation

**Files:**
- Modify: `apps/renderer/src/components/ChromeUI.vue:9,12`
- Modify: `apps/renderer/src/components/AddressBar.vue:42-48`
- Modify: `apps/renderer/src/components/TabBar.vue:59-60,133,316`
- Modify: `apps/renderer/src/components/DownloadIndicator.vue:132`
- Modify: `apps/renderer/src/components/AppMenuButton.vue:58`

**Interfaces:**
- Consumes: `TabState.navigation.displayUrl`, `TabState.navigation.isLoading`, `TabState.navigation.securityState`
- Produces: all renderer consumers read from `navigation.*`

- [ ] **Step 1: ChromeUI.vue — update bindings (lines 9, 12)**

Replace:
```vue
          :url="activeTab.url"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.isLoading"
```

With:
```vue
          :url="activeTab.navigation.displayUrl"
          :can-go-back="activeTab.canGoBack"
          :can-go-forward="activeTab.canGoForward"
          :is-loading="activeTab.navigation.isLoading"
          :security-state="activeTab.navigation.securityState"
```

- [ ] **Step 2: TabBar.vue — update tab.url references**

Replace all `tab.url` with `tab.navigation.displayUrl`:
- Line 59: `v-if="isInternalUrl(tab.url)"` → `v-if="isInternalUrl(tab.navigation.displayUrl)"`
- Line 60: `:icon="internalIcon(tab.url)"` → `:icon="internalIcon(tab.navigation.displayUrl)"`
- Line 133: `tab.isLoading && !isInternalUrl(tab.url)` → `tab.navigation.isLoading && !isInternalUrl(tab.navigation.displayUrl)`
- Line 316: `url: tab.url` → `url: tab.navigation.committedUrl || tab.navigation.requestedUrl`

- [ ] **Step 3: AddressBar.vue — update props (lines 42-48)**

Replace:
```typescript
const props = defineProps<{
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}>()
```

With:
```typescript
const props = defineProps<{
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
  securityState: 'secure' | 'insecure' | 'internal'
}>()
```

The `url` prop is now bound to `activeTab.navigation.displayUrl` from ChromeUI, so the prop name stays `url` but the value comes from navigation.displayUrl. No rename needed inside AddressBar.

- [ ] **Step 4: DownloadIndicator.vue — update tab.url (line 132)**

Replace:
```typescript
  const existing = list.find((tab) => tab.url === 'wmfx://downloads' || tab.url.startsWith('wmfx://downloads/'))
```

With:
```typescript
  const existing = list.find((tab) => tab.navigation.displayUrl === 'wmfx://downloads' || tab.navigation.displayUrl.startsWith('wmfx://downloads/'))
```

- [ ] **Step 5: AppMenuButton.vue — update t.url (line 58)**

Replace:
```typescript
  const existing = list.find((t) => t.url === id || t.url.startsWith(`${id}/`))
```

With:
```typescript
  const existing = list.find((t) => t.navigation.displayUrl === id || t.navigation.displayUrl.startsWith(`${id}/`))
```

- [ ] **Step 6: Typecheck all renderer packages**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 7: Lint**

Run: `bun run lint:vue`
Expected: PASS (or only pre-existing WIP warnings)

- [ ] **Step 8: Commit**

```bash
git add apps/renderer/src/components/
git commit -m "feat(renderer): migrate all tab.url/isLoading to navigation.displayUrl/isLoading"
```

---

## Task 11: NavigationManager Adaptation

**Files:**
- Modify: `apps/main/src/navigation-manager.ts:38` — setNavigating call

**Interfaces:**
- Consumes: `tabManager.setNavigating(tabId, url)` (already updated in Task 5c)
- Produces: correct behavior for error/cert-warning retry loads

- [ ] **Step 1: Verify NavigationManager.loadURL still works**

The `loadURL` method calls `this.tabManager.setNavigating(tabId, url)` which now sets `navigation.requestedUrl` etc. The `isWmfxUrl(url)` branch calls `relaunchView` which handles internal/external transitions. No changes needed to navigation-manager.ts itself.

- [ ] **Step 2: Typecheck**

Run: `bun run --filter @browser/main typecheck`
Expected: PASS

- [ ] **Step 3: Commit (if any changes needed, otherwise skip)**

---

## Task 12: i18n Strings

**Files:**
- Find and modify i18n locale files (search for existing i18n setup)

**Interfaces:**
- Consumes: none
- Produces: `error.*`, `certWarning.*`, `security.*` translation keys

- [ ] **Step 1: Find i18n locale files**

Run: `grep -r "createI18n\|i18n\|messages" apps/renderer/src/ --include="*.ts" -l`

- [ ] **Step 2: Add error.* strings**

```typescript
error: {
  title: '无法显示此页面',          // en: 'This page can\'t be displayed'
  description: '加载此页面时出现问题', // en: 'Something went wrong while loading this page'
  retry: '重试',                    // en: 'Retry'
  goBack: '返回上一页',             // en: 'Go back'
  codes: {
    '-105': '找不到该网站的服务器 IP 地址',   // en: 'DNS lookup failed'
    '-102': '连接被拒绝',                     // en: 'Connection refused'
    '-118': '连接超时',                       // en: 'Connection timed out'
    '-106': '网络已断开',                     // en: 'Internet disconnected'
    '-109': '无法访问该地址',                 // en: 'Address unreachable'
    '-101': '连接被重置',                     // en: 'Connection reset'
  },
  suggestions: {
    default: '你可以检查网址是否正确，或稍后重试。',
    dns: '请检查网址拼写是否正确，或确认 DNS 设置。',
    connection: '请检查网络连接是否正常。',
  },
},
certWarning: {
  title: '您的连接不是私密连接',
  description: '攻击者可能正在窃取您的信息（例如密码、消息或信用卡）。',
  host: '主机',
  error: '错误',
  goBack: '返回安全页面',
  showDetails: '显示详情',
  hideDetails: '隐藏详情',
  continueAnyway: '仍要继续访问',
  trustOnce: '仅本次',
  trustSession: '本次运行期间',
  trustAlways: '永久允许',
},
security: {
  secure: '安全连接',
  insecure: '不安全',
  internal: '浏览器页面',
},
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @browser/renderer typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/locales/  # or wherever i18n files are
git commit -m "feat(i18n): add error, certWarning, security translation keys"
```

---

## Task 13: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `bun run lint:typecheck`
Expected: PASS

- [ ] **Step 2: Full lint**

Run: `bun run lint`
Expected: PASS (or only pre-existing WIP warnings in AddressBar/AddressInput/AddressBarSuggestions)

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Unit tests**

Run: `bun run test`
Expected: PASS

- [ ] **Step 5: E2E smoke test (manual)**

Launch with `bun run dev`:
1. Navigate to `http://nonexistent.invalid` → error page shows, address bar shows original URL
2. Click retry → re-attempts load, error page reappears
3. Navigate to `https://self-signed.badssl.com` → cert warning shows
4. Click "仍要继续访问" → "仅本次" → page loads, address bar shows ⚠️
5. Navigate away and back to same URL → cert warning reappears (once scope consumed)
6. Navigate to `https://httpbin.org` → address bar shows 🔒
7. Navigate to `http://example.com` → address bar shows ⚠️
8. Navigate to `wmfx://newtab` → address bar shows internal icon

- [ ] **Step 6: Final commit (if any fixups)**

```bash
git add -A
git commit -m "fix: address review feedback for navigation state + error pages"
```
