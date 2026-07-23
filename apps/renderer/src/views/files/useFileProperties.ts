import type { FileEntry } from '@browser/ipc-contract'
import { useDialog } from 'naive-ui'
import type { Ref } from 'vue'
import { h, ref } from 'vue'

/** useFileProperties 依赖的外部状态（由 useFileStore 注入） */
export interface FilePropertiesDeps {
  currentPath: Ref<string>
  fileEntries: Ref<FileEntry[]>
  /** i18n 翻译函数 */
  t: (key: string) => string
}

/** 文件夹统计信息 */
interface FolderStats {
  totalSize: number
  fileCount: number
  dirCount: number
}

/**
 * 文件属性弹窗。
 * 从 FileEntry 已知字段填充 name/type/size/时间，通过 fs:stat 获取权限信息。
 * 文件夹：递归计算内部所有文件大小总和，并显示包含的文件/文件夹数量。
 */
export function useFileProperties(deps: FilePropertiesDeps) {
  const { currentPath, t } = deps
  const dialog = useDialog()

  /** 打开属性弹窗 */
  function showProperties(file: FileEntry): void {
    console.debug(
      '[useFileProperties] showProperties: %s isDir=%s',
      file.path,
      file.type === 'directory'
    )
    const loading = ref(true)
    const permissions = ref('无法获取')

    // 文件夹专属数据
    const folderTotalSize = ref<number | null>(null)
    const folderFileCount = ref(0)
    const folderDirCount = ref(0)
    const loadingFolder = ref(false)

    // 文件夹统计的取消控制器
    const abortController = new AbortController()

    // 启动文件夹统计（如果是文件夹）
    if (file.type === 'directory') {
      loadingFolder.value = true
      calculateFolderStats(file.path, abortController.signal, (stats) => {
        folderTotalSize.value = stats.totalSize
        folderFileCount.value = stats.fileCount
        folderDirCount.value = stats.dirCount
      })
        .then(() => {
          /* 进度回调已实时同步结果，最终态无需额外处理 */
        })
        .catch(() => {
          if (!abortController.signal.aborted) {
            folderTotalSize.value = 0
          }
        })
        .finally(() => {
          loadingFolder.value = false
        })
    }

    const kindLabel = getFileKindLabel(file, t)

    const label = t('files.propertiesName')
    const typeLabel = t('files.propertiesType')
    const sizeLabel = t('files.propertiesSize')
    const modifiedLabel = t('files.propertiesModified')
    const createdLabel = t('files.propertiesCreated')
    const locationLabel = t('files.propertiesLocation')
    const permissionsLabel = t('files.propertiesPermissions')
    const containsLabel = t('files.contains')

    window.browserAPI
      .stat(file.path)
      .then((stat) => {
        permissions.value = stat.permissions
      })
      .catch(() => {
        permissions.value = '无法获取'
      })
      .finally(() => {
        loading.value = false
      })

    // 弹窗关闭时取消文件夹统计
    const handleClose = () => abortController.abort()

    dialog.create({
      title: t('files.properties'),
      closable: true,
      maskClosable: true,
      showIcon: false,
      style: 'width:460px',
      onClose: handleClose,
      onMaskClick: () => {
        handleClose()
      },
      content: () =>
        h('div', { style: 'min-height:60px' }, [
          loading.value
            ? h(
                'div',
                { style: 'text-align:center;padding:32px 0;color:var(--n-text-color-3)' },
                '加载中…'
              )
            : h('div', { style: 'display:flex;flex-direction:column;gap:0' }, [
                renderPropertyRow(
                  'name',
                  label,
                  file.name,
                  h('div', { style: 'font-weight:600' }, file.name)
                ),
                renderPropertyRow('type', typeLabel, kindLabel),
                renderPropertyRow(
                  'size',
                  sizeLabel,
                  file.type === 'directory'
                    ? `${formatFileSize(folderTotalSize.value ?? 0)}${loadingFolder.value ? '（计算中…）' : ''}`
                    : formatFileSize(file.size)
                ),
                ...(file.type === 'directory'
                  ? [
                      renderPropertyRow(
                        'contains',
                        containsLabel,
                        `${folderFileCount.value} 个文件，${folderDirCount.value} 个文件夹`
                      ),
                    ]
                  : []),
                renderPropertyRow('modified', modifiedLabel, formatTime(file.modifiedAt)),
                renderPropertyRow('created', createdLabel, formatTime(file.createdAt)),
                renderPropertyRow('location', locationLabel, currentPath.value),
                renderPropertyRow('permissions', permissionsLabel, permissions.value),
              ]),
        ]),
    })
  }

  /**
   * 递归计算文件夹内所有文件大小总和及文件/文件夹数量。
   * 使用 setTimeout 让出时间片，避免大目录卡死 UI 线程。
   * 支持 AbortSignal 取消（弹窗关闭时调用）。
   * 通过 onProgress 回调实时更新进度，让弹窗界面可以看到数字一直在变化。
   */
  async function calculateFolderStats(
    dirPath: string,
    signal: AbortSignal,
    onProgress: (stats: FolderStats) => void
  ): Promise<FolderStats> {
    console.debug('[useFileProperties] calculateFolderStats: %s', dirPath)
    let totalSize = 0
    let fileCount = 0
    let dirCount = 0

    async function recurse(path: string): Promise<void> {
      try {
        const entries = await window.browserAPI.readDir(path)
        for (const entry of entries) {
          // 检查取消信号
          if (signal.aborted) {
            throw new DOMException('Aborted', 'AbortError')
          }

          // 让出时间片，避免大目录卡死
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 0)
            const onAbort = () => {
              clearTimeout(timer)
              reject(new DOMException('Aborted', 'AbortError'))
            }
            signal.addEventListener('abort', onAbort, { once: true })
          })

          if (entry.type === 'directory') {
            dirCount += 1
            onProgress({ totalSize, fileCount, dirCount })
            await recurse(entry.path)
          } else {
            fileCount += 1
            totalSize += entry.size ?? 0
            onProgress({ totalSize, fileCount, dirCount })
          }
        }
      } catch {
        // 某子目录无权限或已取消，跳过
      }
    }

    await recurse(dirPath)

    return { totalSize, fileCount, dirCount }
  }

  return { showProperties }
}

// ── 辅助函数 ──

/** 文件类型标签 */
function getFileKindLabel(file: FileEntry, t: (key: string) => string): string {
  if (file.type === 'directory') return t('files.kindFolder')
  const ext = file.extension?.toLowerCase()
  if (!ext) return t('files.kindOther')
  const kindMap: Record<string, string> = {
    jpg: 'JPEG 图片',
    jpeg: 'JPEG 图片',
    png: 'PNG 图片',
    gif: 'GIF 图片',
    svg: 'SVG 图片',
    webp: 'WebP 图片',
    mp4: 'MP4 视频',
    mov: 'QuickTime 视频',
    avi: 'AVI 视频',
    mkv: 'MKV 视频',
    mp3: 'MP3 音频',
    wav: 'WAV 音频',
    pdf: 'PDF 文档',
    zip: 'ZIP 压缩包',
    tar: 'TAR 压缩包',
    gz: 'GZIP 压缩包',
    txt: '文本文件',
    md: 'Markdown 文件',
    js: 'JavaScript 文件',
    ts: 'TypeScript 文件',
    html: 'HTML 文件',
    css: 'CSS 文件',
    json: 'JSON 文件',
    py: 'Python 文件',
  }
  return kindMap[ext] ?? `${ext.toUpperCase()} 文件`
}

/** 文件大小格式化 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / 1024 ** i
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 时间戳格式化（毫秒） */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 属性行渲染 */
function renderPropertyRow(
  key: string,
  label: string,
  value: string,
  valueNode?: ReturnType<typeof h>
): ReturnType<typeof h> {
  return h(
    'div',
    {
      key,
      style:
        'display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:10px 4px;border-bottom:1px solid var(--n-border-color)',
    },
    [
      h(
        'div',
        { style: 'flex-shrink:0;width:88px;color:var(--n-text-color-3);font-size:13px' },
        label
      ),
      h(
        'div',
        {
          style:
            'flex:1;text-align:right;color:var(--n-text-color);font-size:13px;word-break:break-all',
        },
        valueNode ?? value
      ),
    ]
  )
}
