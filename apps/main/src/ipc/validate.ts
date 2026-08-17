/**
 * IPC 参数校验工具 — 主进程侧的纵深防御
 *
 * 渲染端本身受信（preload 只暴露白名单 API），但一旦 preload/页面被 XSS 或
 * 恶意内容利用，未校验的 IPC 参数可能被用来做越权操作：
 * - 任意 scheme 导航（如 file:// 读本地文件）
 * - 任意 sessionId 创建无限 persist 分区（磁盘膨胀）
 * 这里在关键 handler 入口做白名单校验，拦截后 handler 抛错 → 渲染端 invoke 收到 rejection。
 */

/** 外部导航只允许 http/https；file:/wmfx: 等仅限内部路径，不由渲染端导航传入 */
export function isSafeWebUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** sessionId 白名单：只允许已知分区，防止构造任意 persist:* 分区 */
export function isAllowedSessionId(id: string): boolean {
  return id === 'default' || id === 'incognito'
}
