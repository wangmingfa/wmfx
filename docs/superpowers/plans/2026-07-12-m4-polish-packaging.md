# M4 — 打磨与打包 实现计划

> **Goal:** 三平台 electron-builder 打包、崩溃恢复、会话恢复、后台标签挂起。

---

## Task 1: electron-builder 打包配置

**目标:** 配置 electron-builder，支持 win/mac/linux 三平台打包，包含 mihomo 内核。

### 修改文件
- `package.json` — 添加 `build` 配置 + `package` 脚本
- 新建 `electron-builder.yml` — 打包配置

### 方案
```yaml
# electron-builder.yml
appId: com.wmfx.browser
productName: WMFX
directories:
  output: dist-pack
files:
  - apps/main/dist/**/*
  - apps/renderer/dist/**/*
extraResources:
  - from: mihomo/
    to: mihomo/
    filter: ["**/*"]
linux:
  target: [AppImage, deb]
  icon: resources/icons
  category: Network
mac:
  target: [dmg]
  icon: resources/icons/logo.png
  category: public.app-category.browsers
win:
  target: [nsis]
  icon: resources/icons/logo.png
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

根 `package.json` 新增脚本:
```json
"package": "bun run build && electron-builder",
"package:linux": "bun run build && electron-builder --linux",
"package:mac": "bun run build && electron-builder --mac",
"package:win": "bun run build && electron-builder --win"
```

### 验证
- `bun run package:linux` 生成 `dist-pack/` 下的 AppImage

---

## Task 2: 会话恢复（Tab Restore）

**目标:** 关闭时保存打开的标签页，重启时恢复。

### 修改文件
- `apps/main/src/settings-manager.ts` — 新增 `openTabs` 字段
- `apps/main/src/tab-manager.ts` — 新增 `serializeTabs()` / `restoreTabs()`
- `apps/main/src/index.ts` — 启动时调用 `restoreTabs()`

### 方案

**SettingsManager** 新增 schema 字段:
```ts
interface OpenTab {
  url: string
  title: string
}
// settingsSchema 新增:
openTabs: OpenTab[]
activeTabIndex: number
windowBounds: { x: number; y: number; width: number; height: number }
```

**TabManager** 新增方法:
- `serializeTabs(): OpenTab[]` — 返回当前所有标签的 url + title
- `restoreTabs(tabs: OpenTab[], activeIndex: number)` — 批量创建标签

**index.ts** 修改:
- `app.on('before-quit')` → 保存 tabs + window bounds
- `app.whenReady()` → 恢复 tabs，若无 saved tabs 则创建 about:blank

---

## Task 3: 窗口状态持久化

**目标:** 记住窗口位置、大小，重启后恢复。

### 修改文件
- `apps/main/src/window-manager.ts` — 读取/保存 window bounds
- `apps/main/src/index.ts` — close 时保存

### 方案
- 从 `settingsManager.get('windowBounds')` 读取，创建窗口时传入
- 监听 `resize`/`move` 事件（debounce 500ms），保存到 settings
- `app.on('before-quit')` 时最终保存一次

---

## Task 4: 崩溃恢复

**目标:** 标签页渲染进程崩溃时自动恢复。

### 修改文件
- `apps/main/src/tab-manager.ts` — 监听 `render-process-gone`

### 方案
在 `setupTabListeners` 中添加:
```ts
wc.on('render-process-gone', (_, details) => {
  // 重新加载崩溃的标签页
  tab.view.webContents.loadURL(tab.state.url || 'about:blank')
})
```

同时添加 `unresponsive` 处理:
```ts
wc.on('unresponsive', () => {
  // 可选：弹窗提示用户，或自动 reload
})
```

---

## Task 5: 后台标签挂起

**目标:** 后台标签超过 5 分钟不活跃时释放 WebContentsView 节省内存。

### 修改文件
- `apps/main/src/tab-manager.ts` — 挂起/恢复逻辑

### 方案
- 维护 `lastActiveTime: Map<string, number>`
- `activate()` 时更新时间戳
- 定时器每 60s 检查，超过 300s 未活跃的标签：`removeChildView` + `webContents.close()`，保留 url/title 状态
- 切换回挂起标签时，重新创建 WebContentsView 并 `loadURL`
- 挂起状态通过 tab state 广播给渲染进程（新增 `isSuspended` 字段）

---

## Task 6: E2E 测试 + 集成验证

**目标:** 验证打包后应用可正常启动。

### 修改文件
- `e2e/app.spec.ts` — 新增 session restore 测试

### 测试用例
1. 启动应用 → 创建多个标签 → 关闭 → 重启 → 验证标签恢复
2. 崩溃恢复：模拟 render-process-gone → 验证标签自动 reload

---

## 执行顺序

1. **Task 1** — electron-builder 配置（独立，不依赖其他 task）
2. **Task 2** — 会话恢复
3. **Task 3** — 窗口状态持久化（依赖 Task 2 的 settings 变更）
4. **Task 4** — 崩溃恢复
5. **Task 5** — 后台标签挂起
6. **Task 6** — E2E 测试
