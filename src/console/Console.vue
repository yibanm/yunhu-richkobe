<script setup lang="ts">
/**
 * 控制台外壳（QQ 式布局）
 *   顶部标题栏：品牌 + 头像/昵称/签名（对标 QQ 顶栏）
 *   左竖条：头像 + 功能图标（按插件注册页动态生成）+ 底部调色盘/主题/菜单
 *   菜单（左下角 ≡）：收藏/文件/聊天记录管理/检查更新/帮助/设置/退出账号（对标 QQ ≡ 菜单）
 */
import { computed, ref, watch } from 'vue'
import { useCtx } from '../core/useCtx'
import Icon from './components/Icon.vue'
import KSlot from './components/KSlot.vue'
import PalettePop from '../components/PalettePop.vue'

const ctx = useCtx()
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

/**
 * QQ 式层级分组（按 order 段）：
 *   消息区 <200（聊天/快捷回复/插件市场/通讯录/表情/机器人/板块）
 *   工具区 200-799（事件）
 *   系统区 ≥800（日志/主题/设置/配置/账号）
 */
const groups = computed(() => {
  const list = pages.value
  const buckets = [
    list.filter((p: any) => (p.order ?? 0) < 200),
    list.filter((p: any) => (p.order ?? 0) >= 200 && (p.order ?? 0) < 800),
    list.filter((p: any) => (p.order ?? 0) >= 800),
  ]
  return buckets.filter((g) => g.length)
})

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

const goto = (path: string) => { current.value = path }

/* ---- ≡ 菜单（对标 QQ 左下角菜单） ---- */
const menuOpen = ref(false)
function menu(act: string) {
  menuOpen.value = false
  switch (act) {
    case 'fav': goto('/stickers'); break
    case 'disk': ctx.group?.setDockTab?.('disk') ?? ctx.ui?.toast('先打开一个群会话再用「文件」', 'warn'); break
    case 'logs': goto('/logs'); break
    case 'update': ctx.ui?.toast('已是最新（学习交流版）', 'info'); break
    case 'help': (window as any).open?.('https://github.com/yibanm/yunhu-richkobe', '_blank'); break
    case 'settings': goto('/settings'); break
    case 'logout': ctx.auth?.logout?.(); break
  }
}

const wsText = computed(() => ({
  online: '实时在线', connecting: '连接中', retry: '重连中', closed: '已断开', idle: '未连接',
}[ws?.state.status] || '—'))
</script>

<template>
  <div class="console">
    <!-- ===== 顶栏（QQ 同款：品牌 + 头像/昵称/签名） ===== -->
    <header class="titlebar">
      <div class="tb-brand">
        <img src="../../assets/logo.png" alt="" class="tb-logo" />
        <span class="tb-name">云湖牢大版</span>
      </div>
      <div class="tb-user" v-if="auth?.state.user" @click="goto('/account')">
        <img :src="auth.state.user.avatar || ''" alt="" class="tb-avatar" />
        <span class="tb-nick">{{ auth.state.user.name }}</span>
        <span class="tb-sign">编辑个性签名</span>
      </div>
      <div class="tb-spacer"></div>
      <KSlot name="titlebar-right" />
    </header>

    <nav class="rail">
      <div class="rail-items">
        <template v-for="(g, gi) in groups" :key="gi">
          <div v-if="gi > 0" class="rail-sep"></div>
          <button v-for="p in g" :key="p.path"
                  class="rail-btn" :class="{ on: active === p }"
                  :title="p.name" @click="current = p.path">
            <Icon :name="p.icon" />
          </button>
        </template>
      </div>
      <div class="rail-foot">
        <PalettePop />
        <button class="rail-btn" :title="ui.state.theme === 'dark' ? '切换到浅色' : '切换到深色'"
                @click="ui.toggleTheme()">
          <Icon :name="ui.state.theme === 'dark' ? 'sun' : 'moon'" />
        </button>
        <!-- ≡ 菜单 -->
        <div class="menu-wrap">
          <button class="rail-btn" title="菜单" @click.stop="menuOpen = !menuOpen">
            <Icon name="menu" />
          </button>
          <div v-if="menuOpen" class="rail-menu" @click.stop>
            <button class="rm-item" @click="menu('fav')"><Icon name="smile" :size="14" /> 收藏</button>
            <button class="rm-item" @click="menu('disk')"><Icon name="folder" :size="14" /> 文件</button>
            <button class="rm-item" @click="menu('logs')"><Icon name="terminal" :size="14" /> 聊天记录管理</button>
            <button class="rm-item" @click="menu('update')"><Icon name="bolt" :size="14" /> 检查更新</button>
            <button class="rm-item" @click="menu('help')"><Icon name="page" :size="14" /> 帮助</button>
            <button class="rm-item" @click="menu('settings')"><Icon name="settings" :size="14" /> 设置</button>
            <div class="rm-sep"></div>
            <button class="rm-item danger" @click="menu('logout')"><Icon name="x" :size="14" /> 退出账号</button>
          </div>
        </div>
      </div>
    </nav>

    <main class="page-area">
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
