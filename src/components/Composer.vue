<script setup lang="ts">
import { inject, ref, nextTick, computed, onUnmounted, watch } from 'vue'
import QuoteBar from './QuoteBar.vue'
import ImageEditor from './ImageEditor.vue'
import { h } from '../satori/element'
import Icon from '../console/components/Icon.vue'
import { resUrl } from '../core/res'
import { fallbackAvatar } from '../core/util'

const ctx = inject<any>('ctx')
const chat = ctx.chat
const quickreply = ctx.quickreply

const text = ref('')
const kind = ref(1)              // 1 文本 / 3 Markdown / 8 HTML
const ta = ref(null)
const imgInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const audioInput = ref<HTMLInputElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)

/**
 * 输入区按钮来自插件注册表 ctx.chat.composerOf('composer')：
 * 「文本/Markdown/HTML」由 chat 插件贡献，「快捷回复」由 quickreply 贡献。
 * 快捷回复单独渲染成一行 chips（qr-row），与模式切换按钮视觉区分。
 * 两行顺序都可拖拽自由调整，存 localStorage（默认序 = 插件注册 order）。
 */
const BAR_ORDER_KEY = 'yh.bar.order'
const QR_ORDER_KEY = 'yh.qr.order'
function loadOrder(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
const barOrder = ref<string[]>(loadOrder(BAR_ORDER_KEY))
const qrOrder = ref<string[]>(loadOrder(QR_ORDER_KEY))
function sortByOrder(list: any[], order: string[]) {
  const idx = new Map(order.map((id, i) => [id, i]))
  return [...list].sort((a, b) => (idx.get(a.id) ?? 9999) - (idx.get(b.id) ?? 9999))
}
const barItems = computed(() => sortByOrder((chat.composerOf?.('composer') || []).filter((it: any) => it.kind !== 'quick'), barOrder.value))
const qrItems = computed(() => sortByOrder((chat.composerOf?.('composer') || []).filter((it: any) => it.kind === 'quick'), qrOrder.value))

/* ---- 拖拽排序：dragstart 记 id，drop 到目标上即把拖拽项插到目标位置 ---- */
let dragId: string | null = null
function onDragStart(id: string) { dragId = id }
function onDropReorder(targetId: string, which: 'bar' | 'qr') {
  if (!dragId || dragId === targetId) { dragId = null; return }
  const items = which === 'bar' ? barItems.value : qrItems.value
  const ids = items.map((i: any) => i.id)
  const from = ids.indexOf(dragId)
  const to = ids.indexOf(targetId)
  if (from >= 0 && to >= 0) {
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    if (which === 'bar') barOrder.value = ids
    else qrOrder.value = ids
    localStorage.setItem(which === 'bar' ? BAR_ORDER_KEY : QR_ORDER_KEY, JSON.stringify(ids))
  }
  dragId = null
}

/** QQ 式图标工具条：非模式切换的按钮渲染成图标（title 保留文字语义） */
const BAR_ICON: Record<string, string> = {
  emoji: 'smile', image: 'image', file: 'paperclip', voice: 'mic',
  audioFile: 'mic', videoFile: 'video', videoRec: 'record',
}

function onInput() {
  autoresize()
  onInputAt()
  if (!text.value.startsWith('/')) return
  const kw = text.value.slice(1)
  if (/\s/.test(kw)) return
  ctx.commands?.openWith?.(kw)
}

ctx.on('commands/pick', (t: string) => {
  text.value = t
  nextTick(() => { autoresize(); ta.value?.focus() })
})
/* 群面板「@ TA」等外部追加文本到输入框 */
ctx.on('composer/append', (t: string) => {
  text.value += t
  nextTick(() => { autoresize(); ta.value?.focus() })
})

function onBar(it: any) {
  if (it.kind === 'type') { kind.value = it.value; return }
  if (it.kind === 'image') { imgInput.value?.click(); return }
  if (it.kind === 'file') { fileInput.value?.click(); return }
  if (it.kind === 'quick') { quickreply?.fire?.(it.value); return }
  if (it.kind === 'emoji') { ctx.stickers?.open?.(); return }
  if (it.kind === 'voice') {
    if (ctx.stickers?.state?.recording) ctx.stickers.recordStop()
    else ctx.stickers?.recordStart?.()
    return
  }
  if (it.kind === 'audioFile') { audioInput.value?.click(); return }
  if (it.kind === 'videoFile') { videoInput.value?.click(); return }
  if (it.kind === 'videoRec') {
    const st = ctx.stickers?.state
    if (st?.recordingVideo) ctx.stickers.recordVideoStop()
    else ctx.stickers?.recordVideoStart?.()
    return
  }
}

const placeholder = computed(() => ({
  1: '输入消息，Enter 发送 / Shift+Enter 换行；粘贴或拖入图片/视频/文件会先放进待发送区',
  3: 'Markdown：# 标题、**粗体**、`代码`、- 列表 …',
  8: '<b>HTML</b> 消息，支持内联标签',
}[kind.value]))

/** 用户拖拽设定的输入框最小高度（0=跟随内容） */
const manualMinH = ref(0)
function autoresize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  // 尊重用户手动拖拽的高度：输入只往上长，不缩回 scrollHeight
  el.style.height = Math.max(el.scrollHeight, manualMinH.value) + 'px'
}

/* ---------------- 待发送附件（暂存预览，不直接发送） ----------------
 * 暂存区按会话 id 存模块级 Map：切会话/组件重挂载都不丢（之前重挂载即清空，要重新上传）。
 */
interface Pending {
  id: number
  file: File
  url: string
  kind: 'image' | 'video' | 'audio' | 'file'
  caption: string        // 图片独立配文（发送时随图后发一条文本）
  error: string          // 上次发送失败原因（保留在暂存区可重试）
  /* 上传进度（0-1）与实时速度 MB/s，发送中显示进度条 */
  progress: number
  speed: number
}
const stagedByConv = new Map<string, Pending[]>()
const pending = ref<Pending[]>([])
let pendingSeq = 0
const convId = computed(() => chat.state.current?.id || '')
watch(convId, (id, oldId) => {
  if (oldId) stagedByConv.set(oldId, pending.value)
  pending.value = stagedByConv.get(id) || []
}, { immediate: true })

function classify(f: File): Pending['kind'] {
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  return 'file'
}

/** 加入待发送区：图片/视频生成本地预览 URL（objectURL，移除/卸载时释放） */
function stage(f: File) {
  const k = classify(f)
  const url = (k === 'image' || k === 'video') ? URL.createObjectURL(f) : ''
  pending.value.push({ id: ++pendingSeq, file: f, url, kind: k, caption: '', error: '', progress: 0, speed: 0 })
  if (convId.value) stagedByConv.set(convId.value, pending.value)
}

function unstage(p: Pending) {
  pending.value = pending.value.filter((x) => x.id !== p.id)
  if (convId.value) stagedByConv.set(convId.value, pending.value)
  if (p.url) URL.revokeObjectURL(p.url)
}

/** 组件卸载释放全部 objectURL（之前漏了这条路径，切会话即泄漏） */
onUnmounted(() => { for (const p of pending.value) if (p.url) URL.revokeObjectURL(p.url) })

/* 登出清空暂存（Map 是模块级，跨账号会残留上一账号的附件）；
   Composer 按会话挂载，监听器必须挂载/卸载配对，否则累积 */
const offLogout = ctx.on('auth/logout', () => {
  for (const list of stagedByConv.values()) for (const p of list) if (p.url) URL.revokeObjectURL(p.url)
  stagedByConv.clear()
  pending.value = []
})
onUnmounted(offLogout)

/** 选择框支持多选：全部进暂存区 */
async function onPick(e: any) {
  const fs: File[] = Array.from(e.target?.files || [])
  if (e.target) e.target.value = ''
  for (const f of fs) stage(f)
}

/** 粘贴：所有文件都进暂存区（之前只取第一个） */
async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  let took = false
  for (const it of Array.from(items)) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (!f) continue
    took = true
    stage(f)
  }
  if (took) e.preventDefault()
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  const fs = e.dataTransfer?.files
  if (!fs || !fs.length) return
  e.preventDefault()
  for (const f of Array.from(fs)) stage(f)
}

/* 拖到页面其他位置时阻止浏览器直接打开文件（window 级兜底） */
function winDragOver(e: DragEvent) { e.preventDefault() }
function winDrop(e: DragEvent) { e.preventDefault() }
window.addEventListener('dragover', winDragOver)
window.addEventListener('drop', winDrop)
onUnmounted(() => {
  window.removeEventListener('dragover', winDragOver)
  window.removeEventListener('drop', winDrop)
})

/* ---- 发送前图片编辑（裁剪/旋转/翻转） ---- */
const editing = ref<Pending | null>(null)
function openEditor(p: Pending) { if (p.kind === 'image') editing.value = p }
function onEdited(f: File) {
  const p = editing.value
  editing.value = null
  if (!p) return
  if (p.url) URL.revokeObjectURL(p.url)
  p.file = f
  p.url = URL.createObjectURL(f)
  p.error = ''
}

const uploading = ref(false)
const dragOver = ref(false)

/** 上传进度回调：进度比例 + 实时速度 MB/s（约 0.4s 窗口平滑） */
function progressOf(p: Pending) {
  let lastLoaded = 0
  let lastTs = performance.now()
  return (loaded: number, total: number) => {
    const now = performance.now()
    const dt = (now - lastTs) / 1000
    if (dt > 0.4) {
      p.speed = Math.max(0, (loaded - lastLoaded) / dt / 1024 / 1024)
      lastLoaded = loaded
      lastTs = now
    }
    p.progress = total ? loaded / total : 0
  }
}

/**
 * 发送：逐个上传待发送附件（uploadAndUrl 拿完整 URL + 进度/速度），再发文本。
 * 失败保留在暂存区标红可重试；超大小限制在 api 层直接拒绝并提示。
 */
async function submit() {
  if (uploading.value || chat.state.sending) return
  const v = text.value.trim()
  const todo = pending.value.filter((p) => !p.error || true)   // 含失败项一起重试
  if (!v && !todo.length) return
  uploading.value = true
  let attachFailed = 0
  try {
    for (const p of [...todo]) {
      p.error = ''
      p.progress = 0
      p.speed = 0
      try {
        const onProg = progressOf(p)
        if (p.kind === 'image') {
          const { url } = await ctx.api.uploadAndUrl(p.file, 'image', onProg)
          await chat.sendMedia([h.image(url)])
          if (p.caption.trim()) await chat.send(p.caption.trim(), 1)
        } else if (p.kind === 'video') {
          // 视频/音频发**裸 key**（与 stickers.sendVideo 同协议）：发完整 URL 云端存不下、播放 404
          const { key } = await ctx.api.uploadFile(p.file, 'video', onProg)
          await chat.sendMedia([h.video(key, 0)])
        } else if (p.kind === 'audio') {
          const { key } = await ctx.api.uploadFile(p.file, 'audio', onProg)
          await chat.sendMedia([h.audio(key, 0)])
        } else {
          const { url } = await ctx.api.uploadAndUrl(p.file, 'file', onProg)
          await chat.sendMedia([h.file(url, p.file.name, p.file.size)])
        }
        unstage(p)
      } catch (err: any) {
        // 失败不丢附件：标红留在暂存区，下次点发送自动重试
        p.error = err?.message || '上传失败'
        p.progress = 0
        p.speed = 0
        attachFailed++
      }
    }
    if (v) {
      // chat.send 失败时自己会 toast，这里不再重复弹
      try { await chat.send(v, kind.value) } catch { /* 已提示 */ }
      text.value = ''
    }
    await nextTick()
    autoresize()
  } finally {
    uploading.value = false
    if (attachFailed) ctx.ui?.toast(`${attachFailed} 个附件发送失败，已保留在待发送区，可重试`, 'error')
  }
}

/* ---- 输入区高度拖拽（顶边把手）：最低一行字高，双击复位 ---- */
const taMinH = 24   // 一行字的高度（px）
function startResize(e: MouseEvent) {
  const startY = e.clientY
  const el = ta.value
  const startH = el ? el.getBoundingClientRect().height : 140
  const move = (ev: MouseEvent) => {
    const h = Math.max(taMinH, Math.min(startH + (startY - ev.clientY), window.innerHeight * 0.7))
    manualMinH.value = h          // 记住拖拽高度，autoresize 不再缩回
    if (el) el.style.height = h + 'px'
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function resetHeight() {
  manualMinH.value = 0
  const el = ta.value
  if (el) { el.style.height = ''; autoresize() }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    // @ 成员下拉打开时，Enter 选中当前高亮项而不是发送
    if (atOpen.value && atList.value.length) { e.preventDefault(); pickAt(atIdx.value); return }
    e.preventDefault(); submit()
  }
  if (atOpen.value) {
    if (e.key === 'ArrowDown') { e.preventDefault(); atIdx.value = (atIdx.value + 1) % atList.value.length }
    if (e.key === 'ArrowUp') { e.preventDefault(); atIdx.value = (atIdx.value - 1 + atList.value.length) % atList.value.length }
    if (e.key === 'Escape') { atOpen.value = false }
  }
}

/* ---------------- @成员（QQ 式：输入 @ 弹成员列表，可搜索可选） ---------------- */
const atOpen = ref(false)
const atIdx = ref(0)
const atList = computed<any[]>(() => {
  if (!atOpen.value) return []
  const g = ctx.group
  if (!g || chat.state.current?.type !== 2) return []
  const kw = atKeyword.value.trim().toLowerCase()
  const ms = g.state?.members || []
  return (kw ? ms.filter((m: any) => (m.name || '').toLowerCase().includes(kw)) : ms).slice(0, 8)
})
const atKeyword = ref('')

function onInputAt() {
  // 检测光标前最近的 @ 片段：@xxx（无空格）即处于 at 输入态
  const el = ta.value
  if (!el) { atOpen.value = false; return }
  const before = text.value.slice(0, el.selectionStart ?? text.value.length)
  const m = before.match(/@([^\s@]{0,12})$/)
  if (m && chat.state.current?.type === 2) {
    atKeyword.value = m[1]
    atIdx.value = 0
    if (!atOpen.value) { atOpen.value = true; ctx.group?.loadMembers?.() }
  } else {
    atOpen.value = false
  }
}

function pickAt(i: number) {
  const m = atList.value[i]
  if (!m) return
  const el = ta.value
  const pos = el?.selectionStart ?? text.value.length
  const before = text.value.slice(0, pos).replace(/@([^\s@]{0,12})$/, `@${m.name} `)
  text.value = before + text.value.slice(pos)
  atOpen.value = false
  nextTick(() => { autoresize(); el?.focus() })
}

/* ---- 快捷回复 chips 管理 ---- */
const addingQr = ref(false)
const qrNew = ref('')
function qrAdd() {
  const t = qrNew.value.trim()
  if (t) quickreply?.add?.(t)
  qrNew.value = ''
  addingQr.value = false
}

function fmtSize(n: number) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="composer" :class="{ 'drag-over': dragOver }"
       @drop="onDrop" @dragover.prevent="dragOver = true" @dragleave="dragOver = false">
    <!-- 顶边拖拽调输入区高度（最低=一行字高，双击复位） -->
    <div class="resize-bar" title="拖拽调整输入区高度（双击复位）"
         @mousedown.prevent="startResize" @dblclick="resetHeight"></div>
    <QuoteBar />
    <div class="bar-row">
      <template v-for="it in barItems" :key="it.id">
        <button v-if="it.kind === 'type'" class="ghost tiny" draggable="true"
                :class="{ on: kind === it.value }" @click="onBar(it)"
                @dragstart="onDragStart(it.id)" @dragover.prevent @drop.stop="onDropReorder(it.id, 'bar')">{{ it.label }}</button>
        <button v-else class="ghost tiny icon-btn" :title="it.label" draggable="true"
                @click="onBar(it)"
                @dragstart="onDragStart(it.id)" @dragover.prevent @drop.stop="onDropReorder(it.id, 'bar')">
          <Icon :name="BAR_ICON[it.kind] || 'page'" :size="16" />
        </button>
      </template>
      <input ref="imgInput" type="file" accept="image/*" multiple hidden @change="onPick" />
      <input ref="fileInput" type="file" multiple hidden @change="onPick" />
      <input ref="audioInput" type="file" accept="audio/*" multiple hidden @change="onPick" />
      <input ref="videoInput" type="file" accept="video/*" multiple hidden @change="onPick" />
      <span v-if="ctx.stickers?.state?.recording" class="rec-dot">
        录音中 {{ ctx.stickers.state.seconds }}s（再点「语音」结束并发送）
      </span>
      <span v-if="ctx.stickers?.state?.recordingVideo" class="rec-dot">
        录制中 {{ ctx.stickers.state.videoSeconds }}s（再点「录制视频」结束并发送）
      </span>
    </div>

    <div v-if="qrItems.length || addingQr" class="qr-row">
      <button v-for="it in qrItems" :key="it.id" class="qr-chip" draggable="true"
              @click="onBar(it)"
              @dragstart="onDragStart(it.id)" @dragover.prevent @drop.stop="onDropReorder(it.id, 'qr')">
        {{ it.label }}
        <span class="x" title="移除" @click.stop="quickreply?.remove?.(it.value)">×</span>
      </button>
      <template v-if="addingQr">
        <input v-model="qrNew" class="qr-add-input" placeholder="新快捷回复" @keyup.enter="qrAdd" @keyup.esc="addingQr = false" />
        <button class="ghost tiny" @click="qrAdd">保存</button>
      </template>
      <button v-else class="qr-chip qr-add" title="添加快捷回复" @click="addingQr = true">+ 添加</button>
    </div>

    <!-- 待发送附件预览区：图片可点开发送前编辑，可写独立配文 -->
    <div v-if="pending.length" class="pending">
      <div v-for="p in pending" :key="p.id" class="pend" :class="{ wide: p.kind === 'image', err: !!p.error }">
        <img v-if="p.kind === 'image'" :src="p.url" alt="" title="点击编辑（裁剪/旋转/翻转）" @click="openEditor(p)" />
        <video v-else-if="p.kind === 'video'" :src="p.url" muted preload="metadata" controls></video>
        <div v-else class="pend-file">
          <Icon :name="p.kind === 'audio' ? 'mic' : 'paperclip'" :size="18" />
          <span class="nm">{{ p.file.name }}</span>
        </div>
        <span class="pend-meta">{{ p.kind === 'file' || p.kind === 'audio' ? fmtSize(p.file.size) : fmtSize(p.file.size) }}</span>
        <!-- 上传进度条 + 实时速度 MB/s -->
        <div v-if="uploading && p.progress > 0 && !p.error" class="pend-prog">
          <div class="bar" :style="{ width: Math.round(p.progress * 100) + '%' }"></div>
          <span class="spd">{{ p.speed.toFixed(1) }} MB/s</span>
        </div>
        <span v-if="p.error" class="pend-err" :title="p.error">发送失败 · 点发送重试</span>
        <button class="pend-x" title="移除" @click="unstage(p)">×</button>
        <input v-if="p.kind === 'image'" v-model="p.caption" class="pend-cap" placeholder="给这张图配一句话（可选）" />
      </div>
    </div>

    <!-- QQ 式输入区：输入框占满，发送按钮在右下角 -->
    <!-- @成员下拉（QQ 式：输入 @ 弹出，可继续输入搜索，↑↓ 选择，Enter 选中） -->
    <div v-if="atOpen && atList.length" class="at-pop">
      <button v-for="(m, i) in atList" :key="m.id" class="at-item" :class="{ on: i === atIdx }"
              @click="pickAt(i)" @mouseenter="atIdx = i">
        <img :src="m.avatar ? resUrl(m.avatar) : fallbackAvatar(m.name)" alt="" />
        <span>{{ m.name }}</span>
        <span class="dim small">{{ m.id }}</span>
      </button>
    </div>

    <div class="line">
      <textarea ref="ta" v-model="text" :placeholder="placeholder"
                @input="onInput" @keydown="onKey" @paste="onPaste"></textarea>
      <div class="send-row">
        <span class="hint">{{ pending.length ? pending.length + ' 个附件待发' : '' }}</span>
        <button :disabled="chat.state.sending || uploading || (!text.trim() && !pending.length)" @click="submit">
          {{ chat.state.sending || uploading ? '…' : '发送' }}
        </button>
      </div>
    </div>

    <ImageEditor v-if="editing" :file="editing.file" :url="editing.url"
                 @done="onEdited" @close="editing = null" />
  </div>
</template>

<style scoped>
.bar-row {
  display: flex; flex-wrap: nowrap; align-items: center; gap: 6px;
  margin-bottom: 8px; padding: 2px 0 4px;
  overflow-x: auto; overflow-y: hidden; max-width: 100%;
  scrollbar-width: none; -webkit-overflow-scrolling: touch;
}
.bar-row::-webkit-scrollbar { display: none; }
.bar-row > * { flex: 0 0 auto; }
.tiny { padding: 3px 10px; font-size: 12px; border-radius: 7px; }
/* 图标按钮必须零内边距，否则 grid 居中会被 padding 挤偏（实测偏 4px） */
.bar-row .icon-btn { padding: 0; }
.bar-row .on { background: var(--acc); color: #fff; border-color: transparent; }
.line { position: relative; display: flex; }
.line textarea { width: 100%; padding-bottom: 34px; }   /* 底部留出发送行空间 */
.send-row {
  position: absolute; right: 6px; bottom: 6px;
  display: flex; align-items: center; gap: 10px;
}
.send-row .hint { font-size: 11px; color: var(--fg2); }
.send-row button { height: 28px; padding: 0 18px; font-size: 13px; border-radius: 6px; }
.rec-dot { font-size: 12px; color: var(--err); flex: 0 0 auto; }

/* 顶边拖拽把手：一条细热区，hover 变强调色提示可拖 */
.resize-bar {
  position: absolute; left: 0; right: 0; top: -4px; height: 8px; cursor: ns-resize;
  background: transparent; z-index: 2;
}
.resize-bar:hover, .resize-bar:active { background: color-mix(in srgb, var(--acc) 35%, transparent); }

/* @成员下拉（浮在输入区上方） */
.at-pop {
  position: absolute; left: 14px; bottom: 100%; margin-bottom: 6px; z-index: 76;
  width: min(280px, 80%); max-height: 240px; overflow: auto;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .4); padding: 4px;
}
.at-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 6px 8px; border: none; border-radius: 7px; background: none;
  color: var(--fg); font-size: 13px; cursor: pointer;
}
.at-item img { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; background: var(--card2); }
.at-item.on { background: var(--acc-soft, var(--card2)); color: var(--acc); }

/* 待发送附件预览 */
.pending { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pend {
  position: relative; width: 84px; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--line); background: var(--card2);
}
.pend.wide { width: 132px; }
.pend.err { border-color: var(--err); }
.pend img, .pend video { width: 100%; height: 84px; object-fit: cover; display: block; cursor: pointer; }
.pend-file {
  width: 100%; height: 84px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; color: var(--fg2); padding: 6px;
}
.pend-file .nm {
  font-size: 10.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.pend-meta {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; color: #fff;
  background: rgba(0, 0, 0, .45); text-align: center;
}
.pend-cap {
  width: 100%; border: none; border-top: 1px solid var(--line); background: var(--card);
  color: var(--fg); font-size: 11px; padding: 4px 6px; outline: none;
}
.pend-err {
  position: absolute; left: 0; right: 0; top: 0; font-size: 10px; color: #fff;
  background: rgba(200, 40, 40, .82); text-align: center; padding: 2px 0;
}
.pend-x {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; padding: 0;
  border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; font-size: 13px; line-height: 1;
  display: grid; place-items: center;
}
.pend-x:hover { background: var(--err); }
/* 上传进度条（底部）+ 速度标签 */
.pend-prog {
  position: absolute; left: 0; right: 0; bottom: 0; height: 14px;
  background: rgba(0, 0, 0, .55); display: flex; align-items: center;
}
.pend-prog .bar {
  position: absolute; left: 0; top: 0; bottom: 0; background: var(--acc); opacity: .8;
  transition: width .25s linear;
}
.pend-prog .spd {
  position: relative; width: 100%; text-align: center; font-size: 9.5px; color: #fff; line-height: 14px;
}
</style>
