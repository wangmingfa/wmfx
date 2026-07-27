/**
 * GUI 模式下的外壳导航：Tab 切换、焦点导航、滚动等
 */
export class GuiMode {
  handleKeydown(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement
    const isInput =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    if (isInput) return false

    // Ctrl+Tab / Ctrl+Shift+Tab — 标签切换
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        window.browserAPI.send('shell:prevTab')
      } else {
        window.browserAPI.send('shell:nextTab')
      }
      return true
    }

    // Cmd+1-8 — 跳转到第 N 个标签
    if (e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 8) {
        e.preventDefault()
        window.browserAPI.send('shell:switchTab', num - 1)
        return true
      }
      if (e.key === '9') {
        e.preventDefault()
        window.browserAPI.send('shell:lastTab')
        return true
      }
    }

    // F6 — 地址栏 ↔ 内容区焦点切换
    if (e.key === 'F6') {
      e.preventDefault()
      window.browserAPI.send('shell:toggleFocus')
      return true
    }

    // Space — 向下滚动一屏
    if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      window.browserAPI.send('shell:scrollPageDown')
      return true
    }

    // Shift+Space — 向上滚动一屏
    if (e.shiftKey && e.key === ' ') {
      e.preventDefault()
      window.browserAPI.send('shell:scrollPageUp')
      return true
    }

    // Home / End — 页面顶部/底部
    if (e.key === 'Home' && !e.ctrlKey) {
      e.preventDefault()
      window.browserAPI.send('shell:scrollTop')
      return true
    }
    if (e.key === 'End' && !e.ctrlKey) {
      e.preventDefault()
      window.browserAPI.send('shell:scrollBottom')
      return true
    }

    // Ctrl+Home / Ctrl+End — 聚焦到页面顶部/底部
    if (e.ctrlKey && e.key === 'Home') {
      e.preventDefault()
      window.browserAPI.send('shell:focusTop')
      return true
    }
    if (e.ctrlKey && e.key === 'End') {
      e.preventDefault()
      window.browserAPI.send('shell:focusBottom')
      return true
    }

    return false
  }
}
