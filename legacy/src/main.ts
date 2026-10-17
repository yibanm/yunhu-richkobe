import { createApp } from 'vue'
import App from './App.vue'
import { ctx, bootstrap } from './app'
import './styles.css'

/**
 * 屏上启动信标：把启动阶段与错误直接画在左上角小标签里。
 * WebView 的 console/CDP 在部分设备与模拟器上完全不可用，
 * 黑屏时没有任何可观测手段；信标让任何环境都能肉眼读出卡在哪一步。
 * 正常启动完成后自动移除，不影响成品界面。
 */
const beacon = document.createElement('div')
beacon.id = 'yh-boot-beacon'
beacon.style.cssText =
  'position:fixed;left:0;top:0;z-index:2147483647;background:#000;color:#7CFC00;' +
  'font:11px/1.4 monospace;padding:2px 6px;max-width:92vw;white-space:pre-wrap;pointer-events:none'
document.documentElement.appendChild(beacon)
const phases: string[] = ['module']
function phase(p: string) {
  phases.push(p)
  beacon.textContent = phases.join(' > ')
}
window.addEventListener('error', (e) => phase(`ERR ${e.message}@${e.lineno}`))
window.addEventListener('unhandledrejection', (e) =>
  phase(`REJ ${String((e as any).reason?.message || (e as any).reason).slice(0, 80)}`))

const app = createApp(App)
app.provide('ctx', ctx)
app.config.errorHandler = (err: any) => {
  phase('vue-err')
  ctx.logger?.error('vue error:', err?.message || String(err))
}

/** 启动失败兜底：渲染可视错误卡（附信标收集的阶段与错误） */
function showFatal(e?: any) {
  const root = document.getElementById('app')
  if (!root) return
  if (e) phase(`bootstrap: ${e?.message || String(e)}`)
  root.innerHTML =
    '<div class="fatal-wrap"><div class="fatal-card">' +
    '<h2>启动失败</h2>' +
    '<p class="dim">应用初始化未完成。请检查网络 / API 基址后重试；若反复出现请反馈以下信息。</p>' +
    '<pre></pre>' +
    '<button onclick="location.reload()">重新加载</button>' +
    '</div></div>'
  const pre = root.querySelector('pre')
  if (pre) pre.textContent = `${phases.join(' > ')}\n---\nua=${navigator.userAgent}\nhref=${location.href}`
}

phase('pre-bootstrap')
;(async () => {
  try {
    await bootstrap()
  } catch (e: any) {
    console.error('[bootstrap]', e)
    showFatal(e)
    return
  }
  phase('mounted')
  app.mount('#app')
  // 启动时尝试恢复上次登录
  ;(ctx as any).auth?.restore?.()
  // 调试句柄：控制台里可直接查看插件/服务/页面状态
  ;(window as any).__yunhu = ctx
  // 黑屏看门狗：挂载后仍无任何子节点说明渲染链路断了，把阶段与错误亮出来
  setTimeout(() => {
    const root = document.getElementById('app')
    if (root && root.childElementCount === 0) {
      phase('watchdog-empty')
      showFatal()
    } else {
      beacon.remove()
    }
  }, 5000)
})()
