# AddressBar 自定义面板设计

## 概述

将地址栏输入框从 `input` + 独立 `Autocomplete` 下拉组件，改为内嵌式面板：聚焦时输入框被白色圆角矩形包裹，下方直接显示建议列表。

## 现状

- `AddressBar.vue`: 水平 flex 布局，`.url-input-wrap` 内含 `<input>` + zoom/bookmark 按钮
- `Autocomplete.vue`: 独立组件，`position: absolute` 定位在地址栏下方，显示历史/书签/搜索建议
- 输入框默认 pill 形状（`border-radius: 14px`），背景 `--url-input-bg`

## 设计

### 状态定义

| 状态 | 行为 |
|------|------|
| 默认（无焦点） | 与现在一致：无边框 input，pill 形状，`--url-input-bg` 背景 |
| 聚焦（有输入） | `.url-input-wrap` 内出现白色圆角面板（`position: absolute`），input 背景变纯白，下方显示建议列表 |
| 聚焦（无输入） | 面板仅显示输入框（无建议列表），保持白色面板形态 |

### 结构

```
<div class="url-input-wrap">
  <!-- 默认态 input 保持不变 -->
  <input ref="inputRef" v-model="urlInput" ... />

  <!-- 聚焦态面板 -->
  <div v-if="isFocused" class="url-panel">
    <div class="url-panel-input-row">
      <input v-model="urlInput" ... />
      <div class="url-panel-actions">zoom + bookmark</div>
    </div>
    <div v-if="suggestions.length" class="url-panel-suggestions">
      <div v-for="item in suggestions" class="url-panel-suggestion-item">
        <Icon ... />
        <span class="item-title">{{ item.title }}</span>
        <span class="item-url">{{ item.url }}</span>
      </div>
    </div>
  </div>
</div>
```

### 面板定位

- `position: absolute`，相对于 `.url-input-wrap`
- `left: -8px; right: -8px;`（比默认输入框左右各宽 8px）
- 内部 `padding: 6px`，建议项 `padding: 8px 12px`
- `border-radius: 12px`，白色背景 `#fff`，`box-shadow: 0 4px 16px rgba(0,0,0,0.15)`
- `z-index: 999`

### 交互

- **聚焦**：`@focus` 设置 `isFocused = true`，触发建议查询（复用 `getAutocompleteSuggestions`，200ms debounce）
- **失焦**：用 `mousedown` 监听外部点击，`setTimeout` 延迟 blur 确保建议点击能触发
- **键盘**：上下箭头导航建议，Enter 确认，Escape 收起面板
- **选择建议**：点击或 Enter 后 `loadURL` 并收起

### 变更范围

- **修改**: `AddressBar.vue`（集成面板逻辑，替换 `<Autocomplete>` 引用）
- **删除**: `Autocomplete.vue`（逻辑内联到 AddressBar）
- **不动**: IPC 层、`useAddressBarFocus`、`getAutocompleteSuggestions` 接口

### 深色/浅色模式

- 面板背景硬编码 `#fff`（聚焦态需要纯白，不跟随主题变量）
- 建议项文字颜色使用 `--text-primary` / `--text-secondary`
- 建议项 hover 背景使用 `--bg-tertiary`
