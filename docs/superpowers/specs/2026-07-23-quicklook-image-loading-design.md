# QuickLook 图片预览加载优化设计

## 背景

在文件浏览器的 QuickLook 预览功能中，当用户使用空格键预览图片时，会出现一个小的弹窗突然变成大弹窗（被图片撑大）的问题。这导致用户体验不佳，需要优化。

## 需求

1. **加载提示**：图片加载过程中显示加载动画（spinner）
2. **动画效果**：图片显示出来后，是一个逐渐放大的过程，而不是突然变大

## 设计方案

### 1. 加载状态管理

在 `QuickLookPanel.vue` 中添加 `imageLoading` ref 来跟踪图片加载状态：

```typescript
const imageLoading = ref(false)
```

### 2. 加载提示

图片加载时显示 `Spinner.vue` 组件：

```vue
<div v-if="imageLoading" class="quick-look-loading">
  <Spinner :size="32" />
</div>
```

### 3. 动画效果

图片加载完成后，使用 CSS transition 实现淡入+缩放效果：

```css
.quick-look-image img {
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.3s ease-out, transform 0.3s ease-out;
}

.quick-look-image img.loaded {
  opacity: 1;
  transform: scale(1);
}
```

**方向键切换动画：**

- 切换时：当前图片先淡出+缩小（移除 `loaded` 类）
- 新图片：加载完成后淡入+放大（添加 `loaded` 类）
- 动画效果与首次加载一致

### 4. 实现细节

#### 4.1 图片加载流程

1. 打开预览时，`imageLoading` 设为 `true`
2. 图片开始加载，显示 Spinner 组件
3. 图片加载完成后，触发 `@load` 事件
4. 在 `handleImageLoad` 函数中：
   - 设置 `imageLoaded.value = true`
   - 设置 `imageLoading.value = false`
5. 图片元素添加 `loaded` 类，触发动画

#### 4.2 方向键切换图片流程

1. 用户按←/→方向键切换图片
2. 调用 `previousPreview()` 或 `nextPreview()` 函数
3. 在 `openPreview` 函数中：
   - 重置 `imageLoaded.value = false`
   - 设置 `imageLoading.value = true`
4. 图片元素移除 `loaded` 类，触发动画（淡出+缩小）
5. 新图片开始加载，显示 Spinner 组件
6. 新图片加载完成后，触发 `@load` 事件
7. 在 `handleImageLoad` 函数中：
   - 设置 `imageLoaded.value = true`
   - 设置 `imageLoading.value = false`
8. 图片元素添加 `loaded` 类，触发动画（淡入+放大）

#### 4.2 面板尺寸控制

- 图片加载前：面板保持最小尺寸（`min-width: 300px; min-height: 200px`）
- 图片加载后：面板根据图片尺寸调整，但不超过最大限制（`max-width: 80vw; max-height: 80vh`）

#### 4.3 动画参数

- 动画时长：300ms
- 缓动函数：`ease-out`
- 初始状态：`opacity: 0; transform: scale(0.9)`
- 结束状态：`opacity: 1; transform: scale(1)`

### 5. 组件修改

#### 5.1 QuickLookPanel.vue

**模板修改：**

1. 在图片预览区域添加加载状态判断
2. 图片元素添加 `loaded` 类控制

**脚本修改：**

1. 导入 `Spinner` 组件
2. 添加 `imageLoading` ref
3. 修改 `handleImageLoad` 函数，设置 `imageLoading` 状态
4. 在 `openPreview` 时重置 `imageLoading` 状态

**样式修改：**

1. 添加 `.quick-look-loading` 样式
2. 修改 `.quick-look-image img` 样式，添加动画效果

#### 5.2 useQuickLook.ts

无需修改，保持现有逻辑。

### 6. 边界情况处理

1. **大图片加载**：面板尺寸受 `max-width` 和 `max-height` 限制
2. **小图片加载**：面板保持最小尺寸
3. **加载失败**：显示错误提示（已有逻辑）
4. **快速切换**：切换图片时重置加载状态
5. **方向键切换**：使用←/→方向键切换图片时，同样需要动画效果

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `apps/renderer/src/views/files/QuickLookPanel.vue` | 添加加载状态管理、Spinner组件、CSS动画 |

## 验证标准

1. 打开图片预览时，显示 Spinner 加载动画
2. 图片加载完成后，Spinner 消失，图片平滑淡入+缩放显示
3. 面板尺寸根据图片内容平滑调整，无突然跳变
4. 快速切换图片时，加载状态正确重置
5. 大图片加载时，面板尺寸不超过视口限制
6. 使用←/→方向键切换图片时，同样有平滑的淡入+缩放动画
