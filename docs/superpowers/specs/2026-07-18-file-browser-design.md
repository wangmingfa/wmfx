# 文件浏览器设计文档

> Phase 6 — 在浏览器外壳内提供本地/远程文件管理能力，可像访问网页一样浏览/打开/管理文件。

## 1. 入口与 URL 路由

### 地址栏本地路径检测

在 `packages/shared/src/url.ts` 的 `normalizeAddressBarInput` 中新增本地路径检测：

```ts
const LOCAL_PATH_PATTERNS = [
  /^\/[\w\-./]+$/,                          // Unix: /home/user/docs
  /^[A-Z]:[\\\/][\w\-./\\]+$/i,            // Windows: C:\Users\xxx
  /^~\/[\w\-./]+$/,                         // Unix 短写: ~/Documents
  /^\.\.?\/[\w\-./]+$/,                     // 相对路径: ./src, ../tmp
]
```

匹配时跳过 `https://` / `http://` / `wmfx://` 前缀处理，直接返回本地路径。

### 路由映射

| 输入 | 路由 |
|------|------|
| `/home/user/docs` | `wmfx://files/home/user/docs` |
| `C:\Users\xxx` | `wmfx://files/C:/Users/xxx` |
| `~/Documents` | 主进程 resolve 为绝对路径后路由 |
| `ftp://192.168.1.100` | `wmfx://ftp/192.168.1.100` |
| `sftp://user@host` | `wmfx://sftp/user@host` |

### 共享常量变更

`packages/shared/src/url.ts`：
- `INTERNAL_ROUTE_PREFIXES` 新增 `'/files'`、`'/ftp'`、`'/sftp'`
- `INTERNAL_TITLE_MAP` 新增 `files: '文件'`、`ftp: 'FTP'`、`sftp: 'SFTP'`
- 新增 `isLocalPath(input): boolean` 辅助函数

### 地址栏显示

文件浏览器标签的地址栏显示实际本地路径（如 `/home/user/docs`），不显示 `wmfx://files/...`。地址栏左侧显示文件夹图标（`mdi:folder`）作为本地文件标识。非文件浏览器标签恢复为地球图标。

## 2. UI 布局

### 整体结构

文件浏览器作为内部页，占据标签栏下方的内容区，地址栏和标签栏保持可见：

```
┌─────────────────────────────────────────────┐
│  [标签栏]  Tab1 | Tab2 | Tab3(active)       │
├─────────────────────────────────────────────┤
│ 📁│ [后退] [前进] [刷新] │ /home/user/docs  │  ← 地址栏（左侧文件图标）
├───────┬─────────────────────────────────────┤
│ 快捷  │  📂 src/          ▲ 排序           │
│ 访问  │  📄 README.md     ─────────────     │
│       │  🖼️ photo.png                        │
│ 📁桌面│  📄 package.json                     │
│ 📁下载│                                       │
│ 📁文档│  搜索: [____________]                 │
│ 📁图片│                                       │
│ ───── │  共 12 项，2 个文件夹                 │
│ 📁书签│                                       │
│ +添加 │                                       │
└───────┴─────────────────────────────────────┘
```

### 左侧快捷访问面板（240px 固定宽度）

- **系统目录**：桌面、下载、文档、图片、音乐、视频（自动检测，不存在的不显示）
- **用户书签**：用户固定常用目录，存储在 `SettingsManager.fileBookmarks` 中
- **添加按钮**：点击弹出目录选择对话框
- **拖拽排序**：快捷访问项支持拖拽重排序
- **右键菜单**：移除、在新标签打开

### 右侧内容区

- **面包屑导航**：`首页 > home > user > docs`，每段可点击跳转
- **工具栏**：排序按钮（名称/大小/修改时间/类型）、视图切换（图标/列表）、搜索框
- **文件列表**：图标视图（网格）或列表视图（表格），支持多选
- **状态栏**：显示选中项数量、目录总大小

### 视图切换

- **图标视图**：大图标 + 文件名，适合图片/媒体浏览
- **列表视图**：表格行（名称/大小/修改时间/类型），可点击列头排序

## 3. Quick Look 快速预览（空格触发）

### 交互流程

1. 选中文件 → 按 `Space` → 弹出浮动预览面板
2. 预览面板居中显示，半透明遮罩覆盖文件列表
3. 预览期间 `←` `→` 切换上下文件，预览内容实时更新
4. 再按 `Space` 或 `Escape` 关闭预览
5. 预览面板有关闭按钮（右上角 ×）

### 预览面板布局

```
┌──────────────────────────────────┐
│  photo.png          1920×1080  × │  ← 文件名 + 尺寸/信息 + 关闭按钮
├──────────────────────────────────┤
│                                  │
│         [ 图片预览区域 ]          │  ← 按文件类型渲染
│                                  │
├──────────────────────────────────┤
│  大小: 2.4 MB  修改: 2024-03-15 │  ← 底部信息栏
└──────────────────────────────────┘
```

### 支持的预览格式

| 类型 | 格式 | 渲染方式 |
|------|------|----------|
| 图片 | png/jpg/gif/webp/svg/bmp | `<img>` 标签，自适应缩放 |
| 文本 | txt/md/json/ts/js/css/html/xml | `<pre>` + 语法高亮（按扩展名选语言） |
| PDF | pdf | `<iframe>` 或 Electron 内置 PDF viewer |
| 音频 | mp3/wav/ogg/flac | `<audio>` 播放器 |
| 视频 | mp4/webm/mkv | `<video>` 播放器 |
| 其他 | — | 显示文件图标 + 大小 + 修改时间，提示「不支持预览」 |

### 预览期间快捷键

| 按键 | 行为 |
|------|------|
| `Space` | 关闭预览 |
| `Escape` | 关闭预览 |
| `←` / `→` | 切换到上/下一个文件 |
| `↑` / `↓` | 同上（列表视图按行） |

### 技术实现

- 主进程新增 `fs:readFilePreview` IPC：读取文件前 N 字节判断类型，返回 `{ type, data }`
- 大文件（>10MB）不读取内容，仅显示元信息
- 图片预览：主进程返回 base64 data URL，渲染端 `<img :src="dataUrl">`
- 文本预览：主进程返回 UTF-8 文本内容（截断至 50KB）
- 音视频：通过 `file://` 协议加载本地文件，`<audio>`/`<video>` 直接播放

## 4. 核心组件与 IPC 通道

### 主进程模块

**`apps/main/src/file-browser-manager.ts`** — 文件浏览器核心管理器：

```ts
class FileBrowserManager {
  // 目录操作
  readDir(dirPath: string): Promise<FileEntry[]>
  stat(filePath: string): Promise<FileStat>
  mkdir(dirPath: string): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  delete(paths: string[]): Promise<void>
  copy(sources: string[], dest: string): Promise<void>
  cut(sources: string[], dest: string): Promise<void>
  paste(clipboard: ClipboardData, dest: string): Promise<void>

  // Quick Look
  readFilePreview(filePath: string): Promise<PreviewData>

  // 搜索
  searchDir(dirPath: string, query: string): Promise<FileEntry[]>

  // 书签
  getBookmarks(): Promise<FileBookmark[]>
  addBookmark(dirPath: string, name: string): Promise<void>
  removeBookmark(id: string): Promise<void>
  reorderBookmarks(ids: string[]): Promise<void>

  // 系统目录
  getSystemDirs(): Promise<SystemDir[]>

  // 系统剪贴板集成（跨应用）
  clipboardReadFiles(): string[]
  clipboardWriteFiles(paths: string[]): void

  // FTP/SFTP
  ftpConnect(opts: FtpConnectOptions): Promise<string>
  sftpConnect(opts: SftpConnectOptions): Promise<string>
  ftpList(sessionId: string, remotePath: string): Promise<FileEntry[]>
  ftpUpload(sessionId: string, localPath: string, remotePath: string): Promise<void>
  ftpDownload(sessionId: string, remotePath: string, localPath: string): Promise<void>
  ftpDisconnect(sessionId: string): Promise<void>
}
```

### IPC 通道

`packages/ipc-contract/src/channels.ts` 新增：

```ts
// 文件浏览器
'fs:readDir': (dirPath: string) => FileEntry[]
'fs:stat': (filePath: string) => FileStat
'fs:mkdir': (dirPath: string) => void
'fs:rename': (oldPath: string, newPath: string) => void
'fs:delete': (paths: string[]) => void
'fs:copy': (sources: string[], dest: string) => void
'fs:cut': (sources: string[], dest: string) => void
'fs:paste': (dest: string) => void
'fs:readFilePreview': (filePath: string) => PreviewData
'fs:searchDir': (dirPath: string, query: string) => FileEntry[]
'fs:getSystemDirs': () => SystemDir[]
'fs:getBookmarks': () => FileBookmark[]
'fs:addBookmark': (dirPath: string, name: string) => void
'fs:removeBookmark': (id: string) => void
'fs:reorderBookmarks': (ids: string[]) => void
'nav:openFileInBrowser': (filePath: string) => void

// FTP/SFTP
'fs:ftpConnect': (opts: FtpConnectOptions) => string
'fs:sftpConnect': (opts: SftpConnectOptions) => string
'fs:ftpList': (sessionId: string, remotePath: string) => FileEntry[]
'fs:ftpUpload': (sessionId: string, localPath: string, remotePath: string) => void
'fs:ftpDownload': (sessionId: string, remotePath: string, localPath: string) => void
'fs:ftpDisconnect': (sessionId: string) => void
```

### 核心类型

```ts
interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modifiedAt: number
  createdAt: number
  extension: string
  isHidden: boolean
}

interface FileStat {
  size: number
  isDir: boolean
  isFile: boolean
  isSymbolicLink: boolean
  modifiedAt: number
  createdAt: number
  permissions: string
}

interface PreviewData {
  type: 'image' | 'text' | 'pdf' | 'audio' | 'video' | 'unknown'
  mimeType?: string
  data?: string
  truncated?: boolean
  fileName: string
  fileSize: number
  dimensions?: { width: number; height: number }
}

interface SystemDir {
  name: string
  path: string
  icon: string
}

interface FileBookmark {
  id: string
  name: string
  path: string
  icon: string
}

interface ClipboardData {
  paths: string[]
  operation: 'copy' | 'cut'
}
```

### 剪贴板管理

**跨应用剪贴板**：
- `clipboardReadFiles()`：Electron 内置 `clipboard.readFiles()` 读取系统剪贴板文件路径
- `clipboardWriteFiles(paths)`：按平台写入系统剪贴板
  - macOS：`NSPasteboard` 写入 `NSFilenamesPboardType`
  - Windows：`CF_HDROP` DROPFILES 结构体
  - Linux：`text/uri-list` 格式

**应用内剪贴板**：
- 保存 `clipboardData: { paths, operation }` 在 `FileBrowserManager` 内存中
- `cut` 操作粘贴成功后删除源文件
- 关闭文件浏览器标签不影响剪贴板

**跨应用流程**：
1. wmfx 中复制 → 写入系统剪贴板 + 保存应用内状态
2. 到 Finder 粘贴 → 系统读取剪贴板，正常粘贴
3. Finder 中复制 → 系统剪贴板已有文件路径
4. 回到 wmfx 粘贴 → `clipboardReadFiles()` 读取系统剪贴板路径

## 5. 文件操作

### 打开文件/文件夹

- **双击文件夹**：进入该目录，地址栏更新路径
- **双击文件**：调用 `shell.openPath()` 用系统默认程序打开
- **右键 → 打开**：同双击
- **右键 → 在新标签打开**：创建新标签，路径为该文件夹

### 重命名

- **触发**：右键菜单「重命名」或快捷键
- **交互**：文件名变为可编辑输入框，原名全选，回车确认，Esc 取消
- **验证**：不允许空名、`/` `\` 等非法字符、重名检测
- **反馈**：失败时 toast 提示错误原因

### 删除

- **触发**：右键菜单「删除」或快捷键
- **确认弹窗**：「确定删除 N 个文件/文件夹？」
- **行为**：移入系统回收站（`shell.trashItem()`），不永久删除
- **多选删除**：选中多个文件后统一删除

### 新建文件夹

- **触发**：右键菜单「新建文件夹」或工具栏按钮
- **行为**：在当前目录创建 `未命名文件夹`，自动重名处理（`未命名文件夹 (2)`）
- **自动进入重命名**：新建后立即进入重命名状态

### 复制/剪切/粘贴

| 操作 | 行为 |
|------|------|
| 复制 | 选中文件写入剪贴板（copy 模式） |
| 剪切 | 选中文件写入剪贴板（cut 模式），源文件半透明标记 |
| 粘贴 | 复制模式：复制到当前目录；剪切模式：移动到当前目录 |
| 全选 | 选中当前目录所有文件/文件夹 |

**重名处理**：粘贴时目标目录已有同名文件 → 自动追加 `(2)` `(3)` 后缀，不覆盖。

### 右键菜单

```
打开
在新标签打开
────────
复制
剪切
粘贴
────────
重命名
删除
────────
新建文件夹
────────
查看属性
```

多选右键菜单：仅显示「复制」「剪切」「删除」。

## 6. 快捷键

| 操作 | macOS | Windows/Linux |
|------|-------|---------------|
| 打开文件/文件夹 | `Cmd+O` / `Cmd+↓` | `Enter` |
| 返回上级目录 | `Cmd+↑` | `Alt+↑` |
| 后退（历史） | `Cmd+[` / `Cmd+←` | `Alt+←` |
| 前进（历史） | `Cmd+]` / `Cmd+→` | `Alt+→` |
| 重命名 | `Enter` | `F2` |
| 删除 | `Cmd+Backspace` | `Delete` |
| 复制 | `Cmd+C` | `Ctrl+C` |
| 剪切 | `Cmd+X` | `Ctrl+X` |
| 粘贴 | `Cmd+V` | `Ctrl+V` |
| 全选 | `Cmd+A` | `Ctrl+A` |
| Quick Look 预览 | `Space` | `Space` |
| 关闭预览 | `Space` / `Escape` | `Space` / `Escape` |
| 搜索文件 | `Cmd+F` | `Ctrl+F` |

### 搜索快捷键分发

`Cmd+F` 在不同标签类型下分发不同行为：
- 文件浏览器标签 → 聚焦文件搜索框
- 普通网页标签 → 打开页面内查找（FindBar）
- 全屏模式 → 忽略
- 其他内部页 → 忽略

## 7. 拖拽交互

### 从文件浏览器拖出到网页

- 选中文件 → 拖拽到 `<input type="file">` 区域 → 触发文件上传
- 拖到普通网页 → 拖拽操作被忽略

### 从网页拖拽下载到文件浏览器

- 拖拽链接/图片到文件列表区域 → 下载文件到当前目录
- 拖到左侧快捷访问的某个目录 → 下载到该目录
- 拖到地址栏 → 地址栏显示目标路径
- 视觉反馈：目标区域高亮边框，显示「释放以下载到此目录」

### 文件浏览器内部拖拽

- 拖拽文件到文件夹 → 移动文件
- 按住 `Option`(macOS) / `Ctrl`(Windows) 拖拽 → 复制文件
- 视觉反馈：目标文件夹高亮，显示「移动到 xxx」或「复制到 xxx」

## 8. FTP / SFTP 远程文件浏览

### 协议入口

| 输入 | 路由 |
|------|------|
| `ftp://192.168.1.100` | `wmfx://ftp/192.168.1.100` |
| `sftp://user@host` | `wmfx://sftp/user@host` |

### FTP 实现

- **依赖**：`basic-ftp`（纯 JS，无原生依赖）
- **连接管理**：`FileBrowserManager` 维护 `Map<sessionId, FtpClient>`
- **匿名登录**：`ftp://host` 默认匿名
- **账号登录**：`ftp://user:pass@host`，密码不持久化
- **操作**：目录列表、上传、下载、新建文件夹、重命名、删除
- **不支持**：剪切（FTP 无原子 move）

### SFTP 实现

- **依赖**：`ssh2`（基于 libssh2 原生绑定）
- **连接方式**：密码 `sftp://user:pass@host` 或密钥（弹窗选择私钥文件）
- **首次连接**：弹出主机指纹确认对话框
- **操作**：与 FTP 相同 + 剪切（SFTP 支持 `rename` 原子操作）
- **超时**：空闲 30 秒自动断开

### 远程文件浏览器 UI

- 复用本地文件浏览器 UI，左侧快捷面板替换为「连接管理」
- 地址栏显示 `ftp://host/path` 或 `sftp://user@host/path`
- 状态栏显示连接状态
- 远程模式下禁用「Quick Look 预览」

### 安全

- 密码/密钥不写入磁盘，仅存内存
- SFTP 主机指纹缓存在 `electron-store`
- FTP 明文传输提示警告

## 9. 下载集成

### 下载完成跳转

- 下载完成通知 toast 中增加「在文件浏览器中打开」按钮
- 点击后复用已有标签或新建标签，导航到下载文件所在目录，选中该文件

### 复用逻辑

```
点击「在文件浏览器中打开」
  → 主进程解析文件所在目录路径
  → 遍历所有标签，查找已有文件浏览器标签的当前路径 === 目标目录
  → 找到 → 激活该标签 + 发送选中文件事件
  → 未找到 → 新建标签导航到目标目录 + 选中文件
```

### 下载列表集成

- 每个下载项右侧增加「在文件浏览器中打开」图标按钮（`mdi:folder-open`）
- 下载列表底部增加「打开下载文件夹」按钮

## 10. 搜索

### 搜索行为

- **入口**：工具栏搜索框，`Cmd+F` / `Ctrl+F` 聚焦
- **实时过滤**：输入时按文件名模糊匹配（不区分大小写），200ms 防抖
- **搜索范围**：当前目录及其子目录（递归）
- **排序**：精确匹配 > 前缀匹配 > 包含匹配
- **限制**：最多 500 条结果，超出提示

### 搜索结果展示

- 替换文件列表区域
- 面包屑显示「搜索结果: "keyword" — 在 /path 中」
- 每行显示相对路径
- `Escape` 或点击 × 恢复正常目录视图

### 实现

- **本地文件**：主进程 `fs:searchDir` 递归遍历 + `name.toLowerCase().includes(query)`
- **大目录优化**：超过 1000 个文件时异步遍历，显示 loading
- **FTP/SFTP**：远程搜索由服务端 `find` 命令执行
- **忽略隐藏文件**：默认不搜索 `.` 开头的文件

## 11. 安全与沙箱

### 文件系统权限

- 所有 `fs` 操作在主进程，渲染端无 Node.js 访问
- IPC 处理器校验路径合法性，拒绝 `..` 路径穿越、`/proc` `/sys` 等系统目录
- 默认隐藏 `/etc/shadow`、`~/.ssh` 等敏感路径（设置可开启）

### 拖拽安全

- 网页拖入的 URL 仅支持 `http://` `https://`，拒绝危险协议
- 拖拽下载必须落到用户有写权限的目录

### 回收站

- 所有删除操作调用 `shell.trashItem()`，不直接 `fs.unlink`

## 12. 错误处理

| 错误 | 触发 | 处理 |
|------|------|------|
| 权限不足 | `EACCES` | toast 提示「无访问权限」 |
| 文件不存在 | 路径被外部删除 | toast 提示，刷新父目录 |
| 磁盘满 | 写入/复制 | toast 提示「磁盘空间不足」 |
| 重名冲突 | 粘贴/新建 | 自动追加后缀 |
| FTP 连接失败 | 网络/认证 | toast 提示错误 |
| SFTP 指纹拒绝 | 用户取消 | 中止连接 |
| 大目录加载慢 | 1000+ 文件 | loading 骨架屏 |
| 搜索超时 | 子目录过深 | 30 秒超时提示 |

所有 `fs:*` IPC 调用 wrap `try/catch`，失败返回 `{ error: string }`。

## 13. 测试策略

### 单元测试（Vitest）

| 模块 | 测试内容 |
|------|----------|
| `FileBrowserManager` | readDir、stat、mkdir、rename、delete、copy、cut、paste |
| `normalizeAddressBarInput` | 本地路径检测（Unix/Windows/相对路径/`~`） |
| `clipboardWriteFiles` / `clipboardReadFiles` | 跨应用剪贴板读写 |
| 路由解析 | `wmfx://files/...`、`wmfx://ftp/...`、`wmfx://sftp/...` |
| 搜索过滤 | 文件名模糊匹配、排序、截断 |
| 安全校验 | 路径穿越拒绝、非法字符拒绝 |

### E2E 测试（Playwright）

| 场景 | 验证点 |
|------|--------|
| 地址栏输入本地路径 | 自动切换到文件浏览器视图 |
| 目录导航 | 双击文件夹进入、面包屑点击跳转、后退/前进 |
| 文件操作 | 重命名、删除、新建文件夹 |
| Quick Look | 空格预览、←→切换、Escape 关闭 |
| 下载跳转 | 点击「在文件浏览器中打开」复用已有标签 |
| FTP 连接 | 匿名登录、目录列表、上传/下载 |
