import { createApp } from 'vue'
import App from './App.vue'
import { ctx, bootstrap } from './app'
import './styles.css'

const app = createApp(App)
app.provide('ctx', ctx)
app.config.errorHandler = (err: any) => ctx.logger?.error('vue error:', err?.message || String(err))

/**
 * 启动失败兜底：渲染可视错误页（含堆栈），杜绝 WebView/桌面壳里的黑屏白屏无反馈。
 * 安卓冷启动黑屏的根因之一就是 bootstrap 抛错后只有 console.error。
 */
function showFatal(e: any) {
  const root = document.getElementById('app')
  if (!root) return
  const stack = (e && (e.stack || e.message)) || String(e)
  root.innerHTML =
    '<div class="fatal-wrap"><div class="fatal-card">' +
    '<h2>启动失败</h2>' +
    '<p class="dim">应用初始化时出错。请检查网络 / API 基址后重试；若反复出现请反馈以下信息。</p>' +
    '<pre></pre>' +
    '<button onclick="location.reload()">重新加载</button>' +
    '</div></div>'
  const pre = root.querySelector('pre')
  if (pre) pre.textContent = stack
}

;(async () => {
  try {
    await bootstrap()
  } catch (e: any) {
    console.error('[bootstrap]', e)
    showFatal(e)
    return
  }
  app.mount('#app')
  // 启动时尝试恢复上次登录
  ;(ctx as any).auth?.restore?.()
  // 调试句柄：控制台里可直接查看插件/服务/页面状态
  ;(window as any).__yunhu = ctx
})()
