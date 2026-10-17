/**
 * 类型化的 ctx 注入钩子。
 * Vue 的 inject('ctx') 默认返回 unknown，导致组件里 ctx.<服务> 全部报 TS2339；
 * 这里统一用 cordis 的 Context 接口（含 augment.ts 的服务声明）收敛类型。
 */
import { inject } from 'vue'
import type { Context } from './context'

export const CTX_KEY = 'ctx'

export function useCtx(): Context {
  const ctx = inject<Context>(CTX_KEY)
  if (!ctx) throw new Error('useCtx 必须在 app.provide("ctx", ctx) 之后使用')
  return ctx
}
