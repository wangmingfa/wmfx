# 2026-07-14 — Next Phase Design

## 概述

M1–M4 已完全交付。近期 5 次提交完成了 UI 打磨收尾。本文档描述接下来 6 个方向的设计与实施方案。

## 状态

- M1–M4: ✅ 完成
- 工作区: 干净 (2026-07-14 22:18, e9ef25c)
- 无远程仓库

---

## 1. 近期修复

### 1.1 AddressBar 切换内部页不清空

**现状**: `AddressBar.vue:110-120` 的 watch 遇到 `wmfx://` 直接 return,导致从外部页切到 `wmfx://newtab` 时旧 URL 残留(外部 URL 仍显示在地址栏)。

```ts
// 当前代码:
watch(
  () => props.url,
  (newUrl) => {
    if (newUrl.startsWith('wmfx://'))
      return  // ← 跳过, urlInput 不变
    if (newUrl !== urlInput.value) {
      urlInput.value = newUrl
    }
  },
)
```

**修复**:
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

### 1.2 E2E 断言更新

`app.spec.ts` 中两处断言需从 `'wmfx://newtab'` 改为 `''`:

| 行 | 当前 | 修复后 |
|----|------|--------|
| 75 | `.url-input`.toHaveValue(`'wmfx://newtab'`) | `.url-input`.toHaveValue(`''`) |
| 167 | `.url-input`.toHaveValue(`'wmfx://newtab'`) | `.url-input`.toHaveValue(`''`) |

> 注:`wmfx://settings` 等内部页的地址栏断言不受影响,仍显示完整 URL。

### 1.3 API 现状确认

- `useAddressBarFocus` 保持双 API 模式(订阅/发布),无需改动
- `usePageTitle` 的 watchable 模式保留作为扩展点,当前无需使用

---

## 2. GitHub Actions 三平台构建矩阵

### 2.1 工作流文件

| 文件 | 触发 | 用途 |
|------|------|------|
| `.github/workflows/ci.yml` | push/PR → main | lint + typecheck + vitest |
| `.github/workflows/e2e.yml` | push/PR → main, workflow_dispatch | 全量 build + Playwright E2E |
| `.github/workflows/build.yml` | tag `v*.*.*` | 三平台构建 + 上传 Artifacts |
| `.github/workflows/release.yml` | tag `v*.*.*` + publish | 三平台构建 + GitHub Release |

### 2.2 构建矩阵

| os | target | arch |
|----|--------|------|
| ubuntu-latest | linux | x64 |
| macos-latest | mac | x64 |
| macos-latest | mac | arm64 |
| windows-latest | win | x64 |

### 2.3 构建步骤

```
checkout → bun install → bun run build → bun run lint → bun run test
→ 下载 mihomo 二进制 → bun run package → upload artifact
```

**缓存**: bun install cache(`bun.lock`), Playwright browsers cache。
**权限**: `contents: write`(release 需要)。

### 2.4 关键约束

- **macOS 最低版本**: `macos-latest`(macOS 15)构建的 dmg 默认只支持 macOS 15+。需在 `electron-builder.config.ts` 中显式设置 `macOSMinimumSystemVersion: '13.0'`(或项目支持的最低版本),确保 macOS 13/14 用户可用。
- **macOS 架构**: `macos-latest` 是 ARM64 runner,只能构建 ARM64 版本。Intel(x64)版本需要用 `macos-13`/`macos-14` runner 构建。Matrix 中 x64 应使用 `macos-14`。
- **Linux glibc**: `ubuntu-latest` 构建的 AppImage/deb 依赖新版 glibc,在 Ubuntu 22/24 上均可运行(新版 glibc 向下兼容);但旧版 glibc(20.04)可能无法运行新构建版本。
- **Windows**: nsis 构建在 Windows Server runner 上,在 Win10/11 均可运行,无版本倒挂问题。

**更新后的矩阵**:

| os | target | arch | runner |
|----|--------|------|--------|
| ubuntu-latest | linux | x64 | ubuntu-latest |
| macos-14 | mac | x64 | macos-14 |
| macos-latest | mac | arm64 | macos-latest |
| windows-latest | win | x64 | windows-latest |

---

## 3. 自动更新

### 3.1 现状

`updater.ts` 已实现完整逻辑:

- 基于 `electron-updater` + GitHub Releases
- 仅在 `app.isPackaged` 时生效
- 启动时静默检查,自动下载,退出时安装
- 状态通过 IPC(`updater:check`, `updater:getStatus`)广播
- `electron-builder.config.ts` 已配置 `publish: github`

### 3.2 待做

仅需 CI 集成:在 `release.yml` 中 tag 发布后执行 `bun run package`,产物自动上传到 GitHub Release。electron-updater 客户端会自动从 Release 下载增量更新。**不需要额外代码改动**。

---

## 4. Vitest 单元测试 + Playwright E2E 扩展

### 4.1 Vitest 现有测试

- `packages/ipc-contract/src/channels.test.ts`
- `apps/main/src/logger.test.ts`
- `packages/shared/src/url.test.ts`

### 4.2 新增单元测试

| 测试目标 | 文件 | 说明 |
|----------|------|------|
| `useAddressBarFocus` | `composables/useAddressBarFocus.test.ts` | nonce 递增 |
| `usePageTitle` static | `composables/usePageTitle.test.ts` | 初始值设置 |
| `usePageTitle` watchable | 同上 | ref/computed 同步 |
| `navigation.ts` 纯函数 | `panel/navigation.test.ts` | `getSelectable`, `selectableIndexOf` 等 |

### 4.3 新增 E2E 测试

| 测试 | 断言 |
|------|------|
| 地址栏清空:外部页 → NewTab | 输入框为空 |
| 地址栏填充:NewTab → 输入 URL → Enter | 输入框更新为实际 URL |
| 新标签页聚焦:点击 + | 地址栏聚焦 |
| 隐身模式:三点菜单 → 隐身标签页 | 地址栏空 + 聚焦 |

---

## 5. AddressBar 清空问题修复

与第 1.1 节相同,核心改动一行:仅 `wmfx://newtab` 清空地址栏,其它内部页(`settings`/`proxy` 等)正常显示 URL。

**影响范围**:
- `apps/renderer/src/components/AddressBar.vue`: watch 逻辑修改(判断 `wmfx://newtab` 而非整个 `wmfx://`)
- `e2e/app.spec.ts`: 2 处断言更新
- `e2e/popover.spec.ts`: 可能需要同步(需确认 beforeEach 中的 `wmfx://newtab` 断言)

---

## 6. i18n 支持

### 6.1 设计原则

- 零额外依赖(不引入 vue-i18n)
- 类型安全(编译期键名检查)
- 运行时切换(Settings 中配置,通过 IPC 持久化)
- 共享层(`packages/shared`)提供消息常量,main/renderer 各自封装使用

### 6.2 文件结构

```
packages/shared/src/
├── i18n/
│   ├── messages.ts     # 各语言 JSON 常量 + Message 类型
│   └── index.ts        # 导出 useI18n 基础函数
```

```ts
// packages/shared/src/i18n/messages.ts
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
  settings: {
    theme: string
    newTabUrl: string
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
  }
}

export const messages: Record<string, Message> = {
  'zh-CN': { /* ... */ },
  'en-US': { /* ... */ },
}
```

### 6.3 渲染进程 composable

```ts
// apps/renderer/src/composables/useI18n.ts
import { ref, watch } from 'vue'
import { messages } from '@browser/shared'
import { currentLang } from '../i18n/context'  // 从 SettingsManager 同步

export function useI18n() {
  const lang = ref(currentLang)
  const t = (keyPath: string): string => {
    // 简单 key 路径解析: 'tab.close' → messages[lang.value].tab.close
    const keys = keyPath.split('.')
    let obj = messages[lang.value] as any
    for (const k of keys) obj = obj?.[k]
    return obj ?? keyPath
  }
  // watch currentLang → 更新 lang ref
  return { t, lang }
}
```

### 6.4 主进程 i18n

```ts
// apps/main/src/i18n/
// 读取 settings.currentLang, 暴露 getMsg(keyPath)
```

### 6.5 改造范围(第一批)

| 文件 | 硬编码字符串数量 |
|------|------------------|
| `TabBar.vue` | ~15 个(菜单项 + 右键菜单) |
| `NewTab.vue` | ~5 个(引擎标签 + 最近访问) |
| `AddressBar.vue` | ~3 个(placeholder, zoom) |
| `settings.ts` 默认值 | 已为中文,需改为 key 或双语 |
| `url.ts` INTERNAL_TITLE_MAP | 6 个(已中文化) |

### 6.6 SettingsManager 扩展

新增配置项 `currentLang: 'zh-CN' | 'en-US'`,默认 `zh-CN`。

---

## 实施计划

按依赖顺序排列:

**Phase 1 — 近期修复(立即可做)**
1. 修复 AddressBar 清空 + E2E 断言更新
2. Vitest 新增测试(纯函数 + composables)

**Phase 2 — CI/CD + E2E(依赖 Phase 1)**
3. GitHub Actions 4 个工作流
4. Playwright E2E 扩展

**Phase 3 — i18n(无依赖,可并行 Phase 1/2)**
5. 共享层 i18n 消息 + 类型
6. 渲染进程 `useI18n` composable
7. 主进程 i18n + SettingsManager 扩展
8. 第一批 UI 字符串替换

**Phase 4 — 发布(依赖 Phase 2)**
9. Release 工作流 + GitHub Release 集成
10. 代码签名(macOS/Windows,需要证书)

## 约束

- 所有改动必须符合现有 lint 规则(biome + eslint + typecheck)
- 不引入不必要的第三方依赖
- 保持 Electron 主进程 CJS 输出
- 中文作为默认语言,英文作为回退
