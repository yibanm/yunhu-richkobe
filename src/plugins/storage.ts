/**
 * storage 插件
 * 提供 ctx.storage：用户数据持久化（登录态/会话缓存/PIN/锁/扫码中继）
 *   · Web：走本地 server 的 /data/<name>（server.ts 落盘到「文档/yhchat」）
 *   · 桌面/安卓：端点不可用时自动回退 localStorage，登录不被阻塞
 * 内存镜像：同一会话内重复读同一 key 不再发请求。
 */
export const storagePlugin = {
  name: 'storage',
  provide: ['storage'],

  apply(ctx) {
    const mem = new Map<string, any>()
    let ok: boolean | null = null   // 仅缓存「可用」，失败下次仍重试（dev 时 server 可能后起）

    async function probe(): Promise<boolean> {
      if (ok === true) return true
      try {
        const r = await fetch('/data/session', { method: 'GET' })
        ok = r.ok
      } catch { ok = false }        // 本次不可用，下次调用再探
      return ok === true
    }

    /** 读一份数据；不存在/不可用返回 {} */
    async function load(name: string): Promise<any> {
      if (mem.has(name)) return mem.get(name)
      if (await probe()) {
        try {
          const r = await fetch('/data/' + name)
          if (r.ok) {
            const j = await r.json()
            mem.set(name, j)
            return j
          }
        } catch { /* 落到回退 */ }
      }
      // 回退：localStorage（旧版本数据 / 无本地 server 的端）
      try {
        const raw = localStorage.getItem('yh.data.' + name)
        if (raw) {
          const j = JSON.parse(raw)
          mem.set(name, j)
          return j
        }
      } catch { /* 忽略坏数据 */ }
      const empty = {}
      mem.set(name, empty)
      return empty
    }

    /** 写一份数据；返回是否落到了文件（false=只落在 localStorage 回退） */
    async function save(name: string, value: any): Promise<boolean> {
      mem.set(name, value)
      const raw = JSON.stringify(value)
      if (await probe()) {
        try {
          const r = await fetch('/data/' + name, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: raw,
          })
          if (r.ok) return true
        } catch { /* 落到回退 */ }
      }
      try { localStorage.setItem('yh.data.' + name, raw) } catch { /* 配额满等，忽略 */ }
      return false
    }

    /** 删一份数据（幂等） */
    async function remove(name: string): Promise<void> {
      mem.delete(name)
      if (await probe()) {
        try { await fetch('/data/' + name, { method: 'DELETE' }) } catch { /* 忽略 */ }
      }
      try { localStorage.removeItem('yh.data.' + name) } catch { /* 忽略 */ }
    }

    ctx.set('storage', { load, save, remove, probe })
  },
}
