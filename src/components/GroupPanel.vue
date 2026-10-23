<script setup lang="ts">
/**
 * 会话/群设置面板（QQ 式右侧固定面板，非弹窗、不遮聊天区）。
 * 群聊：群卡片 + 成员宫格(邀请/查看全部) + 群公告 + 我的本群昵称 + 群聊备注(本地)
 *       + 设为置顶/消息免打扰开关 + 退出群聊。
 * 私聊：对方资料 + 免打扰 + 加好友/删好友。
 * 成员右键菜单（QQ 式，只保留有后端的项）：发消息 / @ TA / 查看资料 / 添加好友 / 禁言TA。
 * （戳一戳/举报云湖无接口，按「无后端即砍」不做。）
 */
import { inject, ref, computed, onMounted, watch } from 'vue'
import { resUrl } from '../core/res'
import { fallbackAvatar } from '../core/util'
import { renderRich } from '../core/render'
import Icon from '../console/components/Icon.vue'

const ctx = inject<any>('ctx')
const g = ctx.group
const chat = ctx.chat
const auth = ctx.auth

const isOpen = computed(() => g.state.panelOpen)
const cur = computed(() => chat.state.current)
const isGroup = computed(() => cur.value?.type === 2)
const info = computed(() => g.state.info)
const members = computed(() => (g.state.members || []).slice(0, 14))

/* 我的本群昵称 / 群聊备注 */
const nick = ref('')
const remark = ref('')
const busy = ref(false)

/* 群消息设置（消息类型限制，/v1/group/msg-type-limit） */
const MSG_TYPES = [
  { v: 1, n: '文本' }, { v: 2, n: '图片' }, { v: 3, n: 'Markdown' },
  { v: 4, n: '文件' }, { v: 7, n: '表情' }, { v: 10, n: '视频' }, { v: 11, n: '语音' },
]
const limit = ref<number[]>([])
watch([isOpen, info], () => {
  const raw = String(info.value?.limitedMsgType || '')
  limit.value = raw ? raw.split(',').map(Number).filter(Boolean) : []
})
function toggleLimit(v: number) {
  const i = limit.value.indexOf(v)
  if (i >= 0) limit.value.splice(i, 1)
  else limit.value.push(v)
}
async function saveLimit() {
  if (busy.value || !cur.value) return
  busy.value = true
  try {
    await ctx.api.setMsgTypeLimit(cur.value.id, limit.value.join(','))
    ctx.ui?.toast?.('群消息设置已保存', 'success')
  } catch (e: any) { ctx.ui?.toast?.('保存失败：' + e.message, 'error') }
  finally { busy.value = false }
}
watch([isOpen, cur], async () => {
  if (!isOpen.value || !cur.value) return
  nick.value = info.value?.myGroupNickname || ''
  remark.value = localStorage.getItem('yh.remark.' + cur.value.id) || ''
  if (isGroup.value && !g.state.members.length) g.loadMembers()
}, { immediate: true })

async function saveNick() {
  if (busy.value || !cur.value) return
  busy.value = true
  try {
    await ctx.api.setMyGroupNickname(cur.value.id, nick.value)
    ctx.ui?.toast?.('昵称已保存', 'success')
  } catch (e: any) { ctx.ui?.toast?.('保存失败：' + e.message, 'error') }
  finally { busy.value = false }
}
function saveRemark() {
  if (!cur.value) return
  // 本地先存（即时生效），再云同步（多端可见；失败不阻塞）
  localStorage.setItem('yh.remark.' + cur.value.id, remark.value)
  if (!isGroup.value) ctx.api?.saveUserRemarks?.(cur.value.id, remark.value).catch(() => {})
  ctx.ui?.toast?.('备注已保存', 'success')
}

/* 置顶 / 免打扰开关（本地，与右键菜单联动） */
const pinned = computed(() => !!cur.value && chat.isPinned(cur.value.id))
const muted = computed(() => !!cur.value && chat.isMuted(cur.value.id))
function togglePin() { if (cur.value) chat.togglePin(cur.value.id) }
async function toggleMute() {
  if (!cur.value) return
  const next = !muted.value
  chat.toggleMute(cur.value.id)
  // 云端同步（失败不阻塞本地）
  try { await ctx.api?.noNotify?.(cur.value.id, cur.value.type || 1, next) } catch { /* 本地已生效 */ }
}

/* 群看板（/v1/bot/board 内容）：默认 3 行，超长给展开提示 */
const boardOpen = ref(false)
const boardHtml = computed(() => {
  const c = g.state.board?.content
  return c ? renderRich(c) : ''
})
const boardLong = computed(() => (g.state.board?.content || '').length > 90)

/* 群主判定（管理区可见性） */
const isOwner = computed(() => {
  const me = ctx.auth?.state?.user?.id
  const info = g.state.info
  return !!me && (info?.owner === me || info?.createBy === me)
})

/* 群消息设置下拉：0 提醒 / 1 不提醒 / 2 屏蔽（映射到免打扰 + 本地隐藏） */
const notifyMode = computed(() => {
  if (!cur.value) return 0
  if (chat.isHidden?.(cur.value.id)) return 2
  return muted.value ? 1 : 0
})
async function setNotifyMode(v: number) {
  const c = cur.value
  if (!c) return
  if (v === 2) { chat.hideConv(c.id); g.close(); return }
  const wantMute = v === 1
  if (muted.value !== wantMute) await toggleMute()
}

/** 分享群：弹群二维码（/v1/share/create 返回二维码图 + 分享链接），供大家扫码进群 */
const qrView = ref<{ url: string; shareUrl: string } | null>(null)
const qrBusy = ref(false)
async function shareGroup() {
  const c = cur.value
  if (!c || qrBusy.value) return
  qrBusy.value = true
  try {
    const d = await ctx.api.shareCreate(c.id, c.type || 2, c.name || '')
    if (!d.imageKey && !d.shareUrl) { ctx.ui?.toast?.('云端未返回二维码', 'warn'); return }
    const u = d.imageKey ? (/^https?:/.test(d.imageKey) ? d.imageKey : resUrl(`https://chat-img.jwznb.com/${d.imageKey.replace(/^\/+/, '')}`)) : ''
    qrView.value = { url: u, shareUrl: d.shareUrl || '' }
  } catch (e: any) { ctx.ui?.toast?.('生成二维码失败：' + e.message, 'error') }
  finally { qrBusy.value = false }
}

/** 删除聊天记录（本地缓存）：清当前会话消息与本地快照；云端记录不受影响（云湖无删记录端点） */
async function clearLocalHistory() {
  const c = cur.value
  if (!c) return
  if (!(await ctx.ui?.confirm?.('删除聊天记录', `清除「${c.name}」在本机的消息缓存？\n（云端记录不受影响）`, { danger: true }))) return
  chat.clearLocal?.(c.id)
  ctx.ui?.toast?.('本地聊天记录已清除', 'success')
}

/** 举报该群（/v1/report/create；确认框为应用内弹窗，不用原生 prompt） */
async function reportGroup() {
  const c = cur.value
  if (!c) return
  const ok = await ctx.ui?.confirm?.('举报该群', `确定举报「${c.name}」？\n理由：骚扰/违规内容`, { okText: '提交举报', danger: true })
  if (!ok) return
  try {
    await ctx.api.report(c.id, 2, c.name, '骚扰/违规内容')
    ctx.ui?.toast?.('举报已提交', 'success')
  } catch (e: any) { ctx.ui?.toast?.('举报失败：' + e.message, 'error') }
}

async function copyGroupId() {
  const c = cur.value
  if (!c) return
  try { await navigator.clipboard.writeText(String(c.id)); ctx.ui?.toast?.('已复制群号 ' + c.id, 'success') }
  catch { ctx.ui?.toast?.('复制失败', 'error') }
}

/* ---- 邀请好友/群聊：多选 + 筛选页签 + 确认框（/v1/group/invite 或发群号卡片文本） ---- */
const invOpen = ref(false)
const invBusy = ref(false)
const invTab = ref<'friends' | 'groups'>('friends')
const invSel = ref<Set<string>>(new Set())
const friends = computed(() => (ctx.social?.state?.book?.users || []).filter((u: any) => u.id !== ctx.auth?.state?.user?.id))
const groups = computed(() => (ctx.social?.state?.book?.groups || []).filter((g: any) => g.id !== cur.value?.id))
const invList = computed(() => (invTab.value === 'friends' ? friends.value : groups.value))
function openInvite() {
  invSel.value = new Set()
  invTab.value = 'friends'
  invOpen.value = true
  ctx.social?.loadBook?.()
}
function toggleInv(id: string) {
  const s = new Set(invSel.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  invSel.value = s
}
async function sendInvite() {
  const c = cur.value
  const ids = [...invSel.value]
  if (!c || !ids.length || invBusy.value) return
  const isGroups = invTab.value === 'groups'
  const label = isGroups ? '群聊' : '好友'
  if (!(await ctx.ui?.confirm?.('发送邀请', `向 ${ids.length} 个${label}发送「${c.name}」的入群邀请（群号 ${c.id}）？`))) return
  invBusy.value = true
  try {
    if (!isGroups) {
      await ctx.api.inviteToGroup(c.id, ids)
    } else {
      // 发到群聊：把群号卡片文本发过去（云湖无跨群邀请端点，用消息承载）
      for (const gid of ids) {
        await ctx.api.send(gid, 2, 1, { text: `【入群邀请】${c.name}（群号 ${c.id}）欢迎加入！` })
      }
    }
    ctx.ui?.toast?.('邀请已发送', 'success')
    invOpen.value = false
  } catch (e: any) { ctx.ui?.toast?.('邀请失败：' + e.message, 'error') }
  finally { invBusy.value = false }
}

/* 成员右键菜单（QQ 式） */
const mm = ref<{ open: boolean; x: number; y: number; m: any }>({ open: false, x: 0, y: 0, m: null })
function openMemberMenu(m: any, e: MouseEvent) {
  mm.value = { open: true, x: Math.min(e.clientX, window.innerWidth - 170), y: Math.min(e.clientY, window.innerHeight - 240), m }
}
function closeMM() { mm.value.open = false }
watch(() => mm.value.open, (v) => {
  const off = () => closeMM()
  if (v) setTimeout(() => document.addEventListener('click', off), 0)
  else document.removeEventListener('click', off)
})
function mmSend() { const m = mm.value.m; closeMM(); if (m) chat.open({ id: m.id, type: 1, name: m.name, avatar: m.avatar }) }
function mmAt() { const m = mm.value.m; closeMM(); if (m) ctx.emit('composer/append', `@${m.name} `) }
function mmProfile() { const m = mm.value.m; closeMM(); if (m) g.openProfile(m) }
/** 宫格成员点击 = 查看资料（与右键菜单同义，QQ 式） */
function mmProfile2(m: any) { g.openProfile(m) }

/* 私聊：是否好友 + 删除好友（/v1/friend/delete-friend，审计补齐 UI） */
const isFriend = computed(() => {
  const id = cur.value?.id
  if (!id) return false
  try { return (ctx.social?.state?.book?.users || []).some((u: any) => u.id === id) } catch { return false }
})
async function delFriend() {
  const c = cur.value
  if (!c) return
  if (!(await ctx.ui?.confirm?.('删除好友', `确定删除好友「${c.name}」？`, { danger: true }))) return
  try {
    await ctx.api.deleteFriend(c.id, c.type === 3 ? 3 : 1)
    ctx.ui?.toast?.('已删除好友', 'success')
    ctx.social?.loadBook?.()
  } catch (e: any) { ctx.ui?.toast?.('删除失败：' + e.message, 'error') }
}
function mmFriend() { const m = mm.value.m; closeMM(); if (m) ctx.social?.apply?.(m.id, 1, '') }
async function mmGag() {
  const m = mm.value.m; closeMM()
  if (!m) return
  await g.gag?.(m, m.isGag ? 0 : 3600)
}

onMounted(() => { if (isOpen.value && isGroup.value) g.loadMembers() })
</script>

<template>
  <!-- QQ 式右侧固定面板：不遮罩、不弹窗，直接贴右展开 -->
  <aside v-if="isOpen" class="gp">
    <header>
      <b>{{ isGroup ? '群聊设置' : '会话设置' }}</b>
      <span class="grow"></span>
      <button class="gp-x" title="收起" @click="g.close()">×</button>
    </header>

    <div class="gp-body">
      <!-- ============ 群聊 ============ -->
      <template v-if="isGroup">
        <!-- 群卡片 -->
        <div class="gp-card">
          <img :src="info?.avatar ? resUrl(info.avatar) : fallbackAvatar(cur?.name)" alt=""
               @error="(e: any) => (e.target.src = fallbackAvatar(cur?.name))" />
          <div class="gp-card-main">
            <b>{{ info?.name || cur?.name }}</b>
            <span class="dim small">{{ info?.headcount || '—' }} 人 · {{ cur?.id }}</span>
          </div>
          <button class="ghost small" title="复制群号与群名（分享）" @click="shareGroup">
            <Icon name="forward" :size="13" /> 分享
          </button>
        </div>

        <!-- 群聊成员宫格 -->
        <div class="gp-sec">
          <span>群聊成员</span>
          <button class="gp-link" @click="g.setDockTab('members')">查看{{ info?.headcount || '' }}名成员 ›</button>
        </div>
        <div class="gp-grid">
          <button v-for="m in members" :key="m.id" class="gp-cell" :title="m.name"
                  @click="mmProfile2(m)" @contextmenu.prevent="openMemberMenu(m, $event)">
            <img :src="m.avatar ? resUrl(m.avatar) : fallbackAvatar(m.name)" alt=""
                 @error="(e: any) => (e.target.src = fallbackAvatar(m.name))" />
            <span>{{ (m.name || '').slice(0, 4) }}</span>
          </button>
          <button class="gp-cell add" title="邀请好友入群" @click="openInvite">
            <Icon name="plus" :size="18" /><span>邀请</span>
          </button>
        </div>

        <!-- 群看板（原「群公告」位改显示看板内容；群简介只在群主编辑区出现，不重复） -->
        <div class="gp-sec"><span>群看板</span>
          <button v-if="boardLong" class="gp-link" @click="boardOpen = !boardOpen">
            {{ boardOpen ? '收起' : '展开' }}
          </button>
        </div>
        <div ref="boardBox" class="gp-notice rich" :class="{ open: boardOpen }"
             v-html="boardHtml || '<span class=\'dim\'>暂无看板</span>'"></div>

        <!-- 我的本群昵称 -->
        <div class="gp-sec"><span>我的本群昵称</span></div>
        <div class="gp-row">
          <input v-model="nick" placeholder="留空则用账号昵称" />
          <button class="ghost small" :disabled="busy" @click="saveNick">保存</button>
        </div>

        <!-- 群聊备注（本地） -->
        <div class="gp-sec"><span>群聊备注</span></div>
        <div class="gp-row">
          <input v-model="remark" placeholder="填写备注（本地）" />
          <button class="ghost small" @click="saveRemark">保存</button>
        </div>

        <!-- 开关 -->
        <label class="gp-switch"><span>设为置顶</span>
          <button class="sw" :class="{ on: pinned }" @click="togglePin"><i></i></button>
        </label>
        <label class="gp-switch"><span>消息免打扰</span>
          <button class="sw" :class="{ on: muted }" @click="toggleMute"><i></i></button>
        </label>

        <!-- 群主：消息类型限制（/v1/group/msg-type-limit） -->
        <template v-if="isOwner">
          <div class="gp-sec"><span>允许发送的消息类型（群主）</span></div>
          <div class="gp-chips">
            <button v-for="t in MSG_TYPES" :key="t.v" class="ghost small"
                    :class="{ on: limit.includes(t.v) }" @click="toggleLimit(t.v)">{{ t.n }}</button>
            <button class="ghost small" :disabled="busy" @click="saveLimit">保存</button>
          </div>
        </template>

        <!-- 群消息设置（QQ 截图同款下拉：接收并提醒/接收但不提醒/屏蔽） -->
        <div class="gp-sec"><span>群消息设置</span></div>
        <select class="gp-select" :value="notifyMode" @change="setNotifyMode(Number(($event.target as any).value))">
          <option :value="0">接收消息并提醒</option>
          <option :value="1">接收消息但不提醒</option>
          <option :value="2">屏蔽群消息</option>
        </select>

        <!-- 删除聊天记录：云端无删记录端点，此处清本地缓存（消息 state + 会话快照），隐私向实质功能 -->
        <button class="gp-clear" @click="clearLocalHistory">删除聊天记录（本地缓存）</button>

        <button class="gp-report" @click="reportGroup">被骚扰了？举报该群</button>
      </template>

      <!-- ============ 私聊 ============ -->
      <template v-else>
        <div class="gp-card">
          <img :src="cur?.avatar ? resUrl(cur.avatar) : fallbackAvatar(cur?.name)" alt=""
               @error="(e: any) => (e.target.src = fallbackAvatar(cur?.name))" />
          <div class="gp-card-main">
            <b>{{ cur?.name }}</b>
            <span class="dim small">{{ cur?.type === 3 ? '机器人' : '用户' }} · {{ cur?.id }}</span>
          </div>
        </div>
        <label class="gp-switch"><span>设为置顶</span>
          <button class="sw" :class="{ on: pinned }" @click="togglePin"><i></i></button>
        </label>
        <label class="gp-switch"><span>消息免打扰</span>
          <button class="sw" :class="{ on: muted }" @click="toggleMute"><i></i></button>
        </label>
        <div class="gp-row mt">
          <button class="ghost small" @click="g.openProfile(cur)">查看资料</button>
          <button class="ghost small" @click="ctx.social?.apply?.(cur.id, 1, '')">添加好友</button>
          <button v-if="isFriend" class="ghost small danger" @click="delFriend">删除好友</button>
        </div>
      </template>
    </div>

    <!-- 成员右键菜单（QQ 式，只含有后端的项） -->
    <Teleport to="body">
      <!-- 邀请好友入群：多选好友 + 确认框（/v1/group/invite） -->
      <div v-if="invOpen" class="qr-mask" @click.self="invOpen = false">
        <div class="qr-box wide">
          <div class="qr-head">
            <b>邀请入群（已选 {{ invSel.size }}）</b>
            <button class="gp-x" title="关闭" @click="invOpen = false">×</button>
          </div>
          <div class="inv-tabs">
            <button class="sp-tab" :class="{ on: invTab === 'friends' }" @click="invTab = 'friends'; invSel = new Set()">好友</button>
            <button class="sp-tab" :class="{ on: invTab === 'groups' }" @click="invTab = 'groups'; invSel = new Set()">群聊（发群号）</button>
          </div>
          <div class="inv-list">
            <label v-for="u in invList" :key="u.id" class="inv-row">
              <input type="checkbox" :checked="invSel.has(u.id)" @change="toggleInv(u.id)" />
              <img :src="u.avatar ? resUrl(u.avatar) : fallbackAvatar(u.name)" alt="" />
              <span>{{ u.name }}</span>
            </label>
            <p v-if="!invList.length" class="dim small">{{ invTab === 'friends' ? '通讯录里没有其他好友' : '没有其他群聊' }}</p>
          </div>
          <div class="gp-row">
            <button class="ghost small" @click="invOpen = false">取消</button>
            <button class="ghost small" :disabled="!invSel.size || invBusy" @click="sendInvite">发送邀请</button>
          </div>
        </div>
      </div>
      <!-- 群二维码弹窗（分享） -->
      <div v-if="qrView" class="qr-mask" @click.self="qrView = null">
        <div class="qr-box">
          <div class="qr-head">
            <b>群二维码 · {{ cur?.name }}</b>
            <button class="gp-x" title="关闭" @click="qrView = null">×</button>
          </div>
          <img v-if="qrView.url" :src="qrView.url" alt="群二维码" class="qr-img" />
          <p v-else class="dim small">云端未返回二维码图片</p>
          <p class="dim small">扫码或复制群号 {{ cur?.id }} 加入本群</p>
          <div class="gp-row">
            <button class="ghost small" @click="copyGroupId">复制群号</button>
            <a v-if="qrView.shareUrl" class="ghost small" :href="qrView.shareUrl" target="_blank" rel="noreferrer">打开分享页</a>
          </div>
        </div>
      </div>
      <div v-if="mm.open" class="mm" :style="{ left: mm.x + 'px', top: mm.y + 'px' }" @click.stop>
        <button class="mm-item" @click="mmSend"><Icon name="send" :size="14" /> 发送消息</button>
        <button class="mm-item" @click="mmAt"><Icon name="quote" :size="14" /> @ TA</button>
        <button class="mm-item" @click="mmProfile"><Icon name="user" :size="14" /> 查看资料</button>
        <button class="mm-item" @click="mmFriend"><Icon name="contacts" :size="14" /> 添加好友</button>
        <button v-if="isGroup" class="mm-item" @click="mmGag"><Icon name="bellOff" :size="14" /> {{ mm.m?.isGag ? '解除禁言' : '禁言 1 小时' }}</button>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
/* 右侧固定面板：贴右、全高、不遮罩（QQ 式）。宽度用固定 px，避免 vw 在异常视口退化 */
.gp {
  position: fixed; right: 0; top: 0; bottom: 28px; width: 340px;
  z-index: 66; background: var(--card); border-left: 1px solid var(--line);
  display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0, 0, 0, .25);
}
@media (max-width: 900px) { .gp { width: 86vw; } }
.gp > header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.gp > header .grow { flex: 1; }
.gp-x { background: transparent; color: var(--fg2); font-size: 20px; padding: 0 8px; line-height: 1; }
.gp-body { flex: 1; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.gp-card { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
.gp-card img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background: var(--card2); }
.gp-card-main { min-width: 0; }
.gp-card-main b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gp-sec { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--fg2); margin: 10px 0 6px; }
.gp-link { background: none; border: none; color: var(--acc); font-size: 12px; cursor: pointer; padding: 0; }
.gp-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.gp-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px;
  border: none; border-radius: 8px; background: none; color: var(--fg2); font-size: 10.5px; cursor: pointer;
}
.gp-cell:hover { background: var(--card2); color: var(--fg); }
.gp-cell img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: var(--card2); }
.gp-cell.add { border: 1px dashed var(--line); }
.gp-notice {
  font-size: 12.5px; color: var(--fg2); background: var(--card2); border-radius: 8px;
  padding: 8px 10px; cursor: pointer; white-space: pre-wrap; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.gp-notice.open { display: block; -webkit-line-clamp: unset; overflow: visible; }
.gp-more { font-style: normal; color: var(--acc); }
.gp-row { display: flex; gap: 8px; align-items: center; }
.gp-row input {
  flex: 1; min-width: 0; background: var(--card2); border: 1px solid var(--line);
  border-radius: 8px; color: var(--fg); padding: 7px 10px; font-size: 13px; outline: none;
}
.gp-row input:focus { border-color: var(--acc); }
.gp-switch {
  display: flex; justify-content: space-between; align-items: center; padding: 9px 2px;
  font-size: 13px; color: var(--fg); cursor: pointer; border-bottom: 1px solid var(--line);
}
.sw {
  width: 38px; height: 21px; border-radius: 999px; border: none; background: var(--line);
  position: relative; cursor: pointer; transition: background .15s;
}
.sw i {
  position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%;
  background: #fff; transition: left .15s;
}
.sw.on { background: var(--acc); }
.sw.on i { left: 19px; }
.gp-danger {
  margin-top: 14px; padding: 9px 0; border-radius: 9px; border: none;
  background: color-mix(in srgb, var(--err) 14%, transparent); color: var(--err); font-size: 13.5px; cursor: pointer;
}
.gp-danger:hover { background: color-mix(in srgb, var(--err) 24%, transparent); }
.gp-select {
  width: 100%; background: var(--card2); border: 1px solid var(--line); border-radius: 10px;
  color: var(--fg); padding: 9px 10px; font-size: 13px; outline: none;
}
.gp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.gp-report {
  margin-top: 10px; padding: 8px 0; border: none; border-radius: 9px; background: none;
  color: var(--acc); font-size: 12.5px; cursor: pointer; text-align: center;
}
.gp-report:hover { background: var(--acc-soft, var(--card2)); }
.gp-clear {
  margin-top: 8px; padding: 9px 0; border-radius: 9px; border: none;
  background: color-mix(in srgb, var(--err) 12%, transparent); color: var(--err);
  font-size: 13px; cursor: pointer;
}
.gp-clear:hover { background: color-mix(in srgb, var(--err) 22%, transparent); }
/* 群二维码弹窗 */
.qr-mask { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, .5); display: grid; place-items: center; backdrop-filter: blur(3px); }
.qr-box {
  width: min(320px, 90vw); background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; align-items: center;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .5);
}
.qr-head { width: 100%; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
.qr-img { width: 200px; height: 200px; object-fit: contain; background: #fff; border-radius: 10px; padding: 8px; }
.qr-box.wide { width: min(380px, 92vw); align-items: stretch; }
.inv-list { max-height: 46vh; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
.inv-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px;
  font-size: 13px; cursor: pointer; color: var(--fg);
}
.inv-row:hover { background: var(--card2); }
.inv-row img { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: var(--card2); }
.inv-row input { width: auto; accent-color: var(--acc); }
.inv-tabs { display: flex; gap: 6px; margin-bottom: 6px; }
.inv-tabs .sp-tab {
  padding: 5px 12px 6px; border: none; background: none; color: var(--fg2);
  font-size: 12.5px; cursor: pointer; border-bottom: 2px solid transparent;
}
.inv-tabs .sp-tab.on { color: var(--acc); border-bottom-color: var(--acc); font-weight: 600; }
.mt { margin-top: 10px; }
.gp-msglimit { display: flex; flex-direction: column; gap: 8px; }
.gp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
/* 成员右键菜单 */
.mm {
  position: fixed; z-index: 90; min-width: 150px; background: var(--card);
  border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 5px;
}
.mm-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 7px 10px; border: none; border-radius: 7px; background: none;
  color: var(--fg); font-size: 13px; cursor: pointer;
}
.mm-item:hover { background: var(--card2); }
</style>
