# QuickLook 图片预览加载优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 QuickLook 图片预览功能，添加加载提示和淡入+缩放动画效果

**Architecture:** 在 QuickLookPanel.vue 中添加图片加载状态管理，使用 Spinner 组件显示加载提示，通过 CSS transition 实现淡入+缩放动画

**Tech Stack:** Vue 3, CSS transition, Spinner 组件

## Global Constraints

- 使用 `bun` 作为包管理器
- 使用 `execa` 而不是 `node:child_process`
- 使用 `registerAppShortcut` 注册快捷键（除非明确要求全局快捷键）
- 使用 `console.debug` 记录调试日志，`console.info` 记录关键路径
- Vue 单文件组件的 `<style>` 必须使用 LESS 语法
- 使用 Naive UI 组件库
- 主题色通过 CSS 变量定义

---

### Task 1: 添加图片加载状态管理

**Files:**
- Modify: `apps/renderer/src/views/files/QuickLookPanel.vue:109-121`

**Interfaces:**
- Consumes: 现有的 `imageLoaded` ref
- Produces: 新增 `imageLoading` ref 用于跟踪图片加载状态

- [ ] **Step 1: 导入 Spinner 组件**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的 `<script setup>` 部分添加 Spinner 组件导入：

```typescript
import Spinner from '@/components/ui/Spinner.vue'
```

- [ ] **Step 2: 添加 imageLoading 状态**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的 `<script setup>` 部分，在 `imageLoaded` ref 之后添加：

```typescript
const imageLoading = ref(false)
```

- [ ] **Step 3: 修改 handleImageLoad 函数**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 中修改 `handleImageLoad` 函数，添加 `imageLoading` 状态管理：

```typescript
// 图片加载完成
function handleImageLoad(event: Event): void {
  const img = event.target as HTMLImageElement
  imageNaturalWidth.value = img.naturalWidth
  imageNaturalHeight.value = img.naturalHeight
  imageLoaded.value = true
  imageLoading.value = false
  console.debug('[QuickLookPanel] handleImageLoad: %s loaded', img.src)
}
```

- [ ] **Step 4: 添加图片加载开始日志**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 中，当图片开始加载时设置 `imageLoading` 状态。需要监听 `previewData` 变化：

```typescript
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'

// 监听预览数据变化，重置图片加载状态
watch(
  () => store!.previewData.value,
  (newData) => {
    if (newData?.type === 'image') {
      imageLoading.value = true
      imageLoaded.value = false
      console.debug('[QuickLookPanel] watch previewData: image loading started')
    }
  }
)
```

- [ ] **Step 5: 验证状态管理**

运行类型检查确保代码正确：

```bash
bun run lint:typecheck
```

- [ ] **Step 6: 提交更改**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat: add image loading state management"
```

---

### Task 2: 添加加载提示 UI

**Files:**
- Modify: `apps/renderer/src/views/files/QuickLookPanel.vue:32-42`

**Interfaces:**
- Consumes: `imageLoading` ref (from Task 1)
- Produces: Spinner 组件显示加载提示

- [ ] **Step 1: 修改图片预览模板**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的模板部分，修改图片预览区域，添加加载状态判断：

```vue
<!-- 图片预览 -->
<div
  v-if="store!.previewData.value?.type === 'image' && store!.previewData.value.data"
  class="quick-look-image"
>
  <!-- 加载中提示 -->
  <div v-if="imageLoading" class="quick-look-loading">
    <Spinner :size="32" />
  </div>
  
  <!-- 图片 -->
  <img
    :src="store!.previewData.value.data"
    :alt="store!.previewData.value.fileName"
    :class="{ loaded: imageLoaded }"
    @load="handleImageLoad"
  />
</div>
```

- [ ] **Step 2: 添加加载提示样式**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的 `<style scoped>` 部分添加加载提示样式：

```less
.quick-look-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 200px;
}
```

- [ ] **Step 3: 验证 UI 显示**

运行开发服务器验证加载提示显示：

```bash
bun run dev
```

手动测试：打开图片预览，观察是否显示加载提示

- [ ] **Step 4: 提交更改**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat: add image loading spinner"
```

---

### Task 3: 添加淡入+缩放动画效果

**Files:**
- Modify: `apps/renderer/src/views/files/QuickLookPanel.vue:355-359`

**Interfaces:**
- Consumes: `imageLoaded` ref (from Task 1), `.loaded` 类 (from Task 2)
- Produces: CSS transition 动画效果

- [ ] **Step 1: 修改图片样式**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的 `<style scoped>` 部分修改 `.quick-look-image img` 样式：

```less
.quick-look-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;

  &.loaded {
    opacity: 1;
    transform: scale(1);
  }
}
```

- [ ] **Step 2: 验证动画效果**

运行开发服务器验证动画效果：

```bash
bun run dev
```

手动测试：
1. 打开图片预览，观察图片是否平滑淡入+放大
2. 使用←/→方向键切换图片，观察动画是否正常工作

- [ ] **Step 3: 提交更改**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat: add image fade-in and scale animation"
```

---

### Task 4: 优化面板尺寸控制

**Files:**
- Modify: `apps/renderer/src/views/files/QuickLookPanel.vue:268-281`

**Interfaces:**
- Consumes: 图片加载状态
- Produces: 平滑的面板尺寸调整

- [ ] **Step 1: 添加面板尺寸过渡**

在 `apps/renderer/src/views/files/QuickLookPanel.vue` 的 `<style scoped>` 部分修改 `.quick-look-panel` 样式：

```less
.quick-look-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 80vw;
  max-height: 80vh;
  min-width: 300px;
  min-height: 200px;
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  outline: none;
  transition: width 0.3s ease-out, height 0.3s ease-out;
}
```

- [ ] **Step 2: 验证面板尺寸**

运行开发服务器验证面板尺寸控制：

```bash
bun run dev
```

手动测试：
1. 打开小图片预览，观察面板是否保持最小尺寸
2. 打开大图片预览，观察面板是否平滑调整尺寸
3. 切换不同尺寸的图片，观察面板尺寸是否平滑过渡

- [ ] **Step 3: 提交更改**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat: add smooth panel size transition"
```

---

### Task 5: 运行完整验证

**Files:**
- Test: `apps/renderer/src/views/files/QuickLookPanel.vue`

**Interfaces:**
- Consumes: 所有之前的修改
- Produces: 完整的图片预览加载优化功能

- [ ] **Step 1: 运行类型检查**

```bash
bun run lint:typecheck
```

- [ ] **Step 2: 运行代码检查**

```bash
bun run lint
```

- [ ] **Step 3: 运行格式化**

```bash
bun run format
```

- [ ] **Step 4: 运行开发服务器进行完整测试**

```bash
bun run dev
```

手动测试清单：
1. ✅ 打开图片预览时显示加载提示
2. ✅ 图片加载完成后加载提示消失
3. ✅ 图片平滑淡入+放大显示
4. ✅ 使用←/→方向键切换图片时有动画效果
5. ✅ 面板尺寸根据图片内容平滑调整
6. ✅ 大图片加载时面板尺寸不超过视口限制
7. ✅ 快速切换图片时加载状态正确重置

- [ ] **Step 5: 提交最终更改**

```bash
git add apps/renderer/src/views/files/QuickLookPanel.vue
git commit -m "feat: complete image preview loading optimization"
```
