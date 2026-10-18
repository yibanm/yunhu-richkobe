<script setup lang="ts">
/**
 * 控制台外壳（对标 Koishi Console + QQ 客户端导航语义）
 *   · 导航栏按「已注册页面」动态生成 —— 插件装载/卸载，导航项即时增减
 *   · 顶部头像 = 我的资料（QQ 语义）；底部 ☰ = 全局菜单
 *     （收藏/文件/调色盘/聊天记录管理/检查更新/帮助/锁定/设置/退出账号）
 */
import { inject, computed, ref, watch } from 'vue'
import Icon from './components/Icon.vue'
import KSlot from './components/KSlot.vue'
import { resUrl } from '../core/res'
import { fallbackAvatar } from '../core/util'

const ctx = inject<any>('ctx')
const console_ = ctx.console
const ui = ctx.ui
const ws = ctx.ws
const auth = ctx.auth

// 当前页：既支持本组件里点导航栏切换，也支持插件调 ctx.console.goto(path) 跳页
const current = computed({
  get: () => console_.state.currentPage || null,
  set: (v: any) => { console_.state.currentPage = v },
})
const pages = computed(() => console_.pages || [])

/** 主导航只留「消息 / 通讯录」两项（QQ 语义），其余全部进左下 ☰ 菜单 */
const MAIN_PATHS = ['/', '/contacts']
/** 固定菜单项已覆盖的页面路径，动态列表里去重，避免同页两项 */
const COVERED_PATHS = ['/stickers', '/theme', '/logs', '/settings-user', '/plugins']
const railPages = computed(() => pages.value.filter((p: any) => MAIN_PATHS.includes(p.path)))
const morePages = computed(() => pages.value.filter((p: any) => !MAIN_PATHS.includes(p.path) && !COVERED_PATHS.includes(p.path)))

/** 总未读（QQ 式角标，挂在「消息」导航上） */
const totalUnread = computed(() =>
  (ctx.chat?.state?.conversations || []).reduce((n: number, c: any) => n + (c.unread || 0), 0))

/**
 * 当前页对象。
 * ⚠️ current 存的是**路径字符串**，pages 里是**页面对象** —— 必须按 path 找。
 */
const active = computed(() => {
  const list = pages.value
  return list.find((p: any) => p.path === current.value) || list[0] || null
})

watch(pages, (list) => {
  if (!list.some((p: any) => p.path === current.value)) current.value = list[0]?.path || ''
}, { immediate: true })

const wsText = computed(() => ({
  online: '实时在线', connecting: '连接中', retry: '重连中', closed: '已断开', idle: '未连接',
}[ws?.state.status] || '—'))

/* ---------------- QQ 式全局菜单 ---------------- */
const menuOpen = ref(false)
function closeMenu() { menuOpen.value = false }
function go(path: string) { current.value = path; closeMenu() }
/** 按路径找已注册页面；插件没装载时菜单项置灰 */
const has = (path: string) => pages.value.some((p: any) => p.path === path)

function openMe() {
  closeMenu()
  const u = auth?.state.user
  if (u) ctx.group?.openProfile?.({ id: u.id, name: u.name, avatar: u.avatar })
}
function pick(what: string) {
  switch (what) {
    case 'fav': go('/stickers'); break                       // 收藏 → 表情页的收藏分区
    case 'files': ctx.group?.setDockTab?.('disk'); break     // 文件 → 当前会话群文件 dock
    case 'palette': go('/theme'); break                      // 调色盘 → 主题页
    case 'logs': go('/logs'); break                          // 聊天记录管理 → 日志页
    case 'updates': ui?.toast?.('已是最新版本（牢大版 v1.0.0）', 'info'); break
    case 'help': go('/plugins'); break                       // 帮助 → 插件清单页（能力总览）
    case 'lock': ui?.toast?.('锁定功能开发中', 'warn'); break
    case 'settings': go('/settings-user'); break            // 设置 → 用户设置页
    case 'logout': auth?.logout?.(); break                   // 退出账号
  }
  closeMenu()
}
</script>

<template>
  <div class="console">
    <nav class="rail">
      <img class="rail-av" :src="auth?.state.user?.avatar ? resUrl(auth.state.user.avatar) : fallbackAvatar(auth?.state.user?.name)"
           alt="我的资料" title="我的资料" @click="openMe"
           @error="(e: any) => (e.target.src = fallbackAvatar(auth?.state.user?.name))" />
      <div class="rail-items">
        <button v-for="p in railPages" :key="p.path"
                class="rail-btn" :class="{ on: active === p }"
                :title="p.name" @click="current = p.path">
          <Icon :name="p.icon" />
          <span v-if="p.path === '/' && totalUnread" class="badge rail-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
        </button>
      </div>
      <div class="rail-foot">
        <button class="rail-btn" :title="ui.state.theme === 'dark' ? '切换到浅色' : '切换到深色'"
                @click="ui.toggleTheme()">
          <Icon :name="ui.state.theme === 'dark' ? 'sun' : 'moon'" />
        </button>
        <div class="rail-menu-wrap">
          <button class="rail-btn" title="菜单" @click.stop="menuOpen = !menuOpen">
            <Icon name="menu" />
          </button>
          <div v-if="menuOpen" class="rail-menu" @click.stop>
            <button class="rm-item" :disabled="!has('/stickers')" @click="pick('fav')"><Icon name="star" :size="15" /> 收藏</button>
            <button class="rm-item" @click="pick('files')"><Icon name="folder" :size="15" /> 文件</button>
            <button class="rm-item" :disabled="!has('/theme')" @click="pick('palette')"><Icon name="palette" :size="15" /> 调色盘</button>
            <div class="rm-sep"></div>
            <button class="rm-item" :disabled="!has('/logs')" @click="pick('logs')"><Icon name="clock" :size="15" /> 聊天记录管理</button>
            <button class="rm-item" @click="pick('updates')"><Icon name="download" :size="15" /> 检查更新</button>
            <button class="rm-item" :disabled="!has('/plugins')" @click="pick('help')"><Icon name="help" :size="15" /> 帮助</button>
            <button class="rm-item" disabled><Icon name="lock" :size="15" /> 锁定</button>
            <div class="rm-sep"></div>
            <button class="rm-item" :disabled="!has('/settings-user')" @click="pick('settings')"><Icon name="settings" :size="15" /> 用户设置</button>
            <div class="rm-sep"></div>
            <!-- 其余插件注册页（动态） -->
            <button v-for="p in morePages" :key="p.path" class="rm-item" @click="go(p.path)">
              <Icon :name="p.icon" :size="15" /> {{ p.name }}
            </button>
            <div class="rm-sep"></div>
            <button class="rm-item danger" @click="pick('logout')"><Icon name="logout" :size="15" /> 退出账号</button>
          </div>
        </div>
      </div>
    </nav>

    <main class="page-area" @click="closeMenu">
      <component v-if="active" :is="active.component" :key="active.path" />
      <div v-else class="page-empty">
        <Icon name="page" :size="34" />
        <p>还没有任何页面。装载一个插件试试。</p>
      </div>
    </main>

    <footer class="statusbar">
      <div class="sb-left">
        <KSlot name="status-left" />
      </div>
      <div class="sb-right">
        <span class="dot" :class="ws && ws.state.status === 'online' ? 'on' : 'wait'"></span>
        <span>{{ wsText }}</span>
        <span v-if="auth?.state.user" class="sb-user">
          · {{ auth.state.user.name }}
          <em v-if="auth.state.user.vip">VIP</em>
        </span>
      </div>
    </footer>

    <KSlot name="global" />
  </div>
</template>
