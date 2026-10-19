/** ui 插件：主题、Toast 提示、视图状态（主题可由配置文件的 app.theme 指定） */
import { reactive } from 'vue'
import type { Context } from '../core/context'

export const uiPlugin = {
  name: 'ui',
  provide: ['ui'],

  apply(ctx: Context, config: any = {}) {
    // 主题三态：auto（跟随系统色）/ dark / light。默认 auto；手动切换为覆盖。
    const saved = localStorage.getItem('yh.theme') || config.theme || 'auto'
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const sysDark = () => mq?.matches ?? true
    const effective = (t: string) => (t === 'auto' ? (sysDark() ? 'dark' : 'light') : t)
    const state = reactive({ theme: saved, toasts: [] as any[], panel: 'chat', confirmReq: null as any })
    let seq = 0
    let confirmResolve: ((ok: boolean) => void) | null = null

    const ui = {
      state,
      /** 实际生效的主题（auto 解析后） */
      get effectiveTheme() { return effective(state.theme) },
      /**
       * web 确认框（替代 window.confirm）：返回 Promise<boolean>。
       * 全局单例；同一时刻只允许一个，后发的顶掉前一个（前一个按 false 结算）。
       */
      confirm(title: string, message = '', opts: { okText?: string; cancelText?: string; danger?: boolean } = {}): Promise<boolean> {
        if (confirmResolve) confirmResolve(false)
        state.confirmReq = { title, message, ...opts }
        return new Promise<boolean>((resolve) => { confirmResolve = resolve })
      },
      resolveConfirm(ok: boolean) {
        state.confirmReq = null
        const r = confirmResolve
        confirmResolve = null
        r?.(ok)
      },
      toast(text: string, type = 'info', ms = 3200) {
        const id = ++seq
        state.toasts.push({ id, text, type })
        setTimeout(() => ui.dismiss(id), ms)
        return id
      },
      dismiss(id: number) {
        const i = state.toasts.findIndex((t: any) => t.id === id)
        if (i >= 0) state.toasts.splice(i, 1)
      },
      setPanel(p: string) { state.panel = p },
      setTheme(t: string) {
        state.theme = t
        localStorage.setItem('yh.theme', t)
        applyTheme(effective(t))
      },
      /** 循环：dark → light → auto（跟随系统）→ dark */
      toggleTheme() {
        ui.setTheme(state.theme === 'dark' ? 'light' : state.theme === 'light' ? 'auto' : 'dark')
      },
    }

    function applyTheme(t: string) { document.documentElement.dataset.theme = t }

    ctx.effect(() => {
      applyTheme(effective(state.theme))
      // 系统色变化时，auto 模式实时跟随
      const onSys = () => { if (state.theme === 'auto') applyTheme(effective('auto')) }
      mq?.addEventListener?.('change', onSys)
      return () => { mq?.removeEventListener?.('change', onSys) }
    })

    ctx.on('ui/toast', ({ text, type }: any) => ui.toast(text, type))
    ctx.set('ui', ui)
  },
}
