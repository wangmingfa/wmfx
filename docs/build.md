# WMFX 打包构建排障手册

> 本文件记录在 Windows/macOS/ARM64 多平台 electron-builder 打包过程中，
> 遇到的所有运行时模块解析、原生 addon 加载、renderer 不渲染等问题，
> 及其根因分析和最终修复。按章节浏览，避免同类问题重复踩坑。

---

## 目录

1. [打包后的应用空窗口（renderer 未渲染）](#1-打包后的应用空窗口renderer-未渲染)
2. [bun workspace symlink 导致运行时 ENOENT](#2-bun-workspace-symlink-导致运行时-enent)
3. [嵌套 node_modules 与 transitive 依赖缺失](#3-嵌套-node_modules-与-transitive-依赖缺失)
4. [Scoped package 路径解析错误](#4-scoped-package-路径解析错误)
5. [JSON 版本号选择错误](#5-json-版本号选择错误)
6. [Native addon dlopen 失败（.node / .dylib 路径错）](#6-native-addon-dlopen-失败node--dylib-路径错)
7. [日志流 WriteStream.end() 死锁](#7-日志流-writestreamend-死锁)
8. [日志归档启动阻塞应用窗口](#8-日志归档启动阻塞应用窗口)
9. [prep-build.cjs 最终算法速览](#9-prep-buildcjs-最终算法速览)
10. [electron-builder.config.ts 配置速览](#10-electron-builderconfigts-配置速览)

---

## 1. 打包后的应用空窗口（renderer 未渲染）

### 症状

安装 `.dmg` 后启动，主窗口出现但 UI 完全空白。主进程日志显示 `ERR_FILE_NOT_FOUND`，
renderer 的 `main-frontend.log` 文件存在但内容为空。

### 根因链

```
Renderer dist 在 app.asar 包内
  ↓
WindowManager.loadFile() 用 file:// 协议加载
  ↓
loadFile 走本地文件系统，无法读取 asar 内部文件
  ↓
三次加载全部 ERR_FILE_NOT_FOUND
  ↓
页面空白，JS 从未执行
```

同样的问题发生在 `preload.cjs`：

```
preload.cjs 在 app.asar 内
  ↓
webPreferences.preload 指定文件系统路径
  ↓
preload 加载失败
  ↓
window.browserAPI 不存在
  ↓
main.ts: syncThemeToShell() 中 window.browserAPI?.getTheme() 返回 undefined
  ↓
外层 Promise 的 .then(resolve) 永不触发
  ↓
app.mount('#app') 永不执行 → 窗口空白
```

### 修复

在 `electron-builder.config.ts` 中将 `preload.cjs` 和 `apps/renderer/dist/` 加入
`extraResources`，使其以**真实文件目录**存在于 `Resources/` 下，而非 `app.asar` 内部：

```ts
extraResources: [
  { from: 'apps/renderer/dist/', to: 'apps/renderer/dist/', filter: ['**/*'] },
  { from: 'apps/main/dist/preload.cjs', to: 'apps/main/dist/preload.cjs' },
],
```

### 关键原则

> **`webPreferences.preload`、`BrowserWindow.loadFile()` 都需要文件系统上的真实路径。**
> `app.asar` 内部文件无法通过这两种方式访问。

---

## 2. bun workspace symlink 导致运行时 ENOENT

### 症状

```
Error: Cannot find module 'ws'
Error: Cannot find module 'ssh2'
...
```

### 根因

bun workspace 下，`apps/main/node_modules/` 中的包是指向 `.bun/` 的 symlink：

```
apps/main/node_modules/ws  →  ../../../node_modules/.bun/ws@8.21.0/node_modules/ws
```

electron-builder 打包时不跟随指向 workspace 外的 symlink，导致运行时 `require('ws')` 找不到。

### 修复

`electron-builder.config.ts` 的 `beforeBuild` hook 调用 `scripts/prep-build.cjs`，
在打包前把 symlink 替换为真实目录，并补全 transitive 依赖。

```ts
// electron-builder.config.ts
beforeBuild: './scripts/prep-build.cjs',
```

---

## 3. 嵌套 node_modules 与 transitive 依赖缺失

### 症状

```
Error: Cannot find module 'bindings'
Error: Cannot find module 'basic-ftp'
...
```

### 根因

bun 把所有包平铺在 `.bun/` 顶层（如 `.bun/asn1@0.2.6/`），
`ssh2` 的依赖 `asn1` 并不会嵌套在 `ssh2` 目录内。Node 解析 `require('asn1')` 时会到
`apps/main/node_modules/asn1` 找，所以所有被引用到的子包都必须映射一份到 `node_modules` 顶层。

workspace 内部包（如 `@browser/database`）带有自己的嵌套 `node_modules/`（如 `better-sqlite3`），
其中又引用 `bindings` 等 transitive deps。`prep-build` 需要用**路径去重**（而非包名去重）
分别处理不同位置的嵌套依赖。

### 修复

`prep-build.cjs` 的 `mapPkg()` 递归处理：

1. 读 `package.json` 的 `dependencies` + `optionalDependencies`
2. 对每个 dep 先在包自身 `node_modules/` 内查找（嵌套依赖）
3. 找不到则到 `.bun/` 顶层 `findBunPkg()` 映射
4. 已存在的目标不覆盖，但**仍继续处理**（保证嵌套 deps 被填充）
5. `seen` 用 `path.resolve(pkgPath)` 去重，允许不同位置的同一包分别处理其 transitive deps

---

## 4. Scoped package 路径解析错误

### 症状

```
Error: Cannot find module '@browser/database'
Error: Cannot find module '@wmfx/database'
Error: Cannot find module '@iconify/utils'
```

### 根因

`@browser/`、`@wmfx/` 是 workspace 内部包的 scope 目录。
`prep-build` 顶层遍历用 `basename()` 得到的是 `database` 而非 `@browser/database`，
导致 scope 子包未被正确识别。

### 修复

在 `mapPkg(pkgPath, knownName)` 中从 `knownName`（即遍历得到的 entry 名称，含完整 scope）
优先取包名；如果 unknown，则从路径解析：扫描路径中 `node_modules/@scope/pkg` 的结构，
拼出完整的 `@scope/pkg` 名称。

同时遍历 scope 根目录下的子目录包：

```js
if (name.startsWith('@') && !name.includes('/')) {
  for (const sub of fs.readdirSync(pkgPath)) {
    const subP = path.join(pkgPath, sub)
    if (fs.statSync(subP).isDirectory())
      mapPkg(subP, `${name}/${sub}`)
  }
  return
}
```

---

## 5. JSON 版本号选择错误

### 症状

```
Error: Cannot find module 'jsonfile'
```

### 根因

`.bun/` 下存在多个版本的同包（如 `jsonfile@4.0.0/`、`jsonfile@6.2.1/`），
字符串字典序比较会错误地选到旧版（`4.0.0` < `6.2.1` 字典序成立，但其他情况不一定）。

### 修复

在 `findBunPkg()` 中用 `String.localeCompare(..., undefined, { numeric: true })` 选择
版本号最高的目录。

---

## 6. Native addon dlopen 失败（.node / .dylib 路径错）

### 症状

```
Error: dlopen(..., 0x0002): tried: '.../sharp-darwin-arm64.node' (no such file),
'.../sharp-darwin-arm64.dylib' (no such file)
```

### 根因

`sharp`、`@img/sharp-darwin-arm64` 等 native addon 的 `.node` 文件被打包进 `app.asar` 时，
dlopen 加载时 rpath 指向的 `.dylib` 同样在 asar 内部，文件系统路径不可达。

### 修复

在 `electron-builder.config.ts` 的 `asarUnpack` 中同时加入**通用模式**和**特定路径**：

```ts
asarUnpack: [
  '**/*.node',               // 通用：所有 native addon
  '**/*.dylib',              // 通用：macOS 共享库
  'apps/main/node_modules/@img/**/*',   // scoped 特定路径
  'apps/main/node_modules/sharp/**/*',  // 顶层特定路径
],
```

特定路径是为了覆盖 `.bun/` 平铺结构下 scoped 包的共享库，
这些库的路径模式可能与 `**/*.dylib` 不匹配。

---

## 7. 日志流 WriteStream.end() 死锁

### 症状

应用启动后挂起，主窗口完全不响应，进程不死但 UI 不渲染。

### 根因

`cleanupLive()` 使用 `ReadStream` + `WriteStream` 的管道（pipeline）来清理日志，
`WriteStream.end()` 的回调在**空流**上不触发，导致 `cleanupLive` 异步永不 resolve。

### 修复

改用 `readFileSync` + `writeFileSync` 同步读写：

```ts
export async function cleanupLive(): Promise<void> {
  cleaning = true
  try {
    for (const name of LOG_NAMES) {
      const text = fs.readFileSync(live, 'utf8')
      const kept = text.split('\n').filter(/* 保留今天的行 */)
      fs.writeFileSync(live, kept.join('\n'))
    }
  } finally {
    // 写入 pending 缓冲的日志，然后置位 cleaning = false
  }
}
```

文件通常不大（几条到几十条），同步开销可忽略。

---

## 8. 日志归档启动阻塞应用窗口

### 症状

应用启动慢，窗口延迟出现。

### 根因

`app.whenReady().then()` 中 `await startLogRotation()` 同步等待，
包含 `cleanupLive()` 和 `cleanOldArchives()`，在日志量大时耗时显著。

### 修复

改为**非阻塞 fire-and-forget**：

```ts
app.whenReady().then(async () => {
  startLogRotation().catch((e) => console.error('[App] whenReady: startLogRotation failed:', e))
  proxyManager.start().catch((e) => console.warn('[App] whenReady: Mihomo proxy failed to start:', e))
  // ... 继续创建窗口
})
```

---

## 9. prep-build.cjs 最终算法速览

完整实现见 [`scripts/prep-build.cjs`](../scripts/prep-build.cjs)。

```
遍历 apps/main/node_modules/ 顶层条目
  │
  ├─ symlink:
  │    ├─ 读目标 → 解析真实路径
  │    ├─ rm symlink
  │    └─ cpSync(resolved, target, {recursive, dereference})
  │
  ├─ real dir:
  │    └─ mapPkg(pkgPath, entryName)
  │
  └─ mapPkg(pkgPath, knownName):
       ├─ 解析全名（处理 scoped @scope/pkg）
       ├─ seen 用路径去重（允许同名包不同位置分别处理）
       ├─ 复制或替换目标目录
       ├─ 如果是 scope 根目录：遍历子包，递归 mapPkg
       └─ 读 deps/optionalDeps：
            ├─ 先在自身 node_modules/ 内找（嵌套依赖）
            └─ 否则 findBunPkg() 在 .bun/ 顶层映射
```

### findBunPkg(name) 关键点

- scoped 包名 `/` 替换为 `+`（bun 用 URL-encoded 命名）
- 匹配 `encodedName@<version>/` 模式
- 验证 `node_modules/name` 子目录存在
- `localeCompare(numeric:true)` 取最高版本

---

## 10. electron-builder.config.ts 配置速览

完整配置见 [`electron-builder.config.ts`](../electron-builder.config.ts)。

| 配置项 | 作用 | 关键值 |
|--------|------|--------|
| `beforeBuild` | 打包前处理 symlink + deps | `./scripts/prep-build.cjs` |
| `files` | 需要打包的内容 | `apps/main/dist/**/*`, `apps/main/node_modules/**/*` |
| `asarUnpack` | 以真实目录解压（不走 asar） | `**/*.node`, `**/*.dylib`, `@img/**/*`, `sharp/**/*` |
| `extraResources` | 打包到 `Resources/` 的真实目录 | `mihomo/`, `resources/`, `renderer/dist/`, `preload.cjs` |

### 三类"必须以真实文件存在"的资源

1. **renderer/dist** — `BrowserWindow.loadFile(file://...)` 走本地文件系统
2. **preload.cjs** — `webPreferences.preload` 是文件系统路径
3. **native addon** — `dlopen` 需要加载 `.node` + rpath 下的 `.dylib`

---

## 调试技巧

### 检查 DMG 内部结构

```bash
# 挂载
hdiutil attach -nobrowse -mountpoint /tmp/wmfx-dmg dist-pack/WMFX-0.1.0-arm64.dmg

# 找特定文件
find /tmp/wmfx-dmg/WMFX.app/Contents/Resources/ -name "preload.cjs"

# 查 app.asar 内部
strings /tmp/wmfx-dmg/WMFX.app/Contents/Resources/app.asar | grep -i "preload"

# 卸载
hdiutil detach /tmp/wmfx-dmg
```

### 日志位置

```
~/Library/Application Support/com.wmfx.browser/logs/
├── main.log            # 全量
├── main-backend.log    # main 进程
├── main-frontend.log   # renderer 进程（通过 preload 桥接）
├── error.log           # 错误全量
├── error-backend.log   # main 错误
└── error-frontend.log  # renderer 错误
```

### main-frontend.log 为空 = renderer JS 没执行

这是最重要的调试信号：
- `main-frontend.log` 为空 且 窗口空白 → preload 加载失败或 JS 在 `app.mount` 前崩了
- 检查 `preload.cjs` 是否在文件系统上（不在 asar 内）
- 检查 `syncThemeToShell()` 的 Promise 是否 resolve（browserAPI 是否存在）
