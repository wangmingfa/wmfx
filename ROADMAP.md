# Roadmap

本项目长期规划。已完成的里程碑见 [`AGENTS.md`](./AGENTS.md)（M1–M4 完成，M5 进行中）。

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

## M5 — CI/CD 与分发（进行中）

| 任务 | 状态 | 说明 |
|------|------|------|
| GitHub Actions 三平台构建矩阵 | ✅ 已完成 | `build.yml` matrix 覆盖 linux / mac(x64+arm64) / win |
| 自动更新（electron-updater + GitHub Releases）| ✅ 已完成 | `apps/main/src/updater.ts`，CI 用 `--publish always` |
| 测试覆盖扩展（Vitest / Playwright）| ✅ 已完成 | 14+ 单元测试、多份 E2E spec |

## Phase 3.5 — 浏览器可用性补全（未开始）

> 调研补齐"可用浏览器"体验缺口，除浏览器级安全/权限（证书错误、摄像头/麦克风/定位弹窗）外。

- [ ] **多窗口支持** — 新建/管理多个浏览器窗口（Cmd+Shift+N），关末标签不再强制退出；复用已留的 `browserInstances` Map
- [ ] **清除浏览数据 UI** — 清除 Cookie / 缓存 / localStorage / 表单数据的设置页与 IPC（`session.clearStorageData`）
- [ ] **标签悬停缩略图** — 鼠标悬停标签显示页面预览（`captureThumbnail`）
- [ ] **下载闭环** — 下载项"在文件夹中显示"（`shell.showItemInFolder`）、完成通知、安全扫描提示
- [ ] **书签栏常驻** — 地址栏下方常驻书签栏；HTML 导入保留原文件夹层级（修复 `bookmark-manager.ts` 拍平 `parent_id: null`）
- [ ] **历史按日期分组** — "今天/昨天/更早"分组渲染与导出
- [ ] **启动行为 / 主页设置** — 可选手动主页、启动时打开主页/上次会话/指定页
- [ ] **搜索实时建议（Omnibox）** — 向搜索引擎请求的实时补全，而非仅本地历史+书签
- [ ] **独立无痕窗口** — 整窗隔离的无痕窗口，而非当前窗口内的无痕标签
- [ ] **远程调试端口** — `--remote-debugging-port` 支持
- [ ] **撤销关闭标签（Cmd+Shift+T）** — 维护最近关闭标签栈，重开已关标签
- [ ] **字体 / 编码设置** — 默认页面字体、字号、编码（当前仅全局缩放）
- [ ] **阅读模式 / 页面级暗色注入** — 阅读模式与强制暗色网站 CSS 注入（当前仅外壳主题跟随系统）

## Phase 4 — 增强能力（未开始）

- [ ] 广告拦截（Ad blocker）
- [ ] 请求拦截（Request interception）
- [ ] 密码管理器（Password manager）
- [ ] 工作区（Workspace）
- [ ] 分屏视图（Split view）
- [ ] 垂直标签（Vertical tabs）

## Phase 5 — AI 与自动化（未开始）

- [ ] AI 侧边栏（AI sidebar）
- [ ] 页面摘要（Summarize page）
- [ ] 代理自动化（Agent automation）
- [ ] 工作流录制（Workflow recorder）
- [ ] MCP 接入
- [ ] 智能表单（Smart forms）

## Phase 6 — 文件浏览器（未开始）

> 在浏览器外壳内提供本地文件管理能力，可像访问网页一样浏览/打开/管理本地文件。

- [ ] **文件浏览器视图** — 地址栏输入 `file://` 路径或侧边栏入口进入本地文件系统浏览，类似 Chrome 的 `file://` 内置页面
- [ ] **文件/目录列表** — 图标/列表视图、排序（名称/大小/修改时间）、返回上级、面包屑路径导航
- [ ] **文件操作** — 打开（用系统关联程序）、重命名、删除、复制/剪切/粘贴、新建文件夹
- [ ] **拖拽与上传** — 从文件浏览器拖拽文件到网页（上传）、从网页拖拽下载到本地目录
- [ ] **文件预览** — 图片/文本/PDF/音视频内置预览，而非强制调用外部程序
- [ ] **书签/快捷访问** — 常用目录（桌面/下载/文档）固定、最近访问目录
- [ ] **搜索** — 当前目录及子目录按文件名/类型搜索
- [ ] **与下载集成** — 下载目录一键跳转文件浏览器对应位置
- [ ] **FTP / FTPS 支持** — 地址栏输入 `ftp://` 浏览远程 FTP 服务器，支持匿名/账号登录、上传/下载/目录操作（建议基于 `basic-ftp`）
- [ ] **SFTP / SSH 支持** — 地址栏输入 `ssh://` 或 `sftp://` 通过 SSH 协议浏览远程文件系统，支持密钥/密码登录、远程文件上传下载与编辑（建议基于 `ssh2`）

## Phase 7 — 创意库（未开始）

> 发散创意收集，覆盖效率 / AI / 极客 / 隐私 / 平台 / 体验多方向，待评估可行性后落地。

### 效率 / 个人知识管理
- [ ] **剪藏与标注** — 选中网页内容一键存为笔记，支持高亮、批注、分类，本地知识库
- [ ] **网页截图与长截图** — 整页/区域截图，OCR 提取文字，存本地或图床
- [ ] **稍后读（Read Later）** — 离线缓存文章，无网可读
- [ ] **标签堆叠 / 分组增强** — 标签堆叠收起，按主题聚合
- [ ] **命令面板（Cmd+K）** — 类 Raycast/Spotlight，全局搜标签/书签/历史/命令/文件
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
