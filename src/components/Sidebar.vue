<script setup lang="ts">
/**
 * 左侧会话列表（含本地分组）。
 *
 * 关键点：
 *   · 数据源是 chat.filtered() —— 注意它是**函数**，要调用；漏了括号会一条会话都不显示
 *   · 分组完全存本地 localStorage（云湖没有分组接口）
 *   · 「未读」样式走 .has-unread（名字加重 + 小圆点），不再用整块红底，减少颜色噪音
 *   · 点头像 = 看自己的资料（走 group.openProfile）
 *   · 右键会话 = 分组菜单（替代旧的 window.prompt 交互）
 */
import { inject, computed, ref, reactive, watch, onUnmounted } from 'vue'
import { fmtTime, fallbackAvatar } from '../core/util.js'
import { resUrl } from '../core/res.js'
import Icon from '../console/components/Icon.vue'

const ctx = inject<any>('ctx')
const auth = ctx.auth
const chat = ctx.chat

const list = computed(() => chat.filtered())
function open(c: any) { chat.open(c) }

/* ---------------- 会话分组（本地，存 localStorage） ---------------- */
// 注意：filtered 是函数，必须调用 —— 之前少个括号导致侧栏一条会话都不显示
const sections = computed(() => chat.sections(chat.filtered()))

/* ---- 右键会话 → 分组菜单（夹回视口，避免菜单出屏） ---- */
const menu = reactive({ open: false, x: 0, y: 0, conv: null as any })
const menuGroupInput = ref('')
function openMenu(c: any, e: MouseEvent) {
  menu.conv = c
  menu.x = Math.min(e.clientX, window.innerWidth - 180)
  menu.y = Math.min(e.clientY, window.innerHeight - 320)
  menu.open = true
}
function closeMenu() { menu.open = false; menuGroupInput.value = '' }
// 点菜单外任意处关闭
const offDoc = () => closeMenu()
watch(() => menu.open, (v) => {
  if (v) setTimeout(() => document.addEventListener('click', offDoc), 0)
  else document.removeEventListener('click', offDoc)
})
onUnmounted(() => document.removeEventListener('click', offDoc))
function assignTo(groupId: string) {
  if (menu.conv) chat.assignTo(menu.conv.id, groupId)
  closeMenu()
}
function createAndAssign() {
  const n = menuGroupInput.value.trim()
  if (!n) return
  chat.addGroup(n)
  const g = chat.groups.groups.find((x: any) => x.name === n)
  if (g && menu.conv) chat.assignTo(menu.conv.id, g.id)
  closeMenu()
}
/** 置顶/取消置顶（本地排序） */
function togglePin() {
  if (menu.conv) chat.togglePin(menu.conv.id)
  closeMenu()
}
/** 删除会话（本地隐藏，不删云端记录；二次确认防误触） */
async function delConv() {
  const c = menu.conv
  closeMenu()
  if (!c) return
  if (!(await ctx.ui.confirm('删除会话', `从列表删除「${c.name}」？\n（仅本地隐藏，聊天记录仍在云端）`, { danger: true }))) return
  chat.hideConv(c.id)
}

/** 点自己的头像 → 打开自己的详细资料 */
function openMe() {
  const u = auth.state.user
  if (u) ctx.group?.openProfile?.({ id: u.id, name: u.name, avatar: u.avatar })
}

/* ---------------- QQ 式「＋」菜单：创建群聊 / 加好友（复用 social 后端） ---------------- */
const plusOpen = ref(false)
// 点菜单外任意处关闭（与右键分组菜单同一套路）
const offPlus = () => { plusOpen.value = false }
watch(() => plusOpen.value, (v) => {
  if (v) setTimeout(() => document.addEventListener('click', offPlus), 0)
  else document.removeEventListener('click', offPlus)
})
onUnmounted(() => document.removeEventListener('click', offPlus))
const dlg = reactive({ kind: '' as '' | 'group' | 'friend', name: '', intro: '', fid: '', msg: '', busy: false })
function plusPick(k: 'group' | 'friend') {
  plusOpen.value = false
  dlg.kind = k
}
function closeDlg() { dlg.kind = ''; dlg.name = ''; dlg.intro = ''; dlg.fid = ''; dlg.msg = '' }
async function dlgOk() {
  if (dlg.busy) return
  dlg.busy = true
  try {
    if (dlg.kind === 'group') {
      const n = dlg.name.trim()
      if (!n) { ctx.ui?.toast?.('群名称不能为空', 'warn'); return }
      const ok = await ctx.social?.createGroup?.(n, dlg.intro.trim())
      if (!ok) return                       // 失败提示已由 social 给出，不再误报成功
      ctx.chat?.loadConversations?.(true)
    } else {
      const id = dlg.fid.trim()
      if (!id) { ctx.ui?.toast?.('请填写对方 ID', 'warn'); return }
      await ctx.social?.apply?.(id, 1, dlg.msg.trim())
      ctx.ui?.toast?.('好友申请已发送', 'success')
    }
    closeDlg()
  } catch (e: any) {
    ctx.ui?.toast?.('操作失败：' + e.message, 'error')
  } finally { dlg.busy = false }
}
</script>

<template>
  <div class="sidebar">
    <div class="me">
      <img class="me-av" :src="auth.state.user?.avatar ? resUrl(auth.state.user.avatar) : fallbackAvatar(auth.state.user?.name)" alt=""
           title="查看我的资料" @click="openMe"
           @error="(e: any) => (e.target.src = fallbackAvatar(auth.state.user?.name))" />
      <div class="info">
        <div class="name">{{ auth.state.user?.name }}</div>
        <div class="sub">ID {{ auth.state.user?.id }}</div>
      </div>
      <!-- QQ 式「＋」：创建群聊 / 加好友（闪传文件无后端，不做） -->
      <div class="plus-wrap">
        <button class="plus-btn" title="创建群聊 / 加好友" @click.stop="plusOpen = !plusOpen">
          <Icon name="plus" :size="16" />
        </button>
        <div v-if="plusOpen" class="plus-menu" @click.stop>
          <button class="pm-item" @click="plusPick('group')"><Icon name="contacts" :size="15" /> 创建群聊</button>
          <button class="pm-item" @click="plusPick('friend')"><Icon name="user" :size="15" /> 加好友</button>
        </div>
      </div>
    </div>

    <!-- 创建群聊 / 加好友 对话框 -->
    <div v-if="dlg.kind" class="dlg-mask" @click.self="closeDlg">
      <div class="dlg-box">
        <div class="dlg-title">{{ dlg.kind === 'group' ? '创建群聊' : '加好友' }}</div>
        <template v-if="dlg.kind === 'group'">
          <input v-model="dlg.name" class="dlg-input" placeholder="群名称" maxlength="30" />
          <textarea v-model="dlg.intro" class="dlg-input" placeholder="群简介（可选）" rows="3"></textarea>
        </template>
        <template v-else>
          <input v-model="dlg.fid" class="dlg-input" placeholder="对方 ID" />
          <textarea v-model="dlg.msg" class="dlg-input" placeholder="验证消息（可选）" rows="2"></textarea>
        </template>
        <div class="dlg-foot">
          <button class="ghost tiny" @click="closeDlg">取消</button>
          <button class="primary tiny" :disabled="dlg.busy" @click="dlgOk">{{ dlg.busy ? '提交中…' : '确定' }}</button>
        </div>
      </div>
    </div>

    <!-- 插槽：chat-sidebar-top -->
    <component v-for="(sl, i) in ctx.chat?.slotsOf?.('chat-sidebar-top') || []" :key="'st' + i"
               :is="sl.component" v-bind="sl.props || {}" />

    <div class="search">
      <input v-model="chat.state.keyword" placeholder="搜索会话…" />
    </div>

    <!-- 会话分组（本地）：有分组时按分组渲染，可折叠 -->
    <div v-if="sections.groups.length" class="grp-bar">
      <button v-for="g in sections.groups" :key="g.id" class="grp-chip"
              :class="{ on: !chat.isCollapsed(g.id) }" @click="chat.toggleCollapse(g.id)">
        {{ g.name }} <em>{{ g.items.length }}</em>
      </button>
    </div>

    <ul class="convs">
      <template v-for="g in sections.groups" :key="g.id">
        <li class="grp-head" @click="chat.toggleCollapse(g.id)">
          <span class="tri">{{ chat.isCollapsed(g.id) ? '▸' : '▾' }}</span>{{ g.name }}
          <em>{{ g.items.length }}</em>
          <span class="grow"></span>
          <button class="ghost tiny" title="删除分组" @click.stop="chat.removeGroup(g.id)">×</button>
        </li>
        <template v-if="!chat.isCollapsed(g.id)">
          <li v-for="c in g.items" :key="c.id" :class="{ active: chat.state.current?.id === c.id, 'has-unread': !!c.unread }"
              @click="open(c)" @contextmenu.prevent="openMenu(c, $event)">
            <img :src="c.avatar ? resUrl(c.avatar) : fallbackAvatar(c.name)" alt=""
                 @error="(e: any) => (e.target.src = fallbackAvatar(c.name))" />
            <div class="mid">
              <div class="top"><span class="cname">{{ c.at ? '[有人@我] ' : '' }}{{ c.name }}</span><span class="time">{{ fmtTime(c.ts) }}</span></div>
              <div class="prev">{{ c.preview }}</div>
            </div>
            <span v-if="c.unread" class="badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
          </li>
        </template>
      </template>

      <li v-for="c in sections.ungrouped" :key="c.id" :class="{ active: chat.state.current?.id === c.id, 'has-unread': !!c.unread }"
          @click="open(c)" @contextmenu.prevent="openMenu(c, $event)">
        <img :src="c.avatar ? resUrl(c.avatar) : fallbackAvatar(c.name)" alt=""
             @error="(e: any) => (e.target.src = fallbackAvatar(c.name))" />
        <div class="mid">
          <div class="top">
            <span class="cname">{{ c.at ? '[有人@我] ' : '' }}{{ c.name }}</span>
            <span class="time">{{ fmtTime(c.ts) }}</span>
          </div>
          <div class="prev">{{ c.preview }}</div>
        </div>
        <span v-if="c.unread" class="badge">{{ c.unread > 99 ? '99+' : c.unread }}</span>
      </li>
      <li v-if="!list.length" class="hint">
        {{ chat.state.loadingConvs ? '加载中…' : '暂无会话' }}
      </li>
    </ul>

    <!-- 插槽：chat-sidebar-bottom -->
    <component v-for="(sl, i) in ctx.chat?.slotsOf?.('chat-sidebar-bottom') || []" :key="'sb' + i"
               :is="sl.component" v-bind="sl.props || {}" />

    <!-- 右键分组菜单 -->
    <Teleport to="body">
      <div v-if="menu.open" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
        <button class="rm-item" @click="togglePin">
          <Icon name="pinUp" :size="14" /> {{ chat.isPinned(menu.conv?.id) ? '取消置顶' : '置顶' }}
        </button>
        <div class="rm-sep"></div>
        <div class="rm-item dim small" style="cursor:default">移动到分组</div>
        <button v-if="chat.groupOf(menu.conv?.id)" class="rm-item" @click="assignTo('')"><Icon name="undo" :size="14" /> 移出分组</button>
        <button v-for="g in chat.groups.groups" :key="g.id" class="rm-item"
                :class="{ on: chat.groupOf(menu.conv?.id) === g.id }" @click="assignTo(g.id)">
          <Icon name="folder" :size="14" /> {{ g.name }}
        </button>
        <div class="rm-sep"></div>
        <div style="display:flex;gap:6px;padding:4px 6px">
          <input v-model="menuGroupInput" class="qr-add-input" placeholder="新分组名" @keyup.enter="createAndAssign" />
          <button class="ghost small" @click="createAndAssign">建</button>
        </div>
        <div class="rm-sep"></div>
        <button class="rm-item danger" @click="delConv"><Icon name="trash" :size="14" /> 删除会话</button>
      </div>
    </Teleport>
  </div>
</template>
