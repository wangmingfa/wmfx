# Roadmap

本项目长期规划。各阶段已实现与待做功能如下（M1–M4 完成，M5 进行中）。

按时间顺序记录各阶段已实现与待做功能，便于后续迭代排期。

## M1 — 基础浏览（已完成）

- [x] 多标签浏览（创建/关闭/激活）
- [x] TabManager：WebContentsView 生命周期与事件监听
- [x] NavigationManager：前进/后退/刷新/停止/加载 URL
- [x] SessionManager：默认/无痕分区隔离
- [x] ChromeUI：TabBar + AddressBar + Viewport（ResizeObserver → setBounds）
- [x] IPC：TabState、BrowserViewBounds、tab:*/nav:*/session:* 通道

## M2 — 浏览增强（已完成）

- [x] DownloadManager（will-download + 进度广播）
- [x] HistoryManager（自动记录 + 去重 + 搜索）
- [x] BookmarkManager（文件夹层级 + HTML 导入/导出）
- [x] SettingsManager（electron-store：主题/缩放/打印/DevTools）
- [x] Sidebar（280px，4 视图：下载/历史/书签/设置）
- [x] DevTools（右键网页、按标签）
- [x] 打印 / PDF（printPage → toPDF）
- [x] 缩放控制（默认 100%，循环 50/75/100/125/150）
- [x] 主题切换（浅/深 + 原生 nativeTheme + CSS 变量）

## M3 — 用户体验增强（已完成）

- [x] 新标签页（搜索框 + 快捷链接 + 最近历史）
- [x] 页面内查找（Ctrl+F 滑出，上一处/下一处）
- [x] 地址栏自动补全（历史 + 书签建议，200ms 防抖）
- [x] 书签星标按钮（切换当前页书签，金色填充）
- [x] 标签拖拽排序（HTML5 DnD，持久化）
- [x] 默认搜索引擎（Google/Baidu/Bing，可切换）
- [x] 地址栏 URL 自动补 https / 非 URL 走搜索
- [x] 国际化 i18n（zh-CN / en-US / system）
- [x] 深链 / 外部链接唤起（注册 http/https 默认浏览器）
- [x] 快捷键（Cmd+L 地址栏 / Cmd+F 查找 / Cmd+W 关标签 / F5 刷新 / F12 DevTools）

## M3 Proxy — Mihomo 代理模块（已完成）

- [x] packages/proxy：ProxyManager、MihomoProcess、ConfigManager、ApiClient、HealthChecker、TrafficMonitor、CoreDownloader
- [x] SubscriptionManager（订阅解析，依赖 database）
- [x] 代理面板 UI：NodeView、SubscriptionView、TrafficView、LogView
- [x] 代理开关、节点选择、延迟测速、流量监控

## M4 — 打磨与打包（已完成）

- [x] electron-builder 三平台打包（AppImage/deb/dmg/nsis）
- [x] 会话恢复（关闭保存标签，重启恢复）
- [x] 窗口状态持久化（位置/大小）
- [x] 崩溃恢复（render-process-gone 自动 reload）
- [x] 后台标签挂起（5 分钟不活跃释放 WebContentsView）

## M5 — CI/CD 与分发（已完成）

| 任务 | 状态 | 说明 |
|------|------|------|
| GitHub Actions 三平台构建矩阵 | ✅ 已完成 | `build.yml` matrix 覆盖 linux / mac(x64+arm64) / win |
| 自动更新（electron-updater + GitHub Releases）| ✅ 已完成 | `apps/main/src/updater.ts`，CI 用 `--publish always` |
| 测试覆盖扩展（Vitest / Playwright）| ✅ 已完成 | 14+ 单元测试、多份 E2E spec |

## Phase 3.5 — 浏览器可用性补全（已完成）

> 调研补齐"可用浏览器"体验缺口，除浏览器级安全/权限（证书错误、摄像头/麦克风/定位弹窗）外。

- [x] **多窗口支持** — 新建/管理多个浏览器窗口（Cmd+Shift+N 普通窗口、Cmd+N 亦可用；菜单「新建窗口」），关末标签不再强制退出；复用已留的 `browserInstances` Map，每个窗口独立 TabManager / NavigationManager / DownloadManager / PopoverManager，共享同一 Mihomo 代理核心；窗口关闭时反注册实例，macOS 关掉最后窗口保留进程供 Dock 再激活
- [x] **清除浏览数据 UI** — 清除 Cookie / 缓存 / localStorage / 表单数据的设置页与 IPC（`session.clearStorageData`）；设置页隐私分区 + 三点菜单「清空缓存」共用弹窗（Electron 不支持时间范围过滤，故按全量清除）
- [x] **标签悬停缩略图** — 鼠标悬停标签显示页面预览（`captureThumbnail`）
- [x] **下载闭环** — 下载项"在文件夹中显示"（`shell.showItemInFolder`）、完成通知、安全扫描提示
- [x] **书签栏常驻** — 地址栏下方常驻书签栏，HTML 导入保留原文件夹层级（`bookmark-manager.ts` 已修复 `parent_id: null` 拍平）
- [x] **历史按日期分组** — "今天/昨天/本周/更早"分组渲染，搜索结果同样分组
- [x] **启动行为 / 主页设置** — 设置页可选手动主页、启动时打开新标签页/上次会话/主页（`SettingsManager.launchBehavior`：`restore | newtab | homepage`）
- [x] **搜索实时建议（Omnibox）** — 主进程抓取搜索引擎实时建议（Google/Baidu/Bing），与本地 history+bookmark 合并排序，带总开关（SettingsManager.searchSuggestions）
- [x] **独立无痕窗口** — 整窗隔离的无痕窗口（Cmd+Shift+N），使用独立内存 partition（sessionId='incognito'），不落盘会话/尺寸，关闭即焚（最后一个无痕窗口关闭时清空内存 partition 存储）；由 `createWindow({incognito:true})` 与 `openIncognitoWindow` 实现。渲染端配套：挂载时通过 `window:getInfo` 感知无痕窗口，整窗外壳切换深紫灰无痕主题（`.chrome-ui--incognito` + CSS 变量覆盖）、标签栏无痕底色、右下角「无痕窗口」指示徽标；应用菜单在无痕窗口内将「新建隐身标签页」替换为禁用态的「无痕窗口」状态项
- [ ] **远程调试端口** — `--remote-debugging-port` 支持
- [x] **撤销关闭标签（Cmd+Shift+T）** — 维护最近关闭标签栈，重开已关标签
- [x] **字体 / 编码设置** — 默认字体（system-ui/sans-serif/serif/monospace）、字号（12-24px）、编码（UTF-8/GBK/Big5 等），通过 `SettingsManager` 持久化，页面加载时注入 `document.documentElement.style` 与 `document.charset`
- [x] **阅读模式 / 页面级暗色注入** — 阅读模式（`@mozilla/readability` esbuild 打包 IIFE 提取正文 + 双 WebContentsView 切换，原网页 `setVisible` 隐藏不销毁，`wmfx://reader` 渲染，DOMPurify 消毒正文）；页面级暗色注入（CSS 滤镜反色，仅外部 http(s) 页，跟随全局主题，导航/主题切换重注入，全量导航后重置 key）；地址栏阅读模式按钮（仅外部页）；`PageEnhanceManager` + `TabManager` 编排

## Phase 4 — 增强能力（进行中）

- [x] 广告拦截（Ad blocker）— 基于 `session.webRequest.onBeforeRequest` 拦截广告/追踪请求；内置常见广告/追踪域名清单（零依赖、免联网）+ 用户自定义黑名单/白名单（SettingsManager 持久化）；开关 `adBlockEnabled` 默认开；设置-隐私页提供开关与拦截统计；`SessionManager` 在每个新建 session 幂等挂载
- [x] 请求拦截（Request interception）— `RequestCapturer` 全应用捕获请求并推送到 `wmfx://interceptor` 页面，规则持久化（`interceptorRules`/`interceptorEnabled`），`index.ts` 共享挂载
- [x] 密码管理器（Password manager）— `wmfx://passwords` 内部页：列表/搜索/新增/编辑/删除，密码复制与显隐；主进程 `PasswordManager` 以 electron-store 持久化、落盘经 `safeStorage`（OS 密钥链）加密，明文不写磁盘；变更经 `passwords:changed` 广播；应用菜单新增「密码」入口
- [ ] 工作区（Workspace）
- [ ] 分屏视图（Split view）
- [x] 垂直标签（Vertical tabs）— `VerticalTabBar` 组件（自动折叠/展开），`SettingsManager.tabBarPosition`（`top`/`left`）切换，外观设置页提供选项

## Phase 5 — AI 与自动化（未开始）

- [ ] AI 侧边栏（AI sidebar）
- [ ] 页面摘要（Summarize page）
- [ ] 代理自动化（Agent automation）
- [ ] 工作流录制（Workflow recorder）
- [ ] MCP 接入
- [ ] 智能表单（Smart forms）

## Phase 6 — 文件浏览器（已完成）

> 在浏览器外壳内提供本地/远程文件管理能力，可像访问网页一样浏览/打开/管理文件。
> 设计文档：[`docs/superpowers/specs/2026-07-18-file-browser-design.md`](./docs/superpowers/specs/2026-07-18-file-browser-design.md)

### 6.1 基础框架（已完成）

- [x] **入口与路由** — 地址栏本地路径检测（Unix/Windows/`~`/相对路径）、`wmfx://files`、`wmfx://ftp`、`wmfx://sftp` 三个路由前缀、`INTERNAL_ROUTE_PREFIXES` / `INTERNAL_TITLE_MAP` 更新
- [x] **FileBrowserManager** — 主进程核心模块：`readDir`、`stat`、`mkdir`、`rename`、`delete`、`copy`、`cut`、`paste`，IPC 通道定义（`fs:readDir` 等 15+ 通道），`FileEntry` / `FileStat` / `ClipboardData` 类型
- [x] **FilesView 基础 UI** — `wmfx://files` Vue 组件，`PageLayout` 包装，右侧文件列表（图标/列表视图切换），面包屑导航，状态栏
- [x] **地址栏文件图标** — 文件浏览器标签地址栏左侧显示 `mdi:folder`，非文件标签恢复地球图标

### 6.2 文件操作

- [x] **打开与导航** — 双击文件夹进入、双击文件调用 `shell.openPath()`、后退/前进历史栈
- [x] **重命名** — `Enter`(macOS) / `F2`(Windows) 触发内联编辑，非法字符/重名校验
- [x] **删除** — `shell.trashItem()` 移入回收站，确认弹窗，多选批量删除
- [x] **新建文件夹** — 自动重名处理，新建后立即进入重命名状态
- [x] **复制/剪切/粘贴** — 跨应用系统剪贴板集成（`clipboard.readFiles()` + 平台原生写入），应用内剪贴板状态，重名自动追加后缀
- [x] **右键菜单** — 完整菜单结构，多选模式裁剪

### 6.3 快捷键

- [x] **平台适配快捷键** — macOS/Windows 差异化：打开(`Cmd+O`/`Enter`)、上级(`Cmd+↑`/`Alt+↑`)、后退/前进(`Cmd+[` `Cmd+]`/`Alt+←` `Alt+→`)、删除(`Cmd+Backspace`/`Delete`)、全选(`Cmd+A`/`Ctrl+A`)
- [x] **搜索快捷键分发** — `Cmd+F` 按标签类型分发：文件浏览器→文件搜索，普通网页→FindBar

### 6.4 Quick Look 快速预览

- [x] **预览面板 UI** — 浮动面板 + 半透明遮罩，文件名/尺寸/信息展示，关闭按钮
- [x] **预览内容渲染** — 图片(`<img>`)、文本(`<pre>`+语法高亮)、PDF(`<iframe>`)、音频(`<audio>`)、视频(`<video>`)
- [x] **预览键盘导航** — `Space`/`Escape` 关闭，`←` `→` 切换文件，`fs:readFilePreview` IPC（大文件>10MB 仅显示元信息）

### 6.5 快捷访问与书签

- [x] **左侧快捷面板** — 240px 固定宽度，系统目录（桌面/下载/文档/图片/音乐/视频）自动检测
- [x] **用户书签** — `SettingsManager.fileBookmarks` 持久化，添加/移除/拖拽排序，右键菜单（新标签页打开/重命名/删除）

### 6.6 搜索

- [x] **目录内搜索** — 工具栏搜索框，200ms 防抖实时过滤，递归子目录，最多 500 条结果（敏感目录跳过、根受限静默返回）
- [x] **搜索结果展示** — 替换文件列表，显示相对路径，命中文件名高亮，`Escape` 恢复

### 6.7 拖拽交互（✅ 已完成）

- [x] **文件拖出** — 拖拽到网页 `<input type="file">` 触发上传
- [x] **链接拖入下载** — 网页链接/图片拖入文件列表区域 → 下载到当前目录
- [x] **内部拖拽移动/复制** — 拖到文件夹移动，`Option`/`Ctrl` 拖拽复制

### 6.8 下载集成（✅ 已完成）

- [x] **下载完成跳转** — 通知 toast「在文件浏览器中打开」，复用已有标签逻辑（`findTabByUrl` 匹配）
- [x] **下载列表按钮** — 每项增加 `mdi:folder-open` 按钮，底部「打开下载文件夹」

### 6.9 FTP / SFTP（✅ 已完成）

- [x] **FTP 支持** — `basic-ftp` 依赖，匿名/账号登录，目录列表/上传/下载/新建/重命名/删除
- [x] **SFTP 支持** — `ssh2` 依赖，密码/密钥登录，主机指纹确认，原子重命名（支持剪切）
- [x] **远程 UI** — 复用本地文件浏览器 UI，左侧替换为连接管理，状态栏显示连接状态，禁用 Quick Look

### 6.10 安全与错误处理（✅ 已完成）

- [x] **路径校验** — `validatePath()` 拒绝 `..` 穿越、系统敏感目录，统一 `FileBrowserError` 错误对象
- [x] **回收站** — 所有删除走 `shell.trashItem()`
- [x] **错误 UI** — `NMessageProvider` toast 提示（权限不足/文件不存在/磁盘满等），大目录 shimmer 骨架屏

### 6.11 测试（✅ 已完成）

- [x] **单元测试** — `isLocalPath`/`normalizeLocalPath` 路径检测、文件操作逻辑（readDir/stat/copy/mkdir/searchDir/readFilePreview）、回收站 shell.trashItem 调用
- [x] **E2E 测试** — 地址栏导航到文件浏览器、文件浏览器 UI（侧边栏/面包屑/工具栏/搜索）、安全校验（路径穿越/敏感目录/ node_modules）、Quick Look 预览、下载页面集成

### 6.12 框选交互（✅ 已完成）

- [x] **鼠标拖拽框选（Marquee selection）** — 按选中态分语义：`draggable` 动态下沉（未选中项仅内容子元素可拖）/提升（已选中整行可拖整批）；空白/列间隙 mousedown 启动半透明矩形框选，图标视图矩形包围盒相交、列表视图行区间命中；无修饰键框选清空原选择、Ctrl/⌘ 对称差切换、位移 <4px 视为单击空白清空；拖已选中批携带整批路径

## Phase 7 — 创意库（进行中）

> 6.7/6.8/6.9/6.10/6.11/6.12 已 ✅ 完成，Phase 6 全部完成。下一步：Phase 7 创意库评估，随后代码签名（发布前置）

> 发散创意收集，覆盖效率 / AI / 极客 / 隐私 / 平台 / 体验多方向，待评估可行性后落地。

### 效率 / 个人知识管理
- [ ] **剪藏与标注** — 选中网页内容一键存为笔记，支持高亮、批注、分类，本地知识库
- [ ] **网页截图与长截图** — 整页/区域截图，OCR 提取文字，存本地或图床
- [ ] **稍后读（Read Later）** — 离线缓存文章，无网可读
- [ ] **标签堆叠 / 分组增强** — 标签堆叠收起，按主题聚合
- [x] **命令面板（Cmd+K）** — 类 Raycast/Spotlight，全局搜标签/书签/历史/命令/文件；`commandPalette:getData`/`execute`/`saveRecent` IPC + 静态命令注册表 + 模糊匹配 + `CommandPalettePanel` UI，快捷键 `Cmd+K` 注册
- [ ] **剪贴板管理器** — 历史剪贴板，多格式（文字/图片/代码）回贴
- [ ] **定时任务** — 定时刷新某页、定时清 Cookie、定时打开指定站点

### AI / 自动化
- [ ] **AI 划词翻译 / 对照** — 选中即译，双语对照阅读外文站
- [ ] **网页转结构化数据** — 任意页一键抽取为表格/JSON，导出 CSV
- [ ] **智能填表** — 基于历史/密码库自动推断并填充表单
- [ ] **对话式网页控制** — 自然语言驱动页面操作（"加入购物车"等）
- [ ] **本地 LLM 模式** — 离线跑小模型，隐私零外传
- [ ] **RPA 录制回放** — 录制操作序列定时执行

### 极客 / 开发者 / 协议
- [ ] **更多协议支持** — `telnet://`、`redis://`、`mysql://` 客户端、`docker://` 管理
- [ ] **内置终端** — 侧边/底部嵌本地 shell（node-pty），与文件浏览器联动
- [ ] **API 调试器** — 类 Postman，浏览器内发请求、看响应
- [ ] **网络抓包增强** — 导出 HAR、重放请求、Mock 响应
- [ ] **WebSocket 客户端** — 订阅/调试 WS 流
- [ ] **代码预览增强** — `view-source` + 语法高亮 + 本地文件高亮查看
- [ ] **远程桌面 / VNC** — 地址栏 `vnc://` 直连

### 隐私 / 安全
- [ ] **指纹保护** — 随机 UA / Canvas / WebRTC 防追踪
- [ ] **一次性邮箱 / 手机号** — 注册时自动生成临时身份
- [ ] **加密笔记保险箱** — 本地加密密码/密钥库，主密码解锁
- [ ] **访问审计日志** — 记录所有访问站点，防蹭用

### 同步 / 平台 / 协作
- [ ] **端到端加密同步** — 书签/历史/设置跨设备
- [ ] **浏览器内即时通讯** — 侧边栏常驻微信/Telegram/Slack 网页版
- [ ] **共享标签页** — 生成临时链接把当前会话发给他人
- [ ] **插件 / 脚本商店** — 油猴脚本 + 原生扩展市场
- [ ] **多账号容器** — 同站多登录态隔离（类 Firefox Containers）

### 体验 / 趣味
- [ ] **主题市场** — 用户上传/下载 CSS 主题
- [ ] **手势导航** — 鼠标轨迹手势（右划返回等）
- [ ] **语音控制** — "打开百度""关闭这个标签"
- [ ] **离线 PWA 应用库** — 常用 PWA 当 App 装进启动器
- [ ] **游戏 / 彩蛋模式** — 新标签页小游戏、键盘音效

## 发布前置（最后做）

- [ ] **代码签名** — macOS Apple Developer ID + notarize、Windows Authenticode；需在 `electron-builder.config.ts` 与 `build.yml` 配 `CSC_LINK` / `CSC_KEY_PASSWORD` secret，依赖开发者账号（原属 M5，因依赖开发者账号且为发布前置，移至最后）

## 其它可选项（架构设计提及但未见实现）

- [ ] 扩展系统（ExtensionManager）
- [ ] 权限管理（PermissionManager：摄像头 / 麦克风 / 剪贴板 / 通知 / 定位 / 文件系统）

---

### 说明

- 优先级建议：先收尾 **M5 代码签名**（发布前置），再按需推进 Phase 3.5 的可用性补全（多窗口、清除数据、下载闭环），随后 Phase 4 的体验型功能（垂直标签、分屏、工作区），Phase 5 的 AI 能力作为差异化卖点放在后期。
- 每个条目建议落地时拆成独立 OpenSpec change，包含 design / specs / tasks 再进入实现。
