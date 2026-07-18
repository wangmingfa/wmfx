/**
 * 请求拦截器（Request Interceptor）
 *
 * 职责：
 * - 基于 `session.webRequest` 完整钩子链捕获所有请求，推送到 `wmfx://interceptor` 页面
 * - 规则引擎：Block（拦截）、Redirect（重定向）、Mock（Mock 服务器）
 * - 通过 SessionManager.onSessionReady 对每个 session 幂等挂载
 *
 * 与 AdBlocker 的关系：
 * - AdBlocker 是静默的自动化域名级过滤
 * - Interceptor 是交互式开发者工具，展示所有请求并允许用户定义规则
 */

export { InterceptorEngine } from './InterceptorEngine'
export { RequestCapturer } from './RequestCapturer'
export type { CapturedRequest, InterceptorRule } from './types'
