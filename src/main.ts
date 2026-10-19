import { createApp } from 'vue'
import App from './App.vue'
import { ctx, bootstrap } from './app'
import { platform, applyPlatformAttr, enableRipple } from './platform'
import './styles.css'

applyPlatformAttr(platform)
enableRipple()

const app = createApp(App)
app.provide('ctx', ctx)
app.config.errorHandler = (err: any) => ctx.logger?.error('vue error:', err?.message || String(err))

;(async () => {
  try {
    await bootstrap()
  } catch (e: any) {
    console.error('[bootstrap]', e)
    showCrash(e)
  }
  app.mount('#app')
  // 启动时尝试恢复上次登录
  ;(ctx as any).auth?.restore?.()
  // 调试句柄：控制台里可直接查看插件/服务/页面状态
  ;(window as any).__yunhu = ctx
})()

/**
 * 崩溃可视化（借鉴 Yhchat_md3 的 CrashHandler 思路）：
 * 启动期/运行期抛错且界面没渲染出来时，显示红色错误页而不是黑屏，
 * 安卓 WebView 里 console 看不到，没有这层用户只会看到「黑屏」。
 */
function showCrash(e: any) {
  const root = document.getElementById('app')
  if (!root || root.childElementCount > 0) return
  root.innerHTML =
    '<div style="padding:28px;color:#ffd7d7;font:13px/1.7 monospace;white-space:pre-wrap">' +
    '<b style="font-size:15px">启动失败</b>\n\n' +
    String(e?.message || e).replace(/[<>&]/g, '') +
    '\n\n请截图发给开发者，或点「重载」重试。</div>' +
    '<button onclick="location.reload()" style="margin:0 28px;padding:8px 22px;border-radius:8px;border:0;background:#f2635f;color:#fff;font-size:14px">重载</button>'
}
window.addEventListener('error', (ev) => showCrash(ev.error || ev.message))
window.addEventListener('unhandledrejection', (ev) => showCrash(ev.reason))
