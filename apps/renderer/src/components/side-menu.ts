import type { I18nKey } from '@browser/shared'

/** 左侧悬浮菜单项配置（供 PageLayout 的 sideMenu prop 使用） */
export interface SideMenuItem {
  /** 唯一标识 */
  key: string
  /** i18n key，由 PageLayout 内部翻译 */
  labelKey: I18nKey
  /** 图标（iconify 名称），可选 */
  icon?: string
  /** 路由目标；提供时渲染为 RouterLink，并自动高亮当前路由 */
  to?: string
}
