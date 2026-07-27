/**
 * 注入到 web 页面的 VIM 控制器
 * 通过 executeJavaScript 在 did-finish-load 时注入
 */
;(() => {
  if (window.__wmfxVim)
    return

  const state = {
    mode: 'normal',
  }

  function handleKeydown(e) {
    if (state.mode === 'normal') {
      const target = e.target
      const isInput
        = target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.isContentEditable

      if (isInput)
        return

      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey
      const shift = e.shiftKey

      // hjkl — 滚动
      if (key === 'j') {
        window.scrollBy(0, 60)
        e.preventDefault()
        return
      }
      if (key === 'k') {
        window.scrollBy(0, -60)
        e.preventDefault()
        return
      }
      if (key === 'h') {
        window.scrollBy(-60, 0)
        e.preventDefault()
        return
      }
      if (key === 'l') {
        window.scrollBy(60, 0)
        e.preventDefault()
        return
      }

      // Ctrl+D / Ctrl+U — 半屏滚动
      if (ctrl && key === 'd') {
        window.scrollBy(0, window.innerHeight / 2)
        e.preventDefault()
        return
      }
      if (ctrl && key === 'u') {
        window.scrollBy(0, -window.innerHeight / 2)
        e.preventDefault()
        return
      }

      // G — 页面底部
      if (key === 'g' && shift && !ctrl) {
        window.scrollTo(0, document.body.scrollHeight)
        e.preventDefault()
        return
      }

      // f — hint 模式（标记链接）
      if (key === 'f' && !ctrl && !e.metaKey) {
        startHints()
        e.preventDefault()
      }
    }
  }

  let hintOverlay = null
  let hintLabels = []

  function startHints() {
    const links = document.querySelectorAll('a[href], button, input[type="submit"], [role="button"]')
    if (links.length === 0)
      return

    hintOverlay = document.createElement('div')
    hintOverlay.style.cssText
      = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;'

    const labels = 'asdfghjklqwertyuiop'
    hintLabels = []

    links.forEach((el, i) => {
      if (i >= labels.length)
        return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0)
        return

      const label = document.createElement('span')
      label.textContent = labels[i].toUpperCase()
      label.style.cssText = `
        position:fixed;
        left:${rect.left + 2}px;
        top:${rect.top + 2}px;
        background:#ff6600;
        color:#fff;
        font-size:12px;
        font-weight:bold;
        padding:1px 4px;
        border-radius:2px;
        z-index:2147483647;
        pointer-events:none;
        font-family:monospace;
      `
      hintOverlay.appendChild(label)
      hintLabels.push({ el, label: labels[i] })
    })

    document.body.appendChild(hintOverlay)

    const handler = (ke) => {
      const ch = ke.key.toLowerCase()
      const match = hintLabels.find(h => h.label === ch)
      if (match) {
        match.el.click()
      }
      stopHints()
      ke.preventDefault()
      ke.stopPropagation()
    }

    document.addEventListener('keydown', handler, { once: true, capture: true })
  }

  function stopHints() {
    if (hintOverlay) {
      hintOverlay.remove()
      hintOverlay = null
    }
    hintLabels = []
  }

  // 监听来自 main process 的模式变化
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'wmfx-vim-mode') {
      state.mode = e.data.mode
    }
  })

  window.addEventListener('keydown', handleKeydown, true)
  window.__wmfxVim = { state }
})()
