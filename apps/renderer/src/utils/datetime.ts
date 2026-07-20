/**
 * 将时间戳格式化为 yyyy-MM-dd HH:mm:ss（本地时区，零补齐）。
 * 用于文件列表"修改时间"等需要精确可读时间的场景。
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const mo = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const mi = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}
