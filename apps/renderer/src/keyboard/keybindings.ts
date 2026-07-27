/**
 * 快捷键定义数据，用于设置页展示
 * scope: 'global' = Electron globalShortcut，始终生效
 *        'shell'  = renderer KeyboardManager 拦截，操作浏览器外壳
 *        'page'   = content-vim.js 注入，操作当前网页
 */
export interface KeybindingEntry {
  key: string
  description: string
  scope: 'global' | 'shell' | 'page'
}

export interface KeybindingSection {
  title: string
  entries: KeybindingEntry[]
}

export interface KeybindingModeConfig {
  label: string
  value: 'gui' | 'vim'
  sections: KeybindingSection[]
}

export const keybindingModes: KeybindingModeConfig[] = [
  {
    label: 'GUI 模式',
    value: 'gui',
    sections: [
      {
        title: '导航',
        entries: [
          { key: 'Cmd+F', description: '搜索', scope: 'global' },
          { key: 'Cmd+L', description: '地址栏', scope: 'global' },
          { key: 'Cmd+K', description: '命令面板', scope: 'global' },
        ],
      },
      {
        title: '标签页',
        entries: [
          { key: 'Cmd+T', description: '新建标签', scope: 'global' },
          { key: 'Cmd+W', description: '关闭标签', scope: 'global' },
          { key: 'Cmd+Shift+T', description: '恢复标签', scope: 'global' },
          { key: 'Ctrl+Tab', description: '下一个标签', scope: 'shell' },
          { key: 'Ctrl+Shift+Tab', description: '上一个标签', scope: 'shell' },
          { key: 'Cmd+1-8', description: '跳转到第 N 个标签', scope: 'shell' },
          { key: 'Cmd+9', description: '跳转到最后一个标签', scope: 'shell' },
        ],
      },
      {
        title: '窗口',
        entries: [
          { key: 'Cmd+N', description: '新建窗口', scope: 'global' },
          { key: 'Cmd+Shift+N', description: '无痕窗口', scope: 'global' },
          { key: 'Cmd+,', description: '设置', scope: 'global' },
          { key: 'F12', description: 'DevTools', scope: 'global' },
          { key: 'Cmd+Shift+B', description: '书签栏', scope: 'global' },
          { key: 'Cmd+Shift+L', description: '标签栏位置', scope: 'global' },
        ],
      },
      {
        title: '焦点与滚动',
        entries: [
          { key: 'F6', description: '地址栏 ↔ 内容区焦点切换', scope: 'shell' },
          { key: 'Tab', description: '下一个可交互元素', scope: 'shell' },
          { key: 'Shift+Tab', description: '上一个可交互元素', scope: 'shell' },
          { key: 'Space', description: '向下滚动一屏', scope: 'page' },
          { key: 'Shift+Space', description: '向上滚动一屏', scope: 'page' },
          { key: 'Home', description: '页面顶部', scope: 'page' },
          { key: 'End', description: '页面底部', scope: 'page' },
          { key: 'Ctrl+Home', description: '聚焦到页面顶部', scope: 'page' },
          { key: 'Ctrl+End', description: '聚焦到页面底部', scope: 'page' },
        ],
      },
    ],
  },
  {
    label: 'VIM 模式',
    value: 'vim',
    sections: [
      {
        title: '导航（始终生效）',
        entries: [
          { key: 'Cmd+F', description: '搜索', scope: 'global' },
          { key: 'Cmd+L', description: '地址栏', scope: 'global' },
          { key: 'Cmd+K', description: '命令面板', scope: 'global' },
          { key: 'Cmd+T', description: '新建标签', scope: 'global' },
          { key: 'Cmd+W', description: '关闭标签', scope: 'global' },
          { key: 'Cmd+Shift+T', description: '恢复标签', scope: 'global' },
          { key: 'Cmd+N', description: '新建窗口', scope: 'global' },
          { key: 'Cmd+,', description: '设置', scope: 'global' },
          { key: 'F12', description: 'DevTools', scope: 'global' },
        ],
      },
      {
        title: '模式切换',
        entries: [
          { key: 'Esc', description: '回到 Normal 模式', scope: 'shell' },
          { key: 'Ctrl+[', description: '回到 Normal 模式（等同 Esc）', scope: 'shell' },
          { key: 'i', description: '进入 Insert 模式（光标前）', scope: 'shell' },
          { key: 'I', description: '进入 Insert 模式（行首）', scope: 'shell' },
          { key: 'a', description: '进入 Insert 模式（光标后）', scope: 'shell' },
          { key: 'A', description: '进入 Insert 模式（行尾）', scope: 'shell' },
          { key: 'o', description: '下方新建行并进入 Insert', scope: 'shell' },
          { key: 'O', description: '上方新建行并进入 Insert', scope: 'shell' },
          { key: 'v', description: '进入 Visual 模式', scope: 'shell' },
          { key: 'V', description: '进入 Visual 行选择模式', scope: 'shell' },
          { key: ':', description: '进入 Command 模式（地址栏）', scope: 'shell' },
        ],
      },
      {
        title: '光标移动（页面级）',
        entries: [
          { key: 'h', description: '左', scope: 'page' },
          { key: 'j', description: '下', scope: 'page' },
          { key: 'k', description: '上', scope: 'page' },
          { key: 'l', description: '右', scope: 'page' },
          { key: 'w', description: '下一个词头', scope: 'page' },
          { key: 'b', description: '上一个词头', scope: 'page' },
          { key: 'e', description: '当前/下一个词尾', scope: 'page' },
          { key: '0', description: '行首', scope: 'page' },
          { key: '$', description: '行尾', scope: 'page' },
          { key: '^', description: '行首非空字符', scope: 'page' },
          { key: 'gg', description: '页面顶部', scope: 'page' },
          { key: 'G', description: '页面底部', scope: 'page' },
        ],
      },
      {
        title: '跳转（页面级）',
        entries: [
          { key: 'f{char}', description: '向右跳到字符', scope: 'page' },
          { key: 'F{char}', description: '向左跳到字符', scope: 'page' },
          { key: 't{char}', description: '向右跳到字符前', scope: 'page' },
          { key: 'T{char}', description: '向左跳到字符前', scope: 'page' },
        ],
      },
      {
        title: '数字前缀',
        entries: [
          { key: '{N}j / {N}k', description: '向下/上 N 行', scope: 'page' },
          { key: '{N}x', description: '删除 N 个字符', scope: 'shell' },
          { key: '{N}dd', description: '删除 N 行', scope: 'shell' },
          { key: '10G', description: '跳转到第 10 行', scope: 'page' },
        ],
      },
      {
        title: '编辑（外壳级）',
        entries: [
          { key: 'x', description: '删除当前字符', scope: 'shell' },
          { key: 'dd', description: '删除行', scope: 'shell' },
          { key: 'yy', description: '复制行', scope: 'shell' },
          { key: 'p', description: '粘贴', scope: 'shell' },
          { key: 'P', description: '前方粘贴', scope: 'shell' },
          { key: 'u', description: '撤销', scope: 'shell' },
          { key: 'Ctrl+r', description: '重做', scope: 'shell' },
          { key: 's', description: '删除当前字符并插入', scope: 'shell' },
          { key: 'S', description: '删除整行并插入', scope: 'shell' },
          { key: 'D', description: '删除到行尾', scope: 'shell' },
          { key: 'C', description: '修改到行尾', scope: 'shell' },
          { key: 'cw', description: '修改到词尾', scope: 'shell' },
          { key: 'ci"', description: '修改引号内内容', scope: 'shell' },
          { key: 'ci(', description: '修改括号内内容', scope: 'shell' },
          { key: 'dw', description: '删除到词尾', scope: 'shell' },
          { key: 'di"', description: '删除引号内内容', scope: 'shell' },
          { key: 'di(', description: '删除括号内内容', scope: 'shell' },
        ],
      },
      {
        title: '搜索（页面级）',
        entries: [
          { key: '/pattern', description: '向前搜索', scope: 'page' },
          { key: '?pattern', description: '向后搜索', scope: 'page' },
          { key: 'n', description: '下一个匹配', scope: 'page' },
          { key: 'N', description: '上一个匹配', scope: 'page' },
          { key: '*', description: '搜索当前单词（向下）', scope: 'page' },
          { key: '#', description: '搜索当前单词（向上）', scope: 'page' },
        ],
      },
      {
        title: '标签切换',
        entries: [
          { key: 'gt', description: '下一个标签', scope: 'shell' },
          { key: 'gT', description: '上一个标签', scope: 'shell' },
          { key: '{N}gt', description: '跳转到第 N 个标签', scope: 'shell' },
        ],
      },
      {
        title: '提示模式（页面级）',
        entries: [
          { key: 'f', description: '标记页面上的链接/按钮', scope: 'page' },
          { key: 'F', description: '同 f（在新标签打开）', scope: 'page' },
        ],
      },
      {
        title: 'Command 模式',
        entries: [
          { key: ':open {url}', description: '打开 URL', scope: 'shell' },
          { key: ':tabnew', description: '新建标签', scope: 'shell' },
          { key: ':tabclose', description: '关闭标签', scope: 'shell' },
          { key: ':tabnext', description: '下一个标签', scope: 'shell' },
          { key: ':tabprev', description: '上一个标签', scope: 'shell' },
          { key: ':tabfirst', description: '第一个标签', scope: 'shell' },
          { key: ':tablast', description: '最后一个标签', scope: 'shell' },
          { key: ':set gui', description: '切换到 GUI 模式', scope: 'shell' },
          { key: ':nohlsearch', description: '取消搜索高亮', scope: 'page' },
        ],
      },
    ],
  },
]
