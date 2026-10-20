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
  localStorage.setItem('yh.remark.' + cur.value.id, remark.value)
  ctx.ui?.toast?.('备注已保存（本地）', 'success')
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
          <button class="gp-cell add" title="邀请成员" @click="g.setDockTab('members')">
            <Icon name="plus" :size="18" /><span>邀请</span>
          </button>
        </div>

        <!-- 群公告 -->
        <div class="gp-sec"><span>群公告</span></div>
        <div class="gp-notice" @click="g.setDockTab('info')">{{ info?.introduction || '暂无公告' }} ›</div>

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
        <!-- 退出群聊：云湖公开接口无 quit/leave-group 端点（Murexide 亦无）→ 按「无后端即砍」不做 -->
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
        </div>
      </template>
    </div>

    <!-- 成员右键菜单（QQ 式，只含有后端的项） -->
    <Teleport to="body">
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
  padding: 8px 10px; cursor: pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
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
.mt { margin-top: 10px; }
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
