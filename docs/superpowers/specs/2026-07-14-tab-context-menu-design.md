# 标签右键菜单设计 (2026-07-14)

## 目标
为标签栏的单个标签增加右键上下文菜单，包含 11 个动作；固定采用 Chrome 式行为（最左 + 仅图标窄宽 + 锁定顺序）；"新建隐身标签页"移入右上角溢出菜单。

## 菜单项（按序）
1. 在右侧新增标签页
2. ── 分割线
3. 重新加载
4. 复制
5. 固定 / 取消固定（动态文案）
6. 将这个网站静音 / 取消静音（动态文案）
7. ── 分割线
8. 关闭
9. 关闭其它标签页
10. 关闭右侧标签页
11. 关闭左侧标签页

## 主进程新增能力（TabManager）
- `setPinned(tabId, pinned)`：切换 `state.isPinned` 并广播。
- `setMuted(tabId, muted)`：`view.webContents.setAudioMuted(muted)` 并切换 `state.isMuted` 后广播。
- `closeMany(ids: string[])`：逐个关闭；全部关闭后若列表为空则 `app.quit()`。

## 新增 IPC 通道
- `tab:setPinned` `(tabId, pinned) => void`
- `tab:setMuted` `(tabId, muted) => void`
- `tab:closeMany` `(ids: string[]) => void`

## 渲染进程实现（TabBar.vue）
- 复用现有 `tab:create`（返回含 id 的 TabState）与 `tab:reorder`。
- 新建/复制：创建后把新标签插入到目标标签右侧并调用 `reorderTabs(ids)`。
- 关闭类：用 `closeMany(ids)` 传入计算好的 id 列表。
- Chrome 式固定：渲染进程持有规范顺序（固定标签置顶、保持相对顺序），任意变更后 `applyOrder()` 重排本地 `tabs` 并 `reorderTabs(ids)`；固定标签固定窄宽仅图标，未固定标签按剩余空间均分。
- 标签叠加别针图标（isPinned）与静音图标（isMuted）。
- 溢出菜单 `menuItems` 增加 `action` 字段；置顶"新建隐身标签页"项，点击 `createNewTab('incognito')`。

## 文件改动
- `packages/ipc-contract/src/channels.ts`：新增 3 通道 + 类型
- `apps/main/src/tab-manager.ts`：新增 3 方法
- `apps/main/src/ipc/register.ts`：注册 3 handler
- `apps/main/src/preload.ts` + `apps/renderer/src/env.d.ts`：暴露 `setPinned`/`setMuted`/`closeTabs`；修正 `createTab` 返回 `Promise<TabState>`
- `apps/renderer/src/components/TabBar.vue`：菜单 UI + 排序 + 图标 + 溢出菜单

## 测试
- 现有 E2E 覆盖标签生命周期；新增针对菜单动作（新建右侧/复制/固定顺序/静音/各类关闭）的断言。
