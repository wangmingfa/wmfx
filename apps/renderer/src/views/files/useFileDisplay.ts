import type { FileEntry } from '@browser/ipc-contract'

import { useI18n } from '@/composables/useI18n'

/**
 * 文件展示辅助：文件图标 / 图标颜色 / 种类标签 / 大小格式化。
 * 纯展示逻辑，从 FilesView 抽离，供 FileList 等组件复用。
 */
export function useFileDisplay() {
  const { t } = useI18n()

  // 文件图标
  function getFileIcon(file: FileEntry): string {
    if (file.isDir) {
      return 'mdi:folder'
    }
    const ext = file.extension.toLowerCase()
    const iconMap: Record<string, string> = {
      jpg: 'mdi:file-image',
      jpeg: 'mdi:file-image',
      png: 'mdi:file-image',
      gif: 'mdi:file-image',
      svg: 'mdi:file-image',
      pdf: 'mdi:file-pdf-box',
      txt: 'mdi:file-document',
      md: 'mdi:file-document',
      js: 'mdi:file-code',
      ts: 'mdi:file-code',
      html: 'mdi:file-code',
      css: 'mdi:file-code',
      json: 'mdi:file-code',
      mp3: 'mdi:file-music',
      mp4: 'mdi:file-video',
      zip: 'mdi:zip-box',
    }
    return iconMap[ext] || 'mdi:file'
  }

  /** 按文件类型返回图标颜色（与图标语义一致，便于快速区分文件种类） */
  function getFileIconColor(file: FileEntry): string {
    if (file.isDir) {
      return '#f5a623'
    } // 文件夹：橙黄
    const ext = file.extension.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
      return '#27ae60'
    } // 图片：绿
    if (['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
      return '#9b59b6'
    } // 视频：紫
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
      return '#e91e63'
    } // 音频：粉
    if (ext === 'pdf') {
      return '#d32f2f'
    } // PDF：红
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) {
      return '#8d6e63'
    } // 压缩包：棕
    if (
      [
        'js',
        'ts',
        'tsx',
        'jsx',
        'json',
        'css',
        'html',
        'vue',
        'py',
        'go',
        'rs',
        'java',
        'c',
        'cpp',
        'sh',
      ].includes(ext)
    ) {
      return '#2196f3'
    } // 代码：蓝
    if (['txt', 'md', 'doc', 'docx', 'rtf', 'log'].includes(ext)) {
      return '#607d8b'
    } // 文档：蓝灰
    return 'var(--text-muted)' // 未知类型：随主题弱化
  }

  /** 按文件类型返回种类标签（列表视图「种类」列） */
  function getFileKind(file: FileEntry): string {
    if (file.isDir) {
      return t('files.kindFolder')
    }
    const ext = file.extension.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
      return t('files.kindImage')
    }
    if (['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) {
      return t('files.kindVideo')
    }
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) {
      return t('files.kindAudio')
    }
    if (ext === 'pdf') {
      return t('files.kindPdf')
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz'].includes(ext)) {
      return t('files.kindArchive')
    }
    if (
      [
        'js',
        'ts',
        'tsx',
        'jsx',
        'json',
        'css',
        'html',
        'vue',
        'py',
        'go',
        'rs',
        'java',
        'c',
        'cpp',
        'sh',
      ].includes(ext)
    ) {
      return t('files.kindCode')
    }
    if (['txt', 'md', 'doc', 'docx', 'rtf', 'log'].includes(ext)) {
      return t('files.kindDoc')
    }
    return t('files.kindOther')
  }

  // 格式化大小（0 显示为空，与列表「大小」列的展示习惯一致）
  function formatSize(bytes: number): string {
    if (bytes === 0) {
      return ''
    }
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
  }

  return { getFileIcon, getFileIconColor, getFileKind, formatSize }
}
