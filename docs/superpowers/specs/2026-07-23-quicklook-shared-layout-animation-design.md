# QuickLook 共享布局动画设计

## 背景

在文件浏览器的 QuickLook 预览功能中，当前的动画效果不够流畅。用户希望实现从缩略图位置开始放大到全屏位置的动画效果，关闭时反向动画。

## 需求

1. **打开动画**：按下空格键时，从缩略图位置开始放大到全屏位置（200ms）
2. **关闭动画**：按 ESC 时，从全屏位置缩小回缩略图位置（200ms）
3. **动画效果**：位置 + 尺寸 + 圆角 + 透明度的平滑过渡

## 设计方案

### 1. 获取图片尺寸信息（方案A）

**目标**：进入文件夹时就获取所有图片的尺寸信息，按下空格时直接使用。

**实现细节**：

#### 1.1 修改 FileEntry 接口

在 `packages/ipc-contract/src/types.ts` 中重构 FileEntry：

```typescript
// 文件类型枚举
export type FileType = 'directory' | 'image' | 'video' | 'audio' | 'document' | 'unknown'

// 新增：图片信息
export interface ImageInfo {
  width: number
  height: number
}

// 未来可扩展：视频信息、音频信息等
export interface VideoInfo {
  duration: number
  width: number
  height: number
}

export interface AudioInfo {
  duration: number
  bitrate: number
}

export type FileExtraInfo = ImageInfo | VideoInfo | AudioInfo

// 重构后的 FileEntry
export interface FileEntry {
  name: string
  path: string
  type: FileType  // 替换 isDir，直接判断文件类型
  size: number
  mtime: number
  // 新增：文件附加信息（仅特定类型文件有值）
  info?: FileExtraInfo
}
```

**优点**：
- **类型安全**：通过 `entry.type` 直接判断文件类型
- **易于扩展**：未来添加新类型不影响现有代码
- **IDE 支持**：自动类型推断和智能提示
- **简洁**：移除 `isDir`，用 `type === 'directory'` 代替

**迁移注意**：
- 所有使用 `entry.isDir` 的地方需要改为 `entry.type === 'directory'`
- 需要检查所有调用处并更新

#### 1.2 主进程获取图片尺寸

在 `apps/main/src/file-browser-manager.ts` 的 `readDir` 方法中：

```typescript
import sharp from 'sharp'

// 只对图片文件读取尺寸
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'])

async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | undefined> {
  try {
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

#### 1.3 性能优化

- **并行读取**：使用 `Promise.all` 并行读取多个图片尺寸
- **只读头部**：sharp 的 `metadata()` 只读取图片头部信息，不解码完整图片
- **可选字段**：FileEntry 中的 `width` 和 `height` 是可选的，不影响现有逻辑

#### 1.4 前端使用尺寸

在 `QuickLookPanel.vue` 中，使用预览数据中的尺寸信息计算面板最终尺寸：

```typescript
// 从 FileEntry 获取图片尺寸
function getImageDimensions(entry: FileEntry): { width: number; height: number } | null {
  if (entry.info?.type === 'image') {
    return { width: entry.info.width, height: entry.info.height }
  }
  return null
}

// 计算面板最终尺寸
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

#### 1.5 动态 layoutId 跟踪

**问题**：当用户在预览时切换图片，按 ESC 关闭时，动画应该缩回到当前图片的缩略图位置，而不是最初打开的图片位置。

**解决方案**：使用动态 `layoutId`，绑定到当前预览的文件路径。

```typescript
// useQuickLook.ts
const currentPreviewFile = computed(() => {
  if (store.previewData.value) {
    return store.previewData.value.fileName  // 当前预览的文件名
  }
  return null
})

// 切换图片时，currentPreviewFile 会自动更新
```

```vue
<!-- QuickLookPanel.vue -->
<motion.div
  :layout-id="`thumbnail-${currentPreviewFile}`"
  class="quick-look-panel"
  @click.stop
>
```

**效果**：
- 打开图片 A → layoutId 为 `thumbnail-A`
- 切换到图片 B → layoutId 变为 `thumbnail-B`
- 按 ESC → 动画缩回到图片 B 的缩略图位置

### 2. 安装 motion-v

使用 `bun add motion-v` 安装动画库，它支持布局动画和共享布局动画。

### 3. 共享布局动画原理

使用 `layoutId` 属性在缩略图和预览面板之间建立关联。当两个元素具有相同的 `layoutId` 时，motion-v 会自动计算它们之间的位置和尺寸差异，并创建平滑的过渡动画。

### 3. 组件修改

#### 3.1 FileThumbnail.vue

在缩略图组件中添加 `layoutId` 属性：

```vue
<template>
  <div class="file-thumbnail">
    <motion.img
      v-if="status === 'loading' || status === 'loaded'"
      :layout-id="`thumbnail-${file.path}`"
      :src="thumbnailUrl"
      :alt="file.name"
      class="file-thumbnail-img"
      @load="onLoad"
      @error="onError"
    />
    <Icon
      v-else
      :icon="getFileIcon(file)"
      :width="48"
      :height="48"
      class="file-icon-large"
      :style="{ color: getFileIconColor(file) }"
    />
  </div>
</template>
```

#### 3.2 QuickLookPanel.vue

在预览面板中使用 `motion.div` 包装，并添加 `layoutId` 属性：

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
        :layout-id="`thumbnail-${store!.previewData.value?.fileName}`"
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

### 4. 动画参数

- **时长**：200ms
- **缓动函数**：ease-out
- **动画属性**：
  - 位置（x, y）
  - 尺寸（width, height）
  - 圆角（border-radius）
  - 透明度（opacity）

### 5. 实现细节

#### 5.1 安装依赖

```bash
bun add motion-v
```

#### 5.2 全局注册

在 `main.ts` 中注册 MotionPlugin：

```typescript
import { MotionPlugin } from 'motion-v'

app.use(MotionPlugin)
```

#### 5.3 缩略图组件修改

在 `FileThumbnail.vue` 中：
- 导入 `motion` 组件
- 为 `img` 元素添加 `layoutId` 属性
- `layoutId` 使用文件路径作为唯一标识

#### 5.4 预览面板修改

在 `QuickLookPanel.vue` 中：
- 导入 `motion` 和 `AnimatePresence` 组件
- 使用 `motion.div` 包装面板
- 添加 `layoutId` 属性，与缩略图对应
- 使用 `AnimatePresence` 管理进入/退出动画

#### 5.5 动画触发

- **打开**：当 `previewVisible` 变为 `true` 时，面板从缩略图位置动画到全屏位置
- **关闭**：当 `previewVisible` 变为 `false` 时，面板从全屏位置动画回缩略图位置

### 6. 边界情况处理

1. **缩略图不存在**：如果缩略图未加载完成，使用默认位置动画
2. **快速切换**：切换图片时，动画会中断并开始新的动画
3. **滚动位置**：动画会考虑滚动位置的差异
4. **视口边界**：面板不会动画到视口外部

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 添加 motion-v 依赖 |
| `packages/ipc-contract/src/types.ts` | 重构 FileEntry，添加 FileType、ImageInfo 等类型 |
| `apps/main/src/file-browser-manager.ts` | readDir 方法中设置 type 字段，获取图片尺寸 |
| `apps/renderer/src/main.ts` | 注册 MotionPlugin |
| `apps/renderer/src/views/files/FileThumbnail.vue` | 添加 layoutId 属性，更新 type 判断逻辑 |
| `apps/renderer/src/views/files/QuickLookPanel.vue` | 使用 motion.div 包装，添加 AnimatePresence，计算最终尺寸 |
| 所有使用 `entry.isDir` 的文件 | 改为 `entry.type === 'directory'` |

## 验证标准

1. 进入图片文件夹时，文件列表正常加载，无明显延迟
2. 图片文件的 FileEntry.type 为 'image'，info 包含 width 和 height
3. 按下空格键时，图片从缩略图位置平滑放大到正确尺寸的全屏位置
4. 按 ESC 键时，图片从全屏位置平滑缩小回缩略图位置
5. **切换图片后按 ESC**：动画缩回到当前图片的缩略图位置，而不是最初打开的图片
6. 动画时长为 200ms，效果流畅
7. 动画过程中位置、尺寸、圆角、透明度平滑过渡
8. 快速切换图片时，动画正确中断并开始新的动画
9. 不同尺寸的图片都能正确计算最终面板尺寸
10. 所有使用 `entry.isDir` 的地方已改为 `entry.type === 'directory'`
