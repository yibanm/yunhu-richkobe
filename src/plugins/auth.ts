/**
 * auth 插件
 * 提供 ctx.auth：登录态管理（邮箱登录 / token 登录 / 持久化 / 自动恢复）
 * 依赖：api、storage
 * 凭据（token/设备号）落盘到 storage 的 session 数据（文档/yhchat/session.json），
 * 旧版本存在 localStorage 的 yh.token/yh.device 会在首次读写时迁移并清除。
 */
import { reactive, watch } from 'vue'
import AccountPage from '../console/pages/AccountPage.vue'

export const authPlugin = {
  name: 'auth',
  inject: ['api', 'storage'],
  provide: ['auth'],

  apply(ctx) {
    const api = ctx.get('api')
    const storage = ctx.get('storage')

    const state = reactive({
      status: 'guest', // guest | loading | ready
      user: null,
      error: '',
    })

    let deviceId = ''
    /** 设备号：优先落盘值 → 旧 localStorage 迁移 → 新生成（迁移后清除旧 key） */
    async function ensureDevice(): Promise<string> {
      if (deviceId) return deviceId
      const s = await storage.load('session').catch(() => ({}))
      const legacy = localStorage.getItem('yh.device')
      deviceId = s.device || legacy || ('web-' + Math.random().toString(36).slice(2))
      if (legacy) localStorage.removeItem('yh.device')
      if (!s.device) await storage.save('session', { ...s, device: deviceId }).catch(() => {})
      return deviceId
    }

    async function enter(token) {
      api.setToken(token)
      state.status = 'loading'
      state.error = ''
      try {
        const user = await api.self()
        state.user = user
        state.status = 'ready'
        // 凭据落盘（storage 不可用时自动回退 localStorage，登录不被阻塞）
        const s = await storage.load('session').catch(() => ({}))
        await storage.save('session', { ...s, token, device: deviceId || s.device }).catch(() => {})
        localStorage.removeItem('yh.token')   // 旧 key 迁移后清除，避免双份凭据
        ctx.emit('auth/login', user)
        return user
      } catch (e) {
        api.setToken('')
        state.status = 'guest'
        state.user = null
        throw e
      }
    }

    const auth = {
      state,
      get user() { return state.user },
      get isLoggedIn() { return state.status === 'ready' },
      /** 当前设备号（ws 登录包要用同一个，避免一机多设备号） */
      get deviceId() { return deviceId },

      async login(email, password) {
        state.error = ''
        const dev = await ensureDevice()
        const token = await api.login(email, password, dev, 'web')
        return enter(token)
      },

      async loginWithToken(token) {
        await ensureDevice()
        return enter(token.trim())
      },

      /**
       * 退出账号：清除本地**全部凭据**（token/设备号/PIN/锁态/会话缓存/扫码中继），
       * 保留非凭据偏好（主题/壁纸/快捷回复等）。
       */
      async logout() {
        api.setToken('')
        state.user = null
        state.status = 'guest'
        deviceId = ''
        localStorage.removeItem('yh.token')
        localStorage.removeItem('yh.device')
        localStorage.removeItem('yh.data.session')
        localStorage.removeItem('yh.data.cache')
        for (const k of ['session', 'cache', 'pin', 'lock', 'relay']) {
          await storage.remove(k).catch(() => {})
        }
        ctx.emit('auth/logout')
      },

      /** 页面加载时尝试恢复上次的登录态（凭据从落盘文件读） */
      async restore() {
        const legacy = localStorage.getItem('yh.token')
        const s = await storage.load('session').catch(() => ({}))
        const t = s.token || legacy
        if (!t) return
        await ensureDevice()
        try { await enter(t) } catch { /* 忽略，回到登录页；坏凭据不残留 */ }
      },
    }

    // 登录/登出时自动打日志（演示事件总线）
    ctx.on('auth/login', u => ctx.logger?.info(`已登录：${u.name} (${u.id})`))
    ctx.on('auth/logout', () => ctx.logger?.info('已退出登录'))

    // 避免未使用告警
    void watch

    ctx.set('auth', auth)

    /* ---- 控制台扩展：账号页面 ---- */
    ctx.inject(['console'], (ctx) => {
      ctx.console.addEntry((cc) => {
        cc.page({ name: '账号', path: '/account', icon: 'userCircle', order: 950, component: AccountPage })
      })
    })
  },
}
