import { NFormItem, NInput, useDialog } from 'naive-ui'
import type { VNodeChild } from 'vue'
import { h, ref } from 'vue'

/** 确认弹窗的可配置文案 */
export interface ConfirmOptions {
  /** 标题 */
  title: string
  /** 正文内容 */
  content: string
  /** 确认按钮文案 */
  positiveText: string
  /** 取消按钮文案 */
  negativeText: string
  /** 弹窗类型（对应 Naive UI dialog 的语义样式），默认 warning */
  type?: 'warning' | 'error' | 'info' | 'success'
}

/** 表单弹窗中的单个字段定义 */
export interface PromptField {
  /** 字段键，作为返回结果对象的属性名 */
  key: string
  /** 字段标签 */
  label: string
  /** 输入框占位符 */
  placeholder?: string
  /** 初始值 */
  defaultValue?: string
  /** 是否必填（必填字段为空时确认按钮无效）。默认 false */
  required?: boolean
}

/** 表单弹窗的可配置项 */
export interface PromptFormOptions {
  /** 标题 */
  title: string
  /** 确认按钮文案 */
  positiveText: string
  /** 取消按钮文案 */
  negativeText: string
  /** 字段定义 */
  fields: PromptField[]
}

/**
 * 统一的确认 / 输入弹窗 composable，替代阻塞主线程、样式不可控的原生 window.confirm / window.prompt。
 * 基于 Naive UI 的 useDialog，自动继承 NConfigProvider 主题（跟随亮/暗色）。
 * 必须在 <NDialogProvider> 之内的组件里调用（见 App.vue）。
 */
export function useConfirm() {
  const dialog = useDialog()

  /**
   * 确认弹窗。返回 Promise<boolean>：点确认为 true，点取消/关闭为 false，
   * 调用方可直接 `if (!(await confirm(...))) return` 使用，语义贴近原生 confirm。
   */
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      dialog[options.type ?? 'warning']({
        title: options.title,
        content: options.content,
        positiveText: options.positiveText,
        negativeText: options.negativeText,
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        // 点遮罩/关闭按钮关闭时视为取消
        onClose: () => resolve(false),
        onMaskClick: () => resolve(false),
      })
    })
  }

  /**
   * 表单输入弹窗（支持一个或多个字段）。
   * 返回 Promise<Record<string, string> | null>：点确认返回各字段去除首尾空白后的值映射，
   * 若有必填字段为空则视为取消返回 null；点取消/关闭同样返回 null。
   */
  const promptForm = (options: PromptFormOptions): Promise<Record<string, string> | null> => {
    return new Promise((resolve) => {
      const values = ref<Record<string, string>>(
        Object.fromEntries(options.fields.map((f) => [f.key, f.defaultValue ?? '']))
      )

      const collect = (): Record<string, string> | null => {
        const result: Record<string, string> = {}
        for (const field of options.fields) {
          const trimmed = (values.value[field.key] ?? '').trim()
          if (field.required && trimmed.length === 0) return null
          result[field.key] = trimmed
        }
        return result
      }

      const renderContent = (): VNodeChild =>
        options.fields.map((field, index) =>
          h(
            NFormItem,
            {
              key: field.key,
              label: field.label,
              showFeedback: false,
              style: index > 0 ? 'margin-top:12px' : '',
            },
            {
              default: () =>
                h(NInput, {
                  value: values.value[field.key],
                  placeholder: field.placeholder,
                  autofocus: index === 0,
                  'onUpdate:value': (v: string) => {
                    values.value = { ...values.value, [field.key]: v }
                  },
                }),
            }
          )
        )

      dialog.create({
        title: options.title,
        positiveText: options.positiveText,
        negativeText: options.negativeText,
        content: renderContent,
        onPositiveClick: () => resolve(collect()),
        onNegativeClick: () => resolve(null),
        onClose: () => resolve(null),
        onMaskClick: () => resolve(null),
      })
    })
  }

  /**
   * 单字段输入弹窗，promptForm 的便捷封装。
   * 返回 Promise<string | null>：确认返回去空白后的值（必填为空视为取消），取消/关闭返回 null。
   */
  const prompt = (options: {
    title: string
    positiveText: string
    negativeText: string
    label: string
    placeholder?: string
    defaultValue?: string
  }): Promise<string | null> => {
    return promptForm({
      title: options.title,
      positiveText: options.positiveText,
      negativeText: options.negativeText,
      fields: [
        {
          key: 'value',
          label: options.label,
          placeholder: options.placeholder,
          defaultValue: options.defaultValue,
          required: true,
        },
      ],
    }).then((res) => (res ? res.value : null))
  }

  return { confirm, prompt, promptForm }
}
