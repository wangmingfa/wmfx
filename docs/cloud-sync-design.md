# 设置云同步设计方案

## 1. 目标

支持将 WMFX 的应用设置、书签、历史记录、密码、订阅等数据同步到云端，实现跨设备备份与恢复。

**不做实时双向同步**，做"导出到云端备份 + 从云端恢复"。双向实时同步（冲突合并）复杂度指数级上升，先做单向。

## 2. 数据流

```
┌──────────────┐    加密    ┌──────────┐   WebDAV   ┌──────────┐
│  本地数据    │ ─────────► │  加密包  │ ─────────► │ 云存储   │
│ (JSON/SQLite)│            │ (.wmfx.b64)│            │ (WebDAV) │
└──────────────┘            └──────────┘            └──────────┘
```

## 3. 加密方案（关键）

**用户输入一个密码，不存储密码，只存 Key。**

```
用户密码
  │
  ├─► PBKDF2-SHA256(iterations=100000, salt=random 16B)
  │     └─► masterKey (32B)
  │
  ├─► AES-GCM(key=masterKey, nonce=随机 12B)
  │     └─► encryptedPayload
  │
  └─► 上传: {
       salt: base64(salt),
       nonce: base64(nonce),
       ciphertext: base64(encryptedPayload),
       version: "1"
     }
```

**为什么这个方案安全：**
- 密码永远不离开用户本地
- 每次加密用随机 salt + nonce
- 即使云盘被攻破，攻击者拿到的是密文，无法解密
- 换密码只需重新加密上传，不需要迁移云盘

**前端密钥派生（在 renderer 做，主进程不碰明文密码）：**
```ts
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}
```

## 4. 存储模型

每个同步对象是一个 JSON，结构：

```ts
interface CloudSyncPackage {
  version: '1'
  salt: string       // base64
  nonce: string      // base64
  ciphertext: string // base64
  schemaVersion: number // 本地数据 schema 版本号
  exportedAt: number // unix ms
}
```

云端路径约定：

```
.wmfx/
├── settings.wmfx       # 应用设置 + 书签 + 历史 + 密码 + 订阅
├── _meta.json          # 版本号、导出时间、设备名（未加密的元信息）
```

## 5. WebDAV 协议抽象

WebDAV 核心只需要 5 个操作，全部走 HTTP：

```
PROPFIND / ->  列举文件
GET          -> 下载
PUT          -> 上传
DELETE       -> 删除
MKCOL        -> 创建目录
```

Electron 原生支持 `net` / `net.request`，不需要额外依赖。

## 6. Provider 抽象层

```ts
interface CloudProvider {
  name: 'webdav' | 'nutstore' | 'onedrive' | ...
  displayName: string
  connectInfo: { host?: string; username?: string; password?: string }
  capabilities: { read: boolean; write: boolean }
}

interface CloudStorage {
  list(path: string): Promise<FileInfo[]>
  download(path: string): Promise<Buffer>
  upload(path: string, data: Buffer): Promise<void>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}
```

初始只做 **WebDAV** provider，未来扩展其他 provider 只需加新实现类。

## 7. 交互流程

### 7.1 连接云盘

**WebDAV 模式（直接填）：**
```
云同步设置
├── 网盘类型 [ 下拉: WebDAV / 坚果云 / OneDrive ]
├── WebDAV 地址 [ https://dav.example.com/wmfx/ ]
├── 用户名       [ xxx ]
├── 密码         [ ******** ]
└── [ 测试连接 ] [ 连接 ]
```

坚果云 / OneDrive 可以做成预设模板，填入后自动填好 WebDAV 地址。

**扫码模式（针对支持 OAuth 的 provider）：**
先不做。WebDAV 不需要扫码，填凭证即可。如果未来接 Google Drive / OneDrive 的 OAuth，再加扫码。

### 7.2 设置同步密码

首次连接成功后，弹窗要求用户输入同步密码（≥8 位）：
- 用户输入密码 → 确认 → 本地派生密钥
- 密钥只存到内存，退出应用后丢弃
- 下次打开应用时，用户需重新输入同步密码

**不存密码到硬盘。**

### 7.3 同步操作

顶部工具栏加一个云同步按钮：

```
云同步面板
├── 已连接: WebDAV (dav.example.com)
├── 上次同步: 2 小时前
├── [ 同步到云端 ]    <- 加密本地数据 → 上传
├── [ 从云端恢复 ]    <- 下载 → 输入密码 → 解密 → 提示覆盖/合并
└── 同步日志
    └── 2026-08-06 11:00  同步成功 (2.3 MB)
```

### 7.4 恢复流程

```
用户点 [从云端恢复]
  → 下载 .wmfx/settings.wmfx
  → 弹窗输入密码
  → 解密
  → 校验 schema 版本兼容性
  → 展示数据概览（书签 N 条、历史 N 条、密码 N 条）
  → 选择：
      1. 覆盖当前数据（推荐：先备份当前数据）
      2. 合并（保留本地新增的，覆盖云端的旧数据）
```

## 8. 安全边界

| 项目 | 说明 |
|------|------|
| 密码明文 | 永远不在磁盘、不在网络 |
| 云端数据 | 全量 AES-256-GCM 加密，云盘服务商无法读取 |
| 密钥派生 | 仅在 renderer 进程内存中，不传给主进程 |
| 主进程 | 只处理密文 Blob（Buffer），不接触明文 |
| IPC 调用 | renderer 派生密钥 → 解密数据 → 返回明文给主进程使用 |
| 撤销 | 换密码 = 重新加密 → 覆盖云端密文 |

## 9. 实现拆分

| 模块 | 文件 | 职责 |
|------|------|------|
| `lib/crypto` | `apps/main/src/lib/crypto.ts` | PBKDF2 + AES-GCM 加密/解密 |
| `lib/cloud-sync` | `apps/main/src/lib/cloud-sync/` | 同步核心 |
| `  webdav-client.ts` | | WebDAV HTTP 操作封装 |
| `  provider-webdav.ts` | | WebDAV provider 实现 |
| `  manager.ts` | | 连接管理、同步编排 |
| `  types.ts` | | 类型定义 |
| `components/` | `apps/renderer/src/components/cloud-sync/` | UI 面板 |
| `  CloudSyncSettings.vue` | | 连接设置面板 |
| `  CloudSyncPanel.vue` | | 同步操作面板 |
| `ipc` | `apps/main/src/ipc/register.ts` | 新增 `cloud-sync:*` IPC |

## 10. 数据范围

| 数据 | 是否同步 | 备注 |
|------|---------|------|
| 应用设置（theme/shortcut/engine） | ✅ | JSON |
| 书签 | ✅ | SQLite → 导出 JSON |
| 历史记录 | ✅ | SQLite → 导出 JSON |
| 密码（已加密） | ✅ | SQLite 原文（密码本身已加密） |
| 订阅（代理/广告规则） | ✅ | JSON |
| 当前打开的标签页 | ⚠️ 可选 | 用户勾选 |
| 应用本地缓存（下载、扩展） | ❌ | 体积大，不适合 |

## 11. 优先级

**P0（MVP，2-3 天）**
- WebDAV client + 同步密码流程
- 导出/恢复 UI
- 设置 + 书签 + 历史同步

**P1**
- 密码 + 订阅同步
- 坚果云一键预设

**P2**
- 扫码 OAuth 支持（Google Drive / OneDrive）
- 多设备冲突合并

## 12. 风险

1. **用户忘记密码 = 数据丢失**。必须强提醒用户记住密码，并且不能通过"找回密码"恢复。
2. **WebDAV 稳定性** — 不同 WebDAV 实现的 PROPFIND 返回格式略有差异，需要适配。
3. **大文件性能** — 历史/书签数据量大时需要分片或压缩（建议 gzip 压缩后再加密）。