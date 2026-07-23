# QuickLook 共享布局动画实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现从缩略图位置到全屏位置的平滑动画效果，支持图片尺寸预获取和动态 layoutId 跟踪

**Architecture:** 使用 motion-v 的共享布局动画，通过 `layoutId` 属性在缩略图和预览面板之间建立关联。提前获取图片尺寸信息，支持动态切换图片时的动画跟踪。

**Tech Stack:** Vue 3, TypeScript, motion-v, sharp

## Global Constraints

- 使用 `bun` 作为包管理器
- 所有代码必须通过 TypeScript 类型检查
- 动画时长 200ms，缓动函数 ease-out
- 移除 `isDir` 字段，改用 `type === 'directory'`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/ipc-contract/src/types.ts` | 修改 | 定义 FileType、ImageInfo 等类型，重构 FileEntry |
| `apps/main/src/file-browser-manager.ts` | 修改 | readDir 方法中获取图片尺寸 |
| `apps/renderer/src/main.ts` | 修改 | 注册 MotionPlugin |
| `apps/renderer/src/views/files/FileThumbnail.vue` | 修改 | 添加 layoutId 属性 |
| `apps/renderer/src/views/files/QuickLookPanel.vue` | 修改 | 使用 motion.div 包装，添加 AnimatePresence |
| `apps/renderer/src/views/files/useQuickLook.ts` | 修改 | 添加 currentPreviewFile 计算属性 |
| 所有使用 `entry.isDir` 的文件 | 修改 | 改为 `entry.type === 'directory'` |

---

## 任务分解

### Task 1: 重构 FileEntry 类型系统

**Files:**
- Modify: `packages/ipc-contract/src/types.ts`

**Interfaces:**
- Produces: `FileType`, `ImageInfo`, `VideoInfo`, `AudioInfo`, `FileExtraInfo`, `FileEntry`

- [ ] **Step 1: 读取当前 types.ts 文件**

```bash
cat packages/ipc-contract/src/types.ts
```

- [ ] **Step 2: 添加新类型定义**

在文件开头添加：

```typescript
// 文件类型枚举
export type FileType = 'directory' | 'image' | 'video' | 'audio' | 'document' | 'unknown'

// 图片信息
export interface ImageInfo {
  width: number
  height: number
}

// 视频信息（未来扩展）
export interface VideoInfo {
  duration: number
  width: number
  height: number
}

// 音频信息（未来扩展）
export interface AudioInfo {
  duration: number
  bitrate: number
}

// 文件附加信息联合类型
export type FileExtraInfo = ImageInfo | VideoInfo | AudioInfo
```

- [ ] **Step 3: 重构 FileEntry 接口**

找到 FileEntry 接口，替换为：

```typescript
export interface FileEntry {
  name: string
  path: string
  type: FileType  // 替换 isDir
  size: number
  mtime: number
  info?: FileExtraInfo
}
```

- [ ] **Step 4: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 5: Commit**

```bash
git add packages/ipc-contract/src/types.ts
git commit -m "refactor:重构 FileEntry 类型，添加 FileType 和 ImageInfo"
```

---

### Task 2: 主进程获取图片尺寸

**Files:**
- Modify: `apps/main/src/file-browser-manager.ts`

**Interfaces:**
- Consumes: `FileType`, `ImageInfo` from Task 1
- Produces: `getImageDimensions()` 函数

- [ ] **Step 1: 读取当前 file-browser-manager.ts 文件**

```bash
cat apps/main/src/file-browser-manager.ts | head -100
```

- [ ] **Step 2: 添加 sharp 导入**

在文件顶部添加：

```typescript
import sharp from 'sharp'
```

- [ ] **Step 3: 添加图片扩展名集合**

```typescript
// 只对图片文件读取尺寸
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'])
```

- [ ] **Step 4: 添加 getImageDimensions 函数**

```typescript
async function getImageDimensions(filePath: string): Promise<ImageInfo | undefined> {
  try {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return undefined
    }
    
    const metadata = await sharp(filePath).metadata()
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height }
    }
  } catch {
    // 忽略读取失败的图片
  }
  return undefined
}
```

- [ ] **Step 5: 修改 readDir 方法**

找到 readDir 方法中构建 FileEntry 的部分，修改为：

```typescript
// 获取文件类型
function getFileType(entry: Dirent, stats: Stats): FileType {
  if (entry.isDirectory()) {
    return 'directory'
  }
  
  const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image'
  }
  
  // 可以在这里添加更多类型判断
  return 'unknown'
}

// 在 readDir 方法中并行获取图片尺寸
async function readDir(dirPath: string): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  
  const fileEntries: FileEntry[] = []
  
  // 并行处理所有文件
  await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dirPath, entry.name)
      const stats = await fs.stat(filePath)
      
      const type = getFileType(entry, stats)
      const info = type === 'image' ? await getImageDimensions(filePath) : undefined
      
      fileEntries.push({
        name: entry.name,
        path: filePath,
        type,
        size: stats.size,
        mtime: stats.mtimeMs,
        info
      })
    })
  )
  
  return fileEntries
}
```

- [ ] **Step 6: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 7: Commit**

```bash
git add apps/main/src/file-browser-manager.ts
git commit -m "feat:主进程获取图片尺寸信息"
```

---

### Task 3: 注册 MotionPlugin

**Files:**
- Modify: `apps/renderer/src/main.ts`

**Interfaces:**
- Consumes: `motion-v` library
- Produces: 全局 MotionPlugin 注册

- [ ] **Step 1: 安装 motion-v**

```bash
bun add motion-v
```

- [ ] **Step 2: 读取 main.ts 文件**

```bash
cat apps/renderer/src/main.ts
```

- [ ] **Step 3: 添加 MotionPlugin 导入**

在文件顶部添加：

```typescript
import { MotionPlugin } from 'motion-v'
```

- [ ] **Step 4: 注册插件**

在 `app.use(...)` 区域添加：

```typescript
app.use(MotionPlugin)
```

- [ ] **Step 5: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/main.ts package.json bun.lock
git commit -m "feat:注册 MotionPlugin"
```

---

### Task 4: 修改 FileThumbnail 组件

**Files:**
- Modify: `apps/renderer/src/views/files/FileThumbnail.vue`

**Interfaces:**
- Consumes: `FileEntry` from Task 1
- Produces: 带有 `layoutId` 的缩略图组件

- [ ] **Step 1: 读取 FileThumbnail.vue 文件**

```bash
cat apps/renderer/src/views/files/FileThumbnail.vue
```

- [ ] **Step 2: 添加 motion 导入**

```typescript
import { motion } from 'motion-v'
```

- [ ] **Step 3: 修改 img 元素为 motion.img**

找到 `<img` 元素，替换为：

```vue
<motion.img
  v-if="status === 'loading' || status === 'loaded'"
  :layout-id="`thumbnail-${file.path}`"
  :src="thumbnailUrl"
  :alt="file.name"
  class="file-thumbnail-img"
  @load="onLoad"
  @error="onError"
/>
```

- [ ] **Step 4: 更新 type 判断逻辑**

找到使用 `isDir` 的地方，改为 `type === 'directory'`

- [ ] **Step 5: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 6: Commit**

```bash
git add apps/renderer/src/views/files/FileThumbnail.vue
git commit -m "feat:FileThumbnail 添加 layoutId 属性"
```

---

### Task 5: 修改 QuickLookPanel 组件

**Files:**
- Modify: `apps/renderer/src/views/files/QuickLookPanel.vue`

**Interfaces:**
- Consumes: `FileEntry`, `motion-v`, `AnimatePresence`
- Produces: 带有动画的预览面板

- [ ] **Step 1: 读取 QuickLookPanel.vue 文件**

```bash
cat apps/renderer/src/views/files/QuickLookPanel.vue
```

- [ ] **Step 2: 添加 motion 和 AnimatePresence 导入**

```typescript
import { motion, AnimatePresence } from 'motion-v'
```

- [ ] **Step 3: 添加 computeFinalBounds 函数**

```typescript
function computeFinalBounds(imageWidth: number, imageHeight: number) {
  const maxW = window.innerWidth * 0.9
  const maxH = window.innerHeight * 0.8
  const scale = Math.min(maxW / imageWidth, maxH / imageHeight, 1)
  return {
    width: Math.round(imageWidth * scale),
    height: Math.round(imageHeight * scale)
  }
}
```

- [ ] **Step 4: 添加 currentPreviewFile 计算属性**

```typescript
const currentPreviewFile = computed(() => {
  if (store!.previewData.value) {
    return store!.previewData.value.fileName
  }
  return null
})
```

- [ ] **Step 5: 修改模板结构**

将整个模板替换为：

```vue
<template>
  <Teleport to="body">
    <motion.div
      class="quick-look-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      @click="store!.closePreview()"
    >
      <motion.div
        :layout-id="`thumbnail-${currentPreviewFile}`"
        class="quick-look-panel"
        :class="{ 'quick-look--unknown': store!.previewData.value?.type === 'unknown' }"
        @click.stop
      >
        <!-- 内容保持不变 -->
      </motion.div>
    </motion.div>
  </Teleport>
</template>
```

- [ ] **Step 6: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 7: Commit**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat:QuickLookPanel 添加共享布局动画"
```

---

### Task 6: 迁移所有 isDir 使用

**Files:**
- Modify: 所有使用 `entry.isDir` 的文件

**Interfaces:**
- Consumes: `FileEntry` from Task 1

- [ ] **Step 1: 搜索所有使用 isDir 的文件**

```bash
grep -r "\.isDir" apps/renderer/src/
```

- [ ] **Step 2: 逐个修改每个文件**

将 `entry.isDir` 改为 `entry.type === 'directory'`

- [ ] **Step 3: 运行类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 4: Commit**

```bash
git add apps/renderer/src/
git commit -m "refactor:迁移所有 isDir 使用为 type === 'directory'"
```

---

### Task 7: 完整验证

**Files:**
- All modified files

**Interfaces:**
- Consumes: 所有之前的任务

- [ ] **Step 1: 运行完整类型检查**

```bash
bun run lint:typecheck
```

预期：通过类型检查

- [ ] **Step 2: 运行 lint**

```bash
bun run lint
```

预期：通过 lint 检查

- [ ] **Step 3: 启动开发服务器测试**

```bash
bun run dev
```

- [ ] **Step 4: 测试功能**

1. 进入图片文件夹，观察文件列表是否正常加载
2. 按下空格键，观察图片是否从缩略图位置放大到全屏
3. 按 ESC 键，观察图片是否缩小回缩略图位置
4. 切换图片后按 ESC，观察是否缩回到当前图片的缩略图位置

- [ ] **Step 5: Final Commit**

```bash
git add .
git commit -m "feat:完成 QuickLook 共享布局动画"
```

---

## 验证清单

- [ ] 进入图片文件夹时，文件列表正常加载，无明显延迟
- [ ] 图片文件的 FileEntry.type 为 'image'，info 包含 width 和 height
- [ ] 按下空格键时，图片从缩略图位置平滑放大到正确尺寸的全屏位置
- [ ] 按 ESC 键时，图片从全屏位置平滑缩小回缩略图位置
- [ ] 切换图片后按 ESC：动画缩回到当前图片的缩略图位置
- [ ] 动画时长为 200ms，效果流畅
- [ ] 动画过程中位置、尺寸、圆角、透明度平滑过渡
- [ ] 快速切换图片时，动画正确中断并开始新的动画
- [ ] 不同尺寸的图片都能正确计算最终面板尺寸
- [ ] 所有使用 `entry.isDir` 的地方已改为 `entry.type === 'directory'`
