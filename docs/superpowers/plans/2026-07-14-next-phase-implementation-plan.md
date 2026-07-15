# Next Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix address bar clearing bug, add CI/CD workflows, extend tests, and lay i18n foundation

**Architecture:** 4 phases — (1) Bug fix + unit tests, (2) CI/CD + E2E, (3) i18n framework, (4) Release workflow. Phases 1–3 are independent and can be parallelized.

**Tech Stack:** Vue 3, TypeScript, Electron, bun, Vitest, Playwright, GitHub Actions, electron-updater

## Global Constraints

- All changes must pass `bun run lint` (biome TS + eslint Vue + typecheck)
- No new third-party dependencies (use existing tooling)
- Electron main process outputs CJS (`apps/main/dist/index.cjs`)
- Chinese (zh-CN) is default language, English (en-US) as fallback
- `.github/workflows/` is currently empty
- `electron-builder` already configured with `publish: github` (draft releases)
- macOS minimum system version to target: 13.0
- x64 macOS builds use `macos-14` runner (ARM64 `macos-latest`)

---

### Task 1: Fix AddressBar clearing bug

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue:110-120`

**Interfaces:**
- Consumes: nothing (local fix)
- Produces: `urlInput` correctly shows `''` for `wmfx://newtab`, shows full URL for other internal pages

- [ ] **Step 1: Modify the watch**

Replace the current watch block (lines 110–120):

```ts
watch(
  () => props.url,
  (newUrl) => {
    // 仅新标签页地址栏清空，其它内部页（settings/proxy 等）仍显示 URL
    if (newUrl.startsWith('wmfx://newtab')) {
      urlInput.value = ''
      return
    }
    if (newUrl !== urlInput.value) {
      urlInput.value = newUrl
    }
  },
)
```

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "fix: address bar clears for wmfx://newtab only, shows URL for other internal pages"
```

---

### Task 2: Update E2E assertions for address bar clearing

**Files:**
- Modify: `e2e/app.spec.ts:75` and `e2e/app.spec.ts:167`
- Modify: `e2e/popover.spec.ts:85`

**Interfaces:**
- Consumes: Task 1 (bug fix)

- [ ] **Step 1: Fix beforeEach assertion in app.spec.ts**

Replace line 75:
```ts
await expect(page.locator('.url-input')).toHaveValue('wmfx://newtab', {
```
with:
```ts
await expect(page.locator('.url-input')).toHaveValue('', {
```

- [ ] **Step 2: Fix test assertion at line 167**

Replace:
```ts
test('default new tab shows wmfx://newtab address', async () => {
  await expect(page.locator('.url-input')).toHaveValue('wmfx://newtab')
})
```
with:
```ts
test('default new tab shows empty address bar', async () => {
  await expect(page.locator('.url-input')).toHaveValue('')
})
```

- [ ] **Step 3: Fix beforeEach assertion in popover.spec.ts**

Replace line 85:
```ts
await expect(page.locator('.url-input')).toHaveValue('wmfx://newtab', {
```
with:
```ts
await expect(page.locator('.url-input')).toHaveValue('', {
```

- [ ] **Step 4: Verify other assertions still valid**

The following assertions in `app.spec.ts` are unaffected and should remain unchanged:
- Line 126: `.url-input` has value `'wmfx://downloads'`
- Line 200: `.url-input` has value `'wmfx://proxy'`
- Line 207: `.url-input` has value `'wmfx://settings/appearance'`

- [ ] **Step 5: Commit**

```bash
git add e2e/app.spec.ts e2e/popover.spec.ts
git commit -m "test(e2e): update assertions for empty address bar on new tab"
```

---

### Task 3: Add Vitest unit test for navigation.ts pure functions

**Files:**
- Create: `apps/renderer/src/panel/navigation.test.ts`

**Interfaces:**
- Consumes: `navigation.ts` exports (`getLevelItems`, `getSelectable`, `selectableIndexOf`, `pathToItem`, `findItem`)
- Produces: unit tests covering all 5 functions

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest'
import {
  getLevelItems,
  getSelectable,
  selectableIndexOf,
  pathToItem,
  findItem,
} from './navigation'
import type { MenuItem } from '@browser/ipc-contract'

const sampleMenu: MenuItem[] = [
  { id: 'reload', label: '重新加载' },
  { id: 'sep-1', type: 'separator' },
  { id: 'edit', label: '编辑', children: [
    { id: 'edit-copy', label: '复制' },
    { id: 'edit-paste', label: '粘贴' },
  ]},
  { id: 'disabled', label: '禁用项', disabled: true },
]

describe('getLevelItems', () => {
  it('returns top-level items for empty path', () => {
    const result = getLevelItems(sampleMenu, [])
    expect(result.map((i) => i.id)).toEqual(['reload', 'edit', 'disabled'])
  })

  it('drills into submenu by path', () => {
    const result = getLevelItems(sampleMenu, ['edit'])
    expect(result.map((i) => i.id)).toEqual(['edit-copy', 'edit-paste'])
  })

  it('skips separators at every level', () => {
    const result = getLevelItems(sampleMenu, [])
    expect(result.some((i) => i.type === 'separator')).toBe(false)
  })

  it('stops drilling when id not found', () => {
    const result = getLevelItems(sampleMenu, ['nonexistent'])
    expect(result).toEqual(sampleMenu)
  })
})

describe('getSelectable', () => {
  it('filters out separators and disabled items', () => {
    const result = getSelectable(sampleMenu)
    expect(result.map((i) => i.id)).toEqual(['reload', 'edit'])
  })

  it('returns all items if none are disabled or separator', () => {
    const items = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }]
    const result = getSelectable(items)
    expect(result.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('selectableIndexOf', () => {
  it('returns index in selectable subset', () => {
    expect(selectableIndexOf(sampleMenu, 'edit')).toBe(1)
  })

  it('returns -1 for separator', () => {
    expect(selectableIndexOf(sampleMenu, 'sep-1')).toBe(-1)
  })

  it('returns -1 for disabled item', () => {
    expect(selectableIndexOf(sampleMenu, 'disabled')).toBe(-1)
  })
})

describe('pathToItem', () => {
  it('returns ancestor chain for leaf item', () => {
    const result = pathToItem(sampleMenu, 'edit-copy')
    expect(result).toEqual(['edit'])
  })

  it('returns empty array for top-level item', () => {
    const result = pathToItem(sampleMenu, 'reload')
    expect(result).toEqual([])
  })

  it('returns null for nonexistent item', () => {
    const result = pathToItem(sampleMenu, 'nonexistent')
    expect(result).toBeNull()
  })
})

describe('findItem', () => {
  it('finds top-level item', () => {
    const result = findItem(sampleMenu, 'reload')
    expect(result?.id).toBe('reload')
  })

  it('finds nested item', () => {
    const result = findItem(sampleMenu, 'edit-copy')
    expect(result?.id).toBe('edit-copy')
  })

  it('returns null for nonexistent item', () => {
    const result = findItem(sampleMenu, 'nonexistent')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run vitest**

Run: `bun run test`
Expected: PASS all 13 tests

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/panel/navigation.test.ts
git commit -m "test(vitest): add unit tests for navigation pure functions"
```

---

### Task 4: Add Vitest unit test for useAddressBarFocus

**Files:**
- Create: `apps/renderer/src/composables/useAddressBarFocus.test.ts`

**Interfaces:**
- Consumes: `useAddressBarFocus`, `requestAddressBarFocus`
- Produces: tests for nonce increment

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAddressBarFocus, requestAddressBarFocus } from './useAddressBarFocus'

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
```

- [ ] **Step 2: Run vitest**

Run: `bun run test`
Expected: PASS all 3 tests

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/composables/useAddressBarFocus.test.ts
git commit -m "test(vitest): add unit tests for useAddressBarFocus"
```

---

### Task 5: Add Vitest unit test for usePageTitle

**Files:**
- Create: `apps/renderer/src/composables/usePageTitle.test.ts`

**Interfaces:**
- Consumes: `usePageTitle`
- Produces: tests for static initial, watchable ref, watchable computed

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { usePageTitle } from './usePageTitle'

// Capture document.title changes for verification
let capturedTitle = ''
beforeEach(() => {
  capturedTitle = ''
  // Mock document.title setter
  const mockDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'title')!
  Object.defineProperty(Document.prototype, 'title', {
    configurable: true,
    set(v: string) {
      capturedTitle = v
    },
  })
})

afterEach(() => {
  // Restore original descriptor
  Object.defineProperty(Document.prototype, 'title', mockDescriptor)
})

describe('usePageTitle', () => {
  it('sets title from static string initial', () => {
    const [title, setTitle] = usePageTitle('Settings')
    expect(capturedTitle).toBe('Settings')
    expect(title.value).toBe('Settings')
  })

  it('updates title via setTitle', () => {
    const [, setTitle] = usePageTitle('Init')
    expect(capturedTitle).toBe('Init')
    setTitle('New Title')
    expect(capturedTitle).toBe('New Title')
  })

  it('syncs from watchable ref', () => {
    const sourceRef = ref('Source Value')
    const [title] = usePageTitle(sourceRef)
    expect(capturedTitle).toBe('Source Value')
    expect(title.value).toBe('Source Value')

    sourceRef.value = 'Updated'
    expect(capturedTitle).toBe('Updated')
    expect(title.value).toBe('Updated')
  })

  it('syncs from watchable computed', () => {
    const prefix = ref('Hello')
    const source = computed(() => `${prefix.value} World`)
    const [title] = usePageTitle(source)
    expect(capturedTitle).toBe('Hello World')
    expect(title.value).toBe('Hello World')

    prefix.value = 'Goodbye'
    expect(capturedTitle).toBe('Goodbye World')
    expect(title.value).toBe('Goodbye World')
  })

  it('handles null/undefined initial', () => {
    const [title] = usePageTitle(undefined)
    expect(capturedTitle).toBe('')
    expect(title.value).toBe('')
  })

  it('title is read-only computed', () => {
    const [title] = usePageTitle('Test')
    expect(typeof title.value).toBe('string')
  })
})
```

- [ ] **Step 2: Run vitest**

Run: `bun run test`
Expected: PASS all 6 tests

- [ ] **Step 3: Commit**

```bash
git add apps/renderer/src/composables/usePageTitle.test.ts
git commit -m "test(vitest): add unit tests for usePageTitle"
```

---

### Task 6: Create GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `bun run lint`, `bun run test`
- Produces: CI workflow for lint + typecheck + vitest

- [ ] **Step 1: Create ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Cache bun install
        uses: actions/cache@v4
        with:
          path: |
            node_modules
            ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
          restore-keys: |
            ${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install

      - name: Lint
        run: bun run lint

      - name: Unit tests
        run: bun run test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for lint and unit tests"
```

---

### Task 7: Create GitHub Actions E2E workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

**Interfaces:**
- Consumes: `bun run build`, `bun run test:e2e`
- Produces: E2E workflow with Playwright cache

- [ ] **Step 1: Create e2e.yml**

```yaml
name: E2E

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Cache bun install
        uses: actions/cache@v4
        with:
          path: |
            node_modules
            ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
          restore-keys: |
            ${{ runner.os }}-bun-

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ hashFiles('**/playwright.config.ts') }}
          restore-keys: |
            ${{ runner.os }}-playwright-

      - name: Install dependencies
        run: bun install

      - name: Install Playwright
        run: bun x playwright install --with-deps

      - name: Build
        run: bun run build

      - name: E2E tests
        run: bun run test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: add E2E workflow with Playwright cache"
```

---

### Task 8: Add E2E tests for address bar behavior

**Files:**
- Modify: `e2e/app.spec.ts` (add 3 new tests at end)

**Interfaces:**
- Consumes: Task 1 (bug fix)

- [ ] **Step 1: Add new E2E tests at the end of app.spec.ts**

Append before the last `}`:

```ts
test('address bar clears when navigating to new tab from external page', async () => {
  // Navigate to a settings page (non-newtab internal URL)
  await page.locator('.url-input').fill('wmfx://settings')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://settings/appearance')

  // Navigate to newtab — address bar should be empty
  await page.locator('.url-input').fill('wmfx://newtab')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('')
})

test('address bar updates when navigating to a non-newtab internal page', async () => {
  await page.locator('.url-input').fill('wmfx://proxy')
  await page.keyboard.press('Enter')
  await expect(page.locator('.url-input')).toHaveValue('wmfx://proxy')
})

test('new tab button triggers address bar focus', async () => {
  await page.locator('.tab-new').click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  // After creating new tab, address bar should be empty (new tab)
  await expect(page.locator('.url-input')).toHaveValue('')
})
```

- [ ] **Step 2: Commit**

```bash
git add e2e/app.spec.ts
git commit -m "test(e2e): add address bar clearing and focus tests"
```

---

### Task 9: Create GitHub Actions build workflow (tag trigger)

**Files:**
- Create: `.github/workflows/build.yml`

**Interfaces:**
- Consumes: `bun run build`, `bun run package`
- Produces: 3-platform build matrix, uploads artifacts

- [ ] **Step 1: Create build.yml**

```yaml
name: Build

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            target: linux
            arch: x64
            build-cmd: bun run package:linux
            artifact: wmfx-linux

          - os: macos-14
            target: mac
            arch: x64
            build-cmd: bun run package:mac
            artifact: wmfx-mac-x64

          - os: macos-latest
            target: mac
            arch: arm64
            build-cmd: bun run package:mac
            artifact: wmfx-mac-arm64

          - os: windows-latest
            target: win
            arch: x64
            build-cmd: bun run package:win
            artifact: wmfx-win

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Cache bun install
        uses: actions/cache@v4
        with:
          path: |
            node_modules
            ~/.bun/install/cache
          key: ${{ runner.os }}-bun-${{ hashFiles('bun.lock') }}
          restore-keys: |
            ${{ runner.os }}-bun-

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run build

      - name: Download mihomo binary
        run: bun run --filter @browser/main download:cores

      - name: Package
        run: ${{ matrix.build-cmd }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: dist-pack/
          retention-days: 30
```

- [ ] **Step 2: Verify `download:cores` script exists**

Check `package.json` for a `download:cores` script in `@browser/main`. If it doesn't exist, the workflow step needs to be replaced with a direct download from GitHub Releases or another source. **If missing, remove the step and add a comment noting mihomo binaries must be available at `mihomo/` before packaging.**

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: add 3-platform build workflow with matrix strategy"
```

---

### Task 10: Create GitHub Actions release workflow (publish to GitHub Releases)

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Task 9 (build workflow), `electron-builder` publish config
- Produces: Release workflow that publishes to GitHub Releases

- [ ] **Step 1: Create release.yml**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist-pack/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist-pack/**/*.dmg
            dist-pack/**/*.AppImage
            dist-pack/**/*.deb
            dist-pack/**/*.exe
            dist-pack/**/*.yml
          draft: true
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: Update build.yml to also publish artifacts**

In `build.yml`, change the `Package` step from `bun run package` to `bun run package --publish always` for the release path. Actually, for release we need a separate approach — use `electron-builder --publish always` which automatically uploads to GitHub Releases.

**Correction**: The `release.yml` above downloads artifacts from the build job and creates a release. A simpler approach is to use `electron-builder --publish always` directly in the build job's `Package` step, but only in release context. 

**Recommended final approach**: Make build.yml also do publish, remove release.yml as it's redundant. Update build.yml Package step:

```yaml
      - name: Package
        run: ${{ matrix.build-cmd }} --publish always
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

And add `permissions: contents: write` to build.yml job.

**Decision**: Use the combined approach — build.yml does both build and publish, remove separate release.yml.

- [ ] **Step 3: Finalize build.yml**

Update build.yml:
```yaml
    permissions:
      contents: write

      # ... steps unchanged ...

      - name: Package & publish
        run: ${{ matrix.build-cmd }} --publish always
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: add GitHub Release publish to build workflow"
```

---

### Task 11: Create i18n message types and shared layer

**Files:**
- Create: `packages/shared/src/i18n/messages.ts`
- Modify: `packages/shared/src/index.ts` (export i18n)

**Interfaces:**
- Produces: `Message` interface + `messages` constant with zh-CN and en-US
- Consumed by: Task 12 (renderer composable), Task 13 (main i18n)

- [ ] **Step 1: Create messages.ts**

```ts
export interface Message {
  tab: {
    newTab: string
    incognito: string
    close: string
    closeOthers: string
    pinned: string
    unpinned: string
    duplicate: string
    reload: string
    mute: string
    unmute: string
    closeLeft: string
    closeRight: string
  }
  appMenu: {
    incognito: string
    bookmarks: string
    history: string
    downloads: string
    proxy: string
    settings: string
  }
  search: {
    engines: {
      google: string
      baidu: string
      bing: string
    }
    placeholder: string
  }
  newTab: {
    title: string
    recentHistory: string
  }
  addressBar: {
    placeholder: string
    zoom: string
  }
  settings: {
    theme: string
    newTabUrl: string
  }
}

export const messages: Record<string, Message> = {
  'zh-CN': {
    tab: {
      newTab: '新建标签页',
      incognito: '新建隐身标签页',
      close: '关闭',
      closeOthers: '关闭其它标签页',
      pinned: '固定',
      unpinned: '取消固定',
      duplicate: '复制',
      reload: '重新加载',
      mute: '将这个网站静音',
      unmute: '取消静音',
      closeLeft: '关闭左侧标签页',
      closeRight: '在右侧新增标签页',
    },
    appMenu: {
      incognito: '新建隐身标签页',
      bookmarks: '书签',
      history: '历史',
      downloads: '下载',
      proxy: '代理',
      settings: '设置',
    },
    search: {
      engines: {
        google: 'Google',
        baidu: 'Baidu',
        bing: 'Bing',
      },
      placeholder: '搜索或输入网址',
    },
    newTab: {
      title: '新标签页',
      recentHistory: '最近访问',
    },
    addressBar: {
      placeholder: '输入网址',
      zoom: '100%',
    },
    settings: {
      theme: '主题',
      newTabUrl: '新标签页地址',
    },
  },
  'en-US': {
    tab: {
      newTab: 'New Tab',
      incognito: 'New Incognito Tab',
      close: 'Close',
      closeOthers: 'Close Other Tabs',
      pinned: 'Pin',
      unpinned: 'Unpin',
      duplicate: 'Duplicate',
      reload: 'Reload',
      mute: 'Mute Site',
      unmute: 'Unmute Site',
      closeLeft: 'Close Tabs to the Left',
      closeRight: 'Open New Tab to the Right',
    },
    appMenu: {
      incognito: 'New Incognito Tab',
      bookmarks: 'Bookmarks',
      history: 'History',
      downloads: 'Downloads',
      proxy: 'Proxy',
      settings: 'Settings',
    },
    search: {
      engines: {
        google: 'Google',
        baidu: 'Baidu',
        bing: 'Bing',
      },
      placeholder: 'Search or enter URL',
    },
    newTab: {
      title: 'New Tab',
      recentHistory: 'Recent History',
    },
    addressBar: {
      placeholder: 'Enter URL',
      zoom: '100%',
    },
    settings: {
      theme: 'Theme',
      newTabUrl: 'New Tab URL',
    },
  },
}
```

- [ ] **Step 2: Export from shared index**

Check `packages/shared/src/index.ts` and add the export. If it exists, append:
```ts
export * from './i18n/messages'
```

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/i18n/messages.ts packages/shared/src/index.ts
git commit -m "feat(i18n): add shared message types and zh-CN/en-US translations"
```

---

### Task 12: Create useI18n composable for renderer

**Files:**
- Create: `apps/renderer/src/composables/useI18n.ts`
- Modify: `apps/main/src/settings-manager.ts` (add `currentLang` to SettingsSchema)

**Interfaces:**
- Consumes: `messages` from `@browser/shared`, `SettingsManager.currentLang`
- Produces: `useI18n()` returning `{ t(keyPath: string), lang }`

- [ ] **Step 1: Add `currentLang` to SettingsSchema**

In `apps/main/src/settings-manager.ts`, add to the interface:
```ts
currentLang: 'zh-CN' | 'en-US'
```

And to defaultSettings:
```ts
currentLang: 'zh-CN',
```

And to validateValue switch:
```ts
case 'currentLang': {
  if (['zh-CN', 'en-US'].includes(value as string))
    return value as SettingsSchema[K]
  return defaultSettings.currentLang as SettingsSchema[K]
}
```

- [ ] **Step 2: Create useI18n.ts**

```ts
import { computed, ref } from 'vue'
import type { Message } from '@browser/shared'
import { messages } from '@browser/shared'

const currentLang = ref<string>('zh-CN')

export function useI18n() {
  const t = (keyPath: string): string => {
    const keys = keyPath.split('.')
    let obj = messages[currentLang.value] as Record<string, unknown>
    for (const k of keys) {
      if (obj && typeof obj === 'object' && k in obj) {
        obj = (obj as Record<string, unknown>)[k] as Record<string, unknown>
      }
      else {
        return keyPath
      }
    }
    return typeof obj === 'string' ? obj : keyPath
  }

  return { t, lang: currentLang }
}
```

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/main/src/settings-manager.ts apps/renderer/src/composables/useI18n.ts
git commit -m "feat(i18n): add useI18n composable and currentLang to settings"
```

---

### Task 13: Replace hardcoded strings in TabBar with i18n

**Files:**
- Modify: `apps/renderer/src/components/TabBar.vue`

**Interfaces:**
- Consumes: Task 12 (`useI18n`)
- Produces: TabBar using `t()` for all hardcoded Chinese strings

- [ ] **Step 1: Import useI18n and call it**

In TabBar.vue `<script setup>`:
```ts
import { useI18n } from '../composables/useI18n'
const { t } = useI18n()
```

- [ ] **Step 2: Replace appMenuItems hardcoded strings**

Replace the `appMenuItems` constant (around line 176):
```ts
const appMenuItems: MenuItem[] = [
  { id: 'incognito', label: '新建隐身标签页', icon: 'mdi:account-off' },
  { id: 'wmfx://bookmarks', label: '书签', icon: 'mdi:bookmark' },
  { id: 'wmfx://history', label: '历史', icon: 'mdi:history' },
  { id: 'wmfx://downloads', label: '下载', icon: 'mdi:download' },
  { id: 'wmfx://proxy', label: '代理', icon: 'mdi:network' },
  { id: 'wmfx://settings', label: '设置', icon: 'mdi:cog' },
]
```
with:
```ts
const appMenuItems = computed<MenuItem[]>(() => [
  { id: 'incognito', label: t('appMenu.incognito'), icon: 'mdi:account-off' },
  { id: 'wmfx://bookmarks', label: t('appMenu.bookmarks'), icon: 'mdi:bookmark' },
  { id: 'wmfx://history', label: t('appMenu.history'), icon: 'mdi:history' },
  { id: 'wmfx://downloads', label: t('appMenu.downloads'), icon: 'mdi:download' },
  { id: 'wmfx://proxy', label: t('appMenu.proxy'), icon: 'mdi:network' },
  { id: 'wmfx://settings', label: t('appMenu.settings'), icon: 'mdi:cog' },
])
```

**Note**: `appMenuItems` becomes a `computed` so it responds to language changes. This means downstream code that reads `appMenuItems` synchronously (e.g., `openAppMenu` calls `new Popover({ items: appMenuItems })`) needs to handle the computed — `Popover` constructor reads `descriptor.items` once on creation, so we need to pass `appMenuItems.value` instead of `appMenuItems`.

- [ ] **Step 3: Update openAppMenu to use .value**

In `openAppMenu`, change:
```ts
const descriptor: PopoverDescriptor = { id: 'app-menu', kind: 'menu', items: appMenuItems }
```
to:
```ts
const descriptor: PopoverDescriptor = { id: 'app-menu', kind: 'menu', items: appMenuItems.value }
```

- [ ] **Step 4: Replace tab context menu strings**

In `openTabContextMenu` function, replace all hardcoded Chinese labels with `t()` calls:
- `'在右侧新增标签页'` → `t('tab.closeRight')`
- `'重新加载'` → `t('tab.reload')`
- `'复制'` → `t('tab.duplicate')`
- `'固定'`/`'取消固定'` → `tab.isPinned ? t('tab.unpinned') : t('tab.pinned')`
- `'将这个网站静音'`/`'取消静音'` → `tab.isMuted ? t('tab.unmute') : t('tab.mute')`
- `'关闭'` → `t('tab.close')`
- `'关闭其它标签页'` → `t('tab.closeOthers')`
- `'关闭左侧标签页'` → `t('tab.closeLeft')`

- [ ] **Step 5: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/components/TabBar.vue
git commit -m "feat(i18n): replace hardcoded strings in TabBar with t()"
```

---

### Task 14: Replace hardcoded strings in NewTab with i18n

**Files:**
- Modify: `apps/renderer/src/views/NewTab.vue`

**Interfaces:**
- Consumes: Task 12 (`useI18n`)
- Produces: NewTab using `t()` for all hardcoded Chinese strings

- [ ] **Step 1: Import and call useI18n**

```ts
import { useI18n } from '../composables/useI18n'
const { t } = useI18n()
```

- [ ] **Step 2: Replace hardcoded strings**

- Search input placeholder: `'搜索或输入网址'` → `t('search.placeholder')`
- Engine labels in `engines` array: `'Google'`/`'Baidu'`/`'Bing'` → `t('search.engines.google')` etc.
- `'最近访问'` → `t('newTab.recentHistory')`

- [ ] **Step 3: Update engines array to use computed**

```ts
const engines = computed(() => [
  { key: 'google', label: t('search.engines.google'), icon: 'logos:google-icon' },
  { key: 'baidu', label: t('search.engines.baidu'), icon: 'logos:baidu-icon' },
  { key: 'bing', label: t('search.engines.bing'), icon: 'logos:bing' },
])
```

- [ ] **Step 4: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/renderer/src/views/NewTab.vue
git commit -m "feat(i18n): replace hardcoded strings in NewTab with t()"
```

---

### Task 15: Replace hardcoded strings in AddressBar with i18n

**Files:**
- Modify: `apps/renderer/src/components/AddressBar.vue`

**Interfaces:**
- Consumes: Task 12 (`useI18n`)
- Produces: AddressBar placeholder uses `t('addressBar.placeholder')`

- [ ] **Step 1: Import and call useI18n**

```ts
import { useI18n } from '../composables/useI18n'
const { t } = useI18n()
```

- [ ] **Step 2: Replace placeholder**

In the template, replace:
```html
placeholder="Enter URL"
```
with:
```html
:placeholder="t('addressBar.placeholder')"
```

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/components/AddressBar.vue
git commit -m "feat(i18n): replace hardcoded placeholder in AddressBar with t()"
```

---

### Task 16: Update internalTitleFromPath to use i18n

**Files:**
- Modify: `packages/shared/src/url.ts`
- Modify: `apps/main/src/tab-manager.ts`

**Interfaces:**
- Consumes: Task 11 (`messages`)
- Produces: `internalTitleFromPath` returns localized title from `messages[lang]`

- [ ] **Step 1: Update url.ts**

Replace the `INTERNAL_TITLE_MAP` and `internalTitleFromPath` function. The map becomes the zh-CN portion of messages, and `internalTitleFromPath` accepts an optional lang parameter.

Actually, the simpler approach: keep `internalTitleMap` in url.ts as the current Chinese map, but add a function that looks up from shared messages:

```ts
import { messages } from './i18n/messages'

// Keep for backward compatibility with SettingsManager etc.
const INTERNAL_TITLE_MAP: Record<string, string> = {
  settings: '设置',
  history: '历史',
  bookmarks: '书签',
  downloads: '下载',
  proxy: '代理',
  newtab: '新标签页',
}

export function internalTitleFromPath(path: string, lang = 'zh-CN'): string {
  const top = path.split('/')[0] ?? ''
  const msg = messages[lang] ?? messages['zh-CN']
  // Map top-level path to message key
  const keyMap: Record<string, keyof Message['tab'] | keyof Message['appMenu']> = {
    settings: 'settings',
    history: 'history',
    bookmarks: 'bookmarks',
    downloads: 'downloads',
    proxy: 'proxy',
    newtab: 'newTab',
  }
  const msgKey = keyMap[top]
  if (msgKey && msg.appMenu?.[msgKey]) return msg.appMenu[msgKey]
  if (msgKey && msg.tab?.[msgKey]) return msg.tab[msgKey]
  return 'Internal'
}
```

- [ ] **Step 2: Update tab-manager.ts**

In `tab-manager.ts`, when creating tabs with internal URLs, call `internalTitleFromPath(wmfxPath(resolvedUrl), settings.currentLang)`.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/url.ts apps/main/src/tab-manager.ts
git commit -m "feat(i18n): localize internal title from path using messages"
```

---

## Implementation Order Summary

| Phase | Tasks | Dependencies |
|-------|-------|-------------|
| 1 | 1–5 | None (independent) |
| 2 | 6–8, 10 | Phase 1 (E2E assertions) |
| 3 | 11–16 | None (independent, can parallelize) |
| 4 | 9, 10 | Phase 2 |

## Verification

After all phases complete, run:
```bash
bun run lint        # All lint checks pass
bun run test        # All Vitest tests pass
# E2E tests require local Electron build:
bun run build && bun run test:e2e
```
