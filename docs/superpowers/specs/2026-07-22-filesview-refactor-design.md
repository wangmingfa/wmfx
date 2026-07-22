# FilesView 重构设计文档

> 将 FilesView.vue 从"上帝组件"（1010 行）重构为薄布局层 + 共享状态 hub，所有子组件通过 composable 通信，消除 70+ 个 props/emit 的纵向传递。

## 1. 问题诊断

### 1.1 现状

**FilesView.vue（1010 行）** 同时承担：

| 职责 | 行数 | 问题 |
|------|------|------|
| 状态声明（15+ ref） | 149–210 | 所有状态直接暴露在组件顶层，无法被其他模块复用 |
| 导航逻辑（navigateTo/goBack/Forward/search/sort） | ~80 行 | 与 `useFileNavigation.ts`（已存在、391 行、完全未用）重复 |
| 文件操作（delete/copy/cut/paste/newFolder） | ~80 行 | 散落在组件内，无法独立测试 |
| 键盘快捷键（handleKeyDown） | ~150 行 | 绑定到组件生命周期，逻辑与操作层耦合 |
| 右键菜单（handleContextMenu/showFileContextMenu） | ~100 行 | 菜单项定义与操作回调混在一起 |
| 生命周期（onMounted/onUnmounted wiring） | ~50 行 | 手动注册/注销所有监听，子 composables 也各自注册 |
| Prop/emit 传递 | 全文件 | 70+ 个 props/emit 串通 5 个子组件，增加/删除任何 prop 需改多个文件 |

### 1.2 三个"幽灵" composable

以下三个 composable 文件已存在，内容与 FilesView.vue 几乎完全一致，但**从未被引用**：

| 文件 | 行数 | 状态 |
|------|------|------|
| `useFileNavigation.ts` | 391 | 未使用，与 FilesView 导航逻辑重复 |
| `useFileSelection.ts` | 123 | 未使用，与 FilesView 选中逻辑重复 |
| `useFileMetadata.ts` | 37 | 未使用，与 FilesView 元数据加载重复 |

### 1.3 子组件的 props 过载

| 组件 | props | 问题 |
|------|-------|------|
| `FilesSidebar.vue` | `systemDirs`, `fileBookmarks`, `currentPath` + 2 emits | 需从父组件传下来 |
| `FilesTopbar.vue` | `segments`, `sortBy`, `searchQuery`(v-model), `viewMode`(v-model) + 4 emits | 状态从父组件透传 |
| `FileList.vue` | 18 个 props + 7 emits | 最严重，一半状态从父组件来 |
| `FilesListHeader.vue` | 3 props + 3 emits | 中等 |
| `FilesStatusBar.vue` | 2 props | 较干净 |

## 2. 重构目标

1. **FilesView.vue ≤ 60 行**：只做组件引入和布局
2. **所有子组件 0 个父组件 props**：通过 `inject` 读取共享状态
3. **composables 之间零直接依赖**：通过 `useFileStore` 共享状态，composables 互不认识
4. **所有现有行为不变**：交互、快捷键、右键菜单、模板结构完全不变
5. **新增/修改任意 composable 不影响其他模块**：通过 `FileStoreDeps` 接口解耦

## 3. 架构设计

### 3.1 核心：useFileStore

`useFileStore` 是整个文件浏览器的**唯一状态持有者和生命周期管理者**。它不关心任何具体交互逻辑，只负责：

1. 创建所有共享 ref（`currentPath`、`fileEntries`、`selectedPaths` 等）
2. 按依赖顺序创建所有业务 composable（传入共享状态切片）
3. 提供 `setup()` / `teardown()` 给 FilesView 调用（管理 onMounted/onUnmounted）

**创建顺序（有依赖关系）**：

```
useFileStore.create()
  ├─ 创建共享 refs（currentPath/fileEntries/selectedPaths/...）
  ├─ useFileNavigation(deps)          ← 依赖：当前路径、选区
  ├─ useFileMetadata()                ← 无外部依赖
  ├─ useFileSelection(deps)           ← 依赖：fileEntries、sortedFiles、selectedPaths
  │   └─ bindRenameHooks() ← useFileRename 创建后回填（打破循环依赖）
  ├─ useFileRename(deps)              ← 依赖：fileEntries、currentPath、loadDirectory
  ├─ useMarqueeSelection(deps)        ← 依赖：sortedFiles、viewMode、selectedPaths
  ├─ useFileDragDrop(deps)            ← 依赖：selectedPaths、currentPath
  ├─ useQuickLook(deps)               ← 依赖：sortedFiles
  ├─ useListColumns()                 ← 无外部依赖
  └─ useFileOperations(deps)          ← 依赖：currentPath、selectedPaths、fileEntries、loadDirectory
      └─ handleDelete / handleCopy / handleCut / handlePaste / handleNewFolder
```

### 3.2 共享状态（store 返回）

```ts
export interface FileStore {
  // ── 导航状态 ──
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  sortedFiles: ComputedRef<FileEntry[]>
  breadcrumbSegments: ComputedRef<Array<{ label: string, path: string }>>
  directoryError: Ref<string | null>
  isLoading: Ref<boolean>
  showSkeleton: Ref<boolean>
  navHistory: Ref<string[]>
  navIndex: Ref<number>
  protocol: ComputedRef<'local' | 'ftp' | 'sftp'>

  // ── 视图状态 ──
  viewMode: Ref<'icon' | 'list'>
  sortBy: Ref<string>
  searchQuery: Ref<string>

  // ── 选中状态 ──
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  selectedCount: ComputedRef<number>
  selectedPhrase: ComputedRef<string>

  // ── 重命名状态 ──
  renamingPath: Ref<string | null>
  renamingName: Ref<string>
  renamingBookmarkId: Ref<string | null>
  renamingBookmarkName: Ref<string>

  // ── 拖拽状态 ──
  dragFiles: Ref<string[]>
  dragOverFilesList: Ref<boolean>

  // ── 框选状态 ──
  marqueeRect: Ref<... | null>
  marqueeHitPaths: Ref<string[]>
  marqueeActive: Ref<boolean>

  // ── Quick Look ──
  previewVisible: Ref<boolean>
  previewData: Ref<PreviewData | null>

  // ── 元数据 ──
  systemDirs: Ref<SystemDir[]>
  fileBookmarks: Ref<FileBookmark[]>

  // ── 列表列 ──
  listColumns: Ref<ListViewColumn[]>
  listColumnLabels: Record<ListViewColumn['key'], string>
  listGridTemplate: ComputedRef<string>

  // ── 操作函数 ──
  navigateTo: (path: string) => Promise<void>
  navigateToBreadcrumb: (index: number) => void
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  loadDirectory: (path: string) => Promise<void>
  reloadCurrentDir: () => Promise<void>
  loadMetadata: () => Promise<void>
  handleSearch: () => Promise<void>
  clearSearch: () => void
  handleSortChange: (value: string) => void
  handleItemClick: (file: FileEntry, event: MouseEvent) => void
  handleItemDblClick: (file: FileEntry) => Promise<void>
  handleDelete: (paths: string[]) => Promise<void>
  handleCopy: () => Promise<void>
  handleCut: () => Promise<void>
  handlePaste: () => Promise<void>
  handleNewFolder: () => Promise<void>
  startRename: (file: FileEntry) => void
  confirmRename: () => Promise<void>
  cancelRename: () => void
  scheduleRename: (file: FileEntry) => void
  cancelRenameTimer: () => void
  openPreview: (file: FileEntry) => Promise<void>
  closePreview: () => void
  previousPreview: () => Promise<void>
  nextPreview: () => Promise<void>
  isSelected: (path: string) => boolean
  selectAll: () => void
  onMarqueeStart: (event: MouseEvent) => void
  clearSelection: (event: MouseEvent) => void
  onColumnResizeStart: (key: ListViewColumn['key'], event: MouseEvent) => void
  onColumnDragStart: (key: ListViewColumn['key'], event: DragEvent) => void
  onColumnDrop: (targetKey: ListViewColumn['key']) => void
  handleDragStart: (event: DragEvent, file: FileEntry) => void
  handleDragEnd: () => void
  handleDragOverList: (event: DragEvent) => void
  handleDragLeaveList: () => void
  handleDropOnList: (event: DragEvent) => Promise<void>
  renderCellContent: (file: FileEntry, key: ListViewColumn['key']) => string

  // ── 生命周期 ──
  setup: () => void
  teardown: () => void
}
```

### 3.3 依赖接口（FileStoreDeps）

每个业务 composable 只接收它需要的共享状态切片。`useFileStore` 负责组装 deps 并传入，composables 之间**不互相 import**：

```ts
// 导航 composable 需要的切片
interface NavigationDeps {
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  searchQuery: Ref<string>
  sortBy: Ref<string>
  viewMode: Ref<'icon' | 'list'>
  directoryError: Ref<string | null>
  navHistory: Ref<string[]>
  navIndex: Ref<number>
  protocol: ComputedRef<string>
}

// 选中 composable 需要的切片
interface SelectionDeps {
  fileEntries: Ref<FileEntry[]>
  sortedFiles: ComputedRef<FileEntry[]>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
}

// 重命名 composable 需要的切片
interface RenameDeps {
  fileEntries: Ref<FileEntry[]>
  currentPath: Ref<string>
  selectedPaths: Ref<string[]>
  lastClickedIndex: Ref<number>
  loadDirectory: (path: string) => Promise<void>
}
// ... 以此类推
```

### 3.4 循环依赖打破

当前 `useFileSelection` 通过 `bindRenameHooks(scheduleRename, cancelRenameTimer)` 依赖 `useFileRename` 的函数。新架构中：

- `useFileStore` 先创建 `useFileRename`（得到 `scheduleRename`/`cancelRenameTimer`）
- 再将这两个函数作为 `SelectionDeps` 的一部分传入 `useFileSelection`
- 完全不需要跨模块绑定

```ts
// useFileStore 内部
const rename = useFileRename(renameDeps)
const selection = useFileSelection({
  ...selectionDeps,
  scheduleRename: rename.scheduleRename,
  cancelRenameTimer: rename.cancelRenameTimer,
})
```

### 3.5 生命周期管理

每个 composable 暴露 `setup()` 和 `teardown()` 方法（不需要 onMounted/onUnmounted）：

```ts
// useFileNavigation.ts
export function useFileNavigation(deps: NavigationDeps) {
  let filesChangedUnsub: (() => void) | void
  let filesChangedTimer: number | null = null
  let skeletonTimer: ReturnType<typeof setTimeout> | null = null

  // watch(route.path) 也放在 setup 中（因为需要 onMounted 上下文）
  function setup() {
    // 初始加载目录
    void loadInitialDirectory()
    // 注册变更监听
    filesChangedUnsub = window.browserAPI.onFilesChanged(...)
  }

  function teardown() {
    if (typeof filesChangedUnsub === 'function') filesChangedUnsub()
    if (filesChangedTimer !== null) window.clearTimeout(filesChangedTimer)
    if (skeletonTimer) window.clearTimeout(skeletonTimer)
  }

  return { setup, teardown, currentPath, fileEntries, sortedFiles, ... }
}
```

`useFileStore.setup()` 依次调用所有 composable 的 `setup()`，`useFileStore.teardown()` 依次调用 `teardown()`。

### 3.6 子组件通信

**方案：`provide` / `inject`**

FilesView 提供 store，所有子组件通过 `inject` 读取：

```ts
// useFileStore.ts 顶部
export const fileStoreInjectionKey = 'fileStore'

// FilesView.vue
const store = useFileStore()
provide(fileStoreInjectionKey, store)

// FilesSidebar.vue（任何子组件）
const store = inject<FileStore>(fileStoreInjectionKey)
// 直接读 store.currentPath，调用 store.navigateTo(path)
```

**为什么不是 props/emit？**
- 子组件的 props 数量从 70+ 降到 0
- 新增状态时只需改 `useFileStore` 和对应 composable，不需要逐层透传
- 子组件可以组合多个状态（如 FileList 需要 `selectedPaths` + `dragFiles` + `marqueeRect`，原来需要从父组件 3 个独立 props 获取）

## 4. 文件变更计划

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `useFileStore.ts` | 状态持有者 + 编排器，返回完整的 `FileStore` 接口 |

### 4.2 改造文件

| 文件 | 改造内容 |
|------|---------|
| `useFileNavigation.ts` | 改为接受 `NavigationDeps`，暴露 `setup`/`teardown`，移除 `onMounted`/`onUnmounted` |
| `useFileSelection.ts` | 改为接受 `SelectionDeps`，移除 `bindRenameHooks` 机制，从 deps 直接获取重命名函数 |
| `useFileRename.ts` | 改为接受 `RenameDeps`，不变（已无生命周期依赖） |
| `useMarqueeSelection.ts` | 改为接受 `MarqueeDeps`，移除 `onUnmounted` |
| `useFileDragDrop.ts` | 改为接受 `DragDropDeps`，无生命周期依赖 |
| `useQuickLook.ts` | 改为接受 `QuickLookDeps`，无生命周期依赖 |
| `useListColumns.ts` | 不变（无生命周期依赖，纯状态） |
| `useFileMetadata.ts` | 改为接受可选 deps，移除 `onMounted` |
| `FilesSidebar.vue` | 改用 `inject` 读取 store，去掉所有 props，直接调用 store 方法 |
| `FilesTopbar.vue` | 改用 `inject` 读取 store，去掉所有 props，直接调用 store 方法 |
| `FileList.vue` | 改用 `inject` 读取 store，去掉 18 个 props，直接调用 store 方法 |
| `FilesListHeader.vue` | 改用 `inject` 读取 store，去掉 3 个 props |
| `FilesStatusBar.vue` | 改用 `inject` 读取 store，去掉 2 个 props |
| `QuickLookPanel.vue` | 改用 `inject` 读取 store，去掉 props，直接调用 store 方法 |

### 4.3 FilesView.vue 改造（1010 行 → ~60 行）

```vue
<template>
  <div
    class="files-view"
    :class="{ 'files--loading': showSkeleton }"
    @contextmenu.prevent
  >
    <FilesSidebar />
    <section class="files-content">
      <FilesTopbar />
      <FilesListHeader v-if="viewMode === 'list'" />
      <FileList />
      <FilesStatusBar />
    </section>
  </div>
  <QuickLookPanel v-if="previewVisible && previewData" />
</template>

<script setup lang="ts">
import { provide, ref, computed } from 'vue'
import { useFileStore } from './useFileStore'

const store = useFileStore()
provide('fileStore', store)

// 仅暴露模板需要的 computed（从 store 派生）
const {
  showSkeleton,
  viewMode,
  previewVisible,
  previewData,
} = store
</script>

<style scoped lang="less">
/* 布局样式不变 */
</style>
```

### 4.4 不做的事

| 事项 | 理由 |
|------|------|
| 引入 Pinia | 过度工程化，composable + provide/inject 已足够 |
| 改变交互行为 | 重构不是重写，所有行为必须保持 |
| 改变 DOM 结构 | 所有 `.file-item`、`.marquee-box` 等样式保持 |
| 改变快捷键 | 快捷键注册仍在 `useFileStore.setup()` 中，行为不变 |
| 合并 composable | 保持现有 6+ 个业务 composable 的粒度 |
| 改变子组件的 `<template>` | 子组件的 DOM 结构完全不变 |

## 5. 通信流程图

```
FilesView.vue (布局)
  │
  ├─ useFileStore() ──────────────────────────── 创建所有状态 + composables
  │     │
  │     ├─ useFileNavigation ───── 路由/搜索/排序/面包屑
  │     │     └─ navigateTo/goBack/Forward/handleSearch/sort
  │     │
  │     ├─ useFileSelection ─────── 单选/多选/范围选择
  │     │     └─ handleItemClick/selectAll/isSelected
  │     │
  │     ├─ useFileRename ────────── 重命名状态机
  │     │     └─ startRename/confirmRename/cancelRename/scheduleRename
  │     │
  │     ├─ useMarqueeSelection ─── 框选/清空选中
  │     │     └─ onMarqueeStart/clearSelection
  │     │
  │     ├─ useFileDragDrop ──────── 拖拽交互
  │     │     └─ handleDragStart/End/Over/Leave/Drop
  │     │
  │     ├─ useQuickLook ─────────── Quick Look 预览
  │     │     └─ openPreview/closePreview/previous/next
  │     │
  │     ├─ useFileMetadata ──────── 系统目录/书签
  │     │     └─ loadMetadata
  │     │
  │     ├─ useListColumns ───────── 列管理
  │     │     └─ onColumnResizeStart/ColumnDragStart/ColumnDrop/renderCellContent
  │     │
  │     └─ useFileOperations ────── 文件操作
  │           └─ handleDelete/handleCopy/handleCut/handlePaste/handleNewFolder
  │
  ├─ provide(fileStore) ────────────── 注入给所有子组件
  │
  ├─ FilesSidebar ── inject(fileStore) ── 读取 currentPath/systemDirs/fileBookmarks
  ├─ FilesTopbar ─── inject(fileStore) ── 读取 segments/sortBy/searchQuery/viewMode
  ├─ FileList ────── inject(fileStore) ── 读取 selectedPaths/dragFiles/marqueeRect/...
  ├─ FilesListHeader ─ inject(fileStore) ── 读取 listColumns/listGridTemplate
  └─ FilesStatusBar ─ inject(fileStore) ── 读取 selectedCount/selectedPhrase
```

## 6. 迁移策略

### Phase 1：useFileStore + 状态抽取

1. 创建 `useFileStore.ts`，从 FilesView 提取所有 ref、computed、基础状态
2. 实现 `setup()` / `teardown()` 生命周期
3. 将 `useFileNavigation`、`useFileSelection`、`useFileMetadata` 改为接受 deps
4. 将现有 composables 注册到 store
5. FilesView 改为调用 `useFileStore`，保持模板不变

### Phase 2：子组件改为 inject

1. FilesView 使用 `provide('fileStore', store)`
2. 逐个修改子组件，将 props/emit 改为 inject
3. 每次改完一个子组件验证功能正常
4. FilesView 的 `<FilesSidebar ...props>` 清空为 `<FilesSidebar />`

### Phase 3：清理

1. 删除 FilesView 中已迁移到 store 的重复逻辑
2. 删除未使用的幽灵 composable（已被 store 替代的）
3. 验证所有交互正常
4. 运行 lint/typecheck

## 7. 关键约束

### 7.1 状态单向性

所有状态**只存在于 `useFileStore` 创建的 refs 中**。子组件不得创建新的 `ref` 来保存从父组件透传的状态。子组件如果有局部交互状态（如 `itemHovered`、`imageLoaded`），仍然可以在组件内部创建。

### 7.2 键盘快捷键

`handleKeyDown` 不改变，但注册/注销从 FilesView 的 `onMounted/onUnmounted` 移到 `useFileStore.setup()/teardown()`。快捷键逻辑中调用的函数（如 `store.startRename(file)`）直接来自 store。

### 7.3 右键菜单

菜单定义和动作处理完全不变，只是 `showFileContextMenu` 函数从 FilesView 移到 store（作为 `useFileOperations` 的一部分），因为菜单动作需要调用 store 中的操作函数。

### 7.4 路由监听

`watch(() => route.path, ...)` 仍在 `useFileNavigation.setup()` 中执行，但需要确保 `onMounted` 上下文。由于 `useFileStore.setup()` 在 `onMounted` 中调用，所有 `setup()` 都在正确上下文中。

## 8. 测试验证

| 场景 | 验证方式 |
|------|---------|
| 目录导航 | 双击文件夹进入、面包屑点击、后退/前进 |
| 文件操作 | 重命名、删除、新建文件夹、复制/剪切/粘贴 |
| 选中 | 单选、Ctrl+多选、Shift+范围选择、框选 |
| Quick Look | 空格预览、←→切换、Escape 关闭 |
| 拖拽 | 文件拖入下载、文件浏览器内拖拽 |
| 快捷键 | 所有快捷键与重构前行为一致 |
| 右键菜单 | 文件项右键、空白处右键，所有菜单项正常 |
| 列表视图 | 列宽拖拽、列顺序拖拽、列头点击排序 |
| 搜索 | 搜索框实时过滤、Escape 清除 |
| 元数据 | 侧栏系统目录、书签增删改 |

所有验证以"与重构前行为一致"为标准，不引入新交互。
