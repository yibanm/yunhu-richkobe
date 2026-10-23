<script setup lang="ts">
/**
 * 表情面板（输入区「表情」按钮唤起，走 chat 的 global 插槽）。
 *
 * 数据：/v1/expression/list（个人收藏）。
 * 发送：把选中项包成 h.sticker(...) 走 chat.sendMedia（content_type=7）。
 * 过滤：url 为空或 CDN 上已不存在的 .tmp 条目直接不显示（否则一片裂图）。
 * 收藏/置顶/删除：expression/create、expression/topping、expression/delete。
 */
import { inject, computed, ref, watch, onUnmounted } from 'vue'
import { resUrl } from '../core/res'
import Icon from '../console/components/Icon.vue'

const ctx = inject<any>('ctx')
const st = ctx.stickers
const s = st.state

/** 页签：收藏 / 各表情包组（之前面板只渲染收藏，表情包组识别不到 —— 补上） */
const tab = ref<'fav' | number>('fav')
function pickTab(t: 'fav' | number) {
  tab.value = t
  if (t !== 'fav' && !s.packs.length) st.loadPacks?.()
}
// 打开面板时顺带拉一次表情包组
watch(() => s.panelOpen, (v) => { if (v && !s.packs.length) st.loadPacks?.() })

const list = computed(() => {
  // 过滤掉 url 为空的、以及 CDN 上已不存在的 .tmp 条目
  let arr = (s.list || []).filter((e: any) => {
    const u = String(e.urlOriginal || e.url || '')
    return u && !u.endsWith('.tmp')
  })
  const k = s.keyword.trim()
  if (k) arr = arr.filter((e: any) => String(e.id).includes(k))
  return arr
})

/** 当前页签的表情包组内容 */
const packItems = computed(() => {
  if (tab.value === 'fav') return []
  const p = (s.packs || []).find((x: any) => x.id === tab.value)
  return (p?.items || []).filter((e: any) => e.urlOriginal || e.url)
})
const curPack = computed(() => (s.packs || []).find((x: any) => x.id === tab.value) || null)

/** 收藏里的 url 是相对 key（expression/xxx.jpg），要补域名 */
function src(e: any) {
  const u = e.urlOriginal || e.url || ''
  return resUrl(u)
}

/** 上传到「当前选中的页签」：收藏 or 某个表情包组 */
async function onPickUpload(e: any) {
  const fs: File[] = Array.from(e.target?.files || [])
  e.target.value = ''
  for (const f of fs) await st.addFileToTarget(f, tab.value)
}

/** 面板打开时支持直接 Ctrl+V 粘贴图片进当前页签（document 级，不依赖焦点） */
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  let took = false
  for (const it of Array.from(items)) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (!f || !f.type.startsWith('image/')) continue
    took = true
    st.addFileToTarget(f, tab.value)
  }
  if (took) e.preventDefault()
}
watch(() => s.panelOpen, (v) => {
  if (v) document.addEventListener('paste', onPaste)
  else document.removeEventListener('paste', onPaste)
})
onUnmounted(() => document.removeEventListener('paste', onPaste))

/** 外来表情包里的表情：右键弹出「收藏」按钮，点按钮才收藏（QQ 式两段交互） */
const favAsk = ref<any>(null)
function askFav(e: any, ev: MouseEvent) {
  favAsk.value = e
  // 点面板其它地方收起
  setTimeout(() => {
    const off = () => { favAsk.value = null; document.removeEventListener('click', off) }
    document.addEventListener('click', off)
  }, 0)
  ev.stopPropagation()
}
async function doFav(e: any) {
  favAsk.value = null
  await favFromPack(e)
}
async function favFromPack(e: any) {
  const u = e.urlOriginal || e.url || ''
  if (!u) { ctx.ui?.toast?.('这张表情没有可用地址', 'warn'); return }
  const full = /^https?:\/\//i.test(u) ? u : `https://chat-img.jwznb.com/${String(u).replace(/^\/+/, '')}`
  await st.addFromUrl?.(full)
}

/* ---- 收藏他人表情包（/v1/sticker/add）与单贴纸管理（rename/remove） ---- */
const addPackOpen = ref(false)
const addPackId = ref('')
async function addPack() {
  const id = Number(addPackId.value.trim())
  if (!id) return
  try {
    await ctx.api.stickerAddPack(id)
    ctx.ui?.toast?.('表情包已收藏', 'success')
    addPackId.value = ''
    addPackOpen.value = false
    await st.loadPacks()
  } catch (e: any) { ctx.ui?.toast?.('收藏失败：' + e.message, 'error') }
}
async function renameSticker(e: any) {
  renaming.value = { id: e.id, name: e.name || '' }
}
const renaming = ref<{ id: number; name: string } | null>(null)
async function renameStickerOk() {
  const rn = renaming.value
  renaming.value = null
  if (!rn || !rn.name.trim()) return
  try {
    await ctx.api.stickerRenameSticker(rn.id, rn.name.trim())
    ctx.ui?.toast?.('已重命名', 'success')
    await st.loadPacks()
  } catch (err: any) { ctx.ui?.toast?.('重命名失败：' + err.message, 'error') }
}
async function removeSticker(e: any) {
  if (!(await ctx.ui?.confirm?.('删除贴纸', `从表情包中删除这张贴纸？`, { danger: true }))) return
  try {
    await ctx.api.stickerRemoveSticker(tab.value as number, e.id)
    ctx.ui?.toast?.('已删除', 'success')
    await st.loadPacks()
  } catch (err: any) { ctx.ui?.toast?.('删除失败：' + err.message, 'error') }
}
/* ---- 快捷回复条（从输入区迁移至此；quickreply.enabled 默认 false，用户在设置或此处开启） ---- */
const qr = ctx.quickreply
const qrEnabled = computed(() => !!qr?.state?.enabled)
const QR_ORDER_KEY = 'yh.qr.order'
function loadOrder(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
const qrOrder = ref<string[]>(loadOrder(QR_ORDER_KEY))
const qrItems = computed(() => {
  const items = (ctx.chat?.composerOf?.('composer') || []).filter((it: any) => it.kind === 'quick')
  const ord = qrOrder.value
  return [...items].sort((a: any, b: any) => {
    const ia = ord.indexOf(a.id), ib = ord.indexOf(b.id)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
})
const qrAdding = ref(false)
const qrNew = ref('')
const qrDrag = ref('')
function qrAdd() {
  const t = qrNew.value.trim()
  if (t) qr?.add?.(t)
  qrNew.value = ''
  qrAdding.value = false
}
function qrDrop(targetId: string) {
  const from = qrDrag.value
  qrDrag.value = ''
  if (!from || from === targetId) return
  const ids = qrItems.value.map((x: any) => x.id).filter((x: string) => x !== from)
  ids.splice(ids.indexOf(targetId) + 1, 0, from)
  qrOrder.value = ids
  localStorage.setItem(QR_ORDER_KEY, JSON.stringify(ids))
}
</script>

<template>
  <div v-if="s.panelOpen" class="sp-mask" @click.self="st.close()">
    <div class="sp">
      <header>
        <b>表情</b>
        <span class="dim small">{{ tab === 'fav' ? s.list.length + ' 个收藏' : (curPack?.name || '') + ' · ' + packItems.length + ' 张' }}</span>
        <span class="grow"></span>
        <input v-model="s.keyword" placeholder="搜索…" style="max-width: 130px" />
        <label class="ghost small file">
          <input type="file" accept="image/*" multiple hidden @change="onPickUpload" />上传到当前栏
        </label>
        <button class="ghost small" @click="st.load()">刷新</button>
        <button class="ghost small" :class="{ on: qrEnabled }" title="在面板底部显示快捷回复条"
                @click="qr?.toggle?.()">快捷回复</button>
        <button class="sp-x" @click="st.close()">×</button>
      </header>

      <!-- 页签：收藏 + 各表情包组（QQ 式表情面板分组） -->
      <div class="sp-tabs">
        <button class="sp-tab" :class="{ on: tab === 'fav' }" @click="pickTab('fav')">收藏</button>
        <button v-for="p in s.packs" :key="p.id" class="sp-tab" :class="{ on: tab === p.id }" @click="pickTab(p.id)">
          {{ p.name }} <em>{{ p.items?.length || 0 }}</em>
        </button>
        <span class="grow"></span>
        <button class="ghost tiny" title="输入表情包 ID 收藏到账号" @click="addPackOpen = !addPackOpen">+ 收藏表情包</button>
        <span v-if="s.packsLoading" class="dim small">加载表情包…</span>
      </div>
      <div v-if="addPackOpen" class="sp-addrow">
        <input v-model="addPackId" placeholder="表情包 ID" inputmode="numeric" />
        <button class="ghost tiny" :disabled="!addPackId.trim()" @click="addPack">收藏</button>
      </div>

      <div class="sp-body">
        <div class="grid">
          <template v-if="tab === 'fav'">
            <button v-for="e in list" :key="e.id" class="cell" :title="'点击发送'" @click="st.send(e)">
              <img :src="src(e)" loading="lazy" alt=""
                   @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
              <span class="top" @click.stop="st.topping(e)" title="置顶">↑</span>
              <span class="del" @click.stop="st.remove(e)" title="从收藏删除">×</span>
            </button>
          </template>
          <template v-else>
            <button v-for="e in packItems" :key="e.id" class="cell" :title="'点击发送 · 右键弹出收藏按钮'"
                    @click="st.send(e)" @contextmenu.prevent="askFav(e, $event)">
              <img :src="src(e)" loading="lazy" alt=""
                   @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
              <!-- 右键后弹出的「收藏」小按钮（QQ 式：右键不直接收藏，先出按钮再点） -->
              <span v-if="favAsk?.id === e.id" class="fav-ask" @click.stop="doFav(e)">
                <Icon name="star" :size="13" /> 收藏
              </span>
              <span class="cell-acts">
                <span class="ca" title="重命名" @click.stop="renameSticker(e)">✎</span>
                <span class="ca del" title="从包中删除" @click.stop="removeSticker(e)">×</span>
              </span>
            </button>
          </template>
        </div>
        <p v-if="tab === 'fav' && !list.length" class="dim center">
          {{ s.loading ? '加载中…' : '还没有收藏。点「上传到当前栏」或直接 Ctrl+V 粘贴图片，也可在消息图片上右键「添加到收藏」。' }}
        </p>
        <p v-if="tab !== 'fav' && !packItems.length" class="dim center">
          {{ s.packsLoading ? '加载中…' : '这个表情包是空的 —— 点「上传到当前栏」或 Ctrl+V 粘贴图片加入' }}
        </p>
      </div>

      <!-- 快捷回复收藏条（从输入区移到这里；默认关，用户在此自行添加/排序） -->
      <div v-if="qrEnabled" class="sp-qr">
        <span class="dim small">快捷回复</span>
        <button v-for="it in qrItems" :key="it.id" class="qr-chip" draggable="true"
                @click="qr?.fire?.(it.value)"
                @dragstart="qrDrag = it.id" @dragover.prevent @drop.prevent="qrDrop(it.id)">
          {{ it.label }}
          <span class="x" title="移除" @click.stop="qr?.remove?.(it.value)">×</span>
        </button>
        <template v-if="qrAdding">
          <input v-model="qrNew" class="qr-add-input" placeholder="新快捷回复" @keyup.enter="qrAdd" @keyup.esc="qrAdding = false" />
          <button class="ghost tiny" @click="qrAdd">保存</button>
        </template>
        <button v-else class="qr-chip qr-add" title="添加快捷回复" @click="qrAdding = true">+ 添加</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .35); z-index: 76; display: flex; align-items: flex-end; justify-content: center; }
.sp { width: 720px; max-width: 96vw; max-height: 62vh; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 14px 14px 0 0; box-shadow: var(--shadow); overflow: hidden; }
.sp > header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.sp > header .grow { flex: 1; }
.sp-x { background: transparent; color: var(--fg2); font-size: 20px; padding: 0 8px; line-height: 1; }
.sp-body { overflow: auto; padding: 12px; }
.sp-tabs { display: flex; gap: 6px; padding: 8px 12px 0; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.sp-tab {
  padding: 5px 12px 7px; border: none; background: none; color: var(--fg2); font-size: 12.5px;
  cursor: pointer; border-bottom: 2px solid transparent;
}
.sp-tab:hover { color: var(--fg); }
.sp-tab.on { color: var(--acc); border-bottom-color: var(--acc); font-weight: 600; }
.sp-tab em { font-style: normal; font-size: 10.5px; color: var(--fg2); margin-left: 3px; }
.sp-tabs .grow { flex: 1; }
.sp-addrow { display: flex; gap: 6px; padding: 6px 12px; }
.sp-addrow input {
  flex: 1; background: var(--card2); border: 1px solid var(--line); border-radius: 8px;
  color: var(--fg); padding: 5px 9px; font-size: 12.5px; outline: none;
}
.cell { position: relative; }
.cell-acts {
  position: absolute; top: 2px; left: 2px; display: none; gap: 3px;
}
.cell:hover .cell-acts { display: flex; }
.cell-acts .ca {
  width: 18px; height: 18px; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff;
  font-size: 11px; line-height: 1; display: grid; place-items: center; cursor: pointer;
}
.cell-acts .ca.del:hover { background: var(--err); }
/* 面板底部快捷回复条 */
.sp-qr {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 8px 12px; border-top: 1px solid var(--line); background: var(--card2);
}
/* 右键弹出的收藏按钮 */
.fav-ask {
  position: absolute; inset: auto 4px 4px auto; z-index: 3;
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--acc); color: #fff; font-size: 11px;
  padding: 3px 8px; border-radius: 999px; cursor: pointer;
  box-shadow: 0 3px 10px rgba(0, 0, 0, .4);
}
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
.cell { position: relative; aspect-ratio: 1; border: 1px solid var(--line); border-radius: 9px; background: var(--card2); padding: 4px; cursor: pointer; overflow: hidden; }
.cell:hover { border-color: var(--acc); }
.cell img { width: 100%; height: 100%; object-fit: contain; }
.top { position: absolute; top: 2px; left: 4px; font-size: 12px; color: var(--fg2); background: var(--card); border-radius: 50%; width: 16px; height: 16px; line-height: 15px; text-align: center; opacity: 0; }
.cell:hover .top { opacity: .9; }
.top:hover { color: var(--acc); }
.del { position: absolute; top: 2px; right: 4px; font-size: 13px; color: var(--fg2); background: var(--card); border-radius: 50%; width: 16px; height: 16px; line-height: 15px; text-align: center; opacity: 0; }
.cell:hover .del { opacity: .9; }
.del:hover { color: var(--err); }
.file { display: inline-flex; align-items: center; cursor: pointer; padding: 3px 10px; font-size: 12px; border-radius: 7px; border: 1px solid var(--line); }
.center { text-align: center; padding: 22px 0; }
</style>
