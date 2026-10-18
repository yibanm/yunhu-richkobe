<script setup lang="ts">
import { inject, ref, nextTick, computed } from 'vue'
import QuoteBar from './QuoteBar.vue'
import { h } from '../satori/element'
import Icon from '../console/components/Icon.vue'

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
 */
const barItems = computed(() => (chat.composerOf?.('composer') || []).filter((it: any) => it.kind !== 'quick'))
const qrItems = computed(() => (chat.composerOf?.('composer') || []).filter((it: any) => it.kind === 'quick'))

function onInput() {
  autoresize()
  if (!text.value.startsWith('/')) return
  const kw = text.value.slice(1)
  if (/\s/.test(kw)) return
  ctx.commands?.openWith?.(kw)
}

ctx.on('commands/pick', (t: string) => {
  text.value = t
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
  1: '输入消息，Enter 发送 / Shift+Enter 换行；粘贴或拖入图片/视频/文件会先放进下方待发送区',
  3: 'Markdown：# 标题、**粗体**、`代码`、- 列表 …',
  8: '<b>HTML</b> 消息，支持内联标签',
}[kind.value]))

function autoresize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 260) + 'px'
}

/* ---------------- 待发送附件（暂存预览，不直接发送） ---------------- */
interface Pending { id: number; file: File; url: string; kind: 'image' | 'video' | 'audio' | 'file' }
const pending = ref<Pending[]>([])
let pendingSeq = 0

function classify(f: File): Pending['kind'] {
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  return 'file'
}

/** 加入待发送区：图片/视频生成本地预览 URL（objectURL，卸载/移除时释放） */
function stage(f: File) {
  const k = classify(f)
  const url = (k === 'image' || k === 'video') ? URL.createObjectURL(f) : ''
  pending.value.push({ id: ++pendingSeq, file: f, url, kind: k })
}

function unstage(p: Pending) {
  pending.value = pending.value.filter((x) => x.id !== p.id)
  if (p.url) URL.revokeObjectURL(p.url)
}

async function onPick(e: any) {
  const f: File | undefined = e.target?.files?.[0]
  if (e.target) e.target.value = ''
  if (!f) return
  stage(f)
}

/** 粘贴/拖入：文件进待发送区，纯文本走原逻辑 */
async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of Array.from(items)) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (!f) continue
    e.preventDefault()
    stage(f)
    return
  }
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  const fs = e.dataTransfer?.files
  if (!fs || !fs.length) return
  e.preventDefault()
  for (const f of Array.from(fs)) stage(f)
}

const uploading = ref(false)
const dragOver = ref(false)

/** 发送：先传待发送附件（按类型转元素），再发文本 */
async function submit() {
  if (uploading.value || chat.state.sending) return
  const v = text.value.trim()
  if (!v && !pending.value.length) return
  uploading.value = true
  try {
    for (const p of [...pending.value]) {
      if (p.kind === 'image') {
        const { url } = await ctx.api.uploadAndUrl(p.file, 'image')
        await chat.sendMedia([h.image(url)])
      } else if (p.kind === 'video') {
        await ctx.stickers?.sendVideo?.(p.file, 0)
      } else if (p.kind === 'audio') {
        await ctx.stickers?.sendAudio?.(p.file, 0)
      } else {
        const { url } = await ctx.api.uploadAndUrl(p.file, 'file')
        await chat.sendMedia([h.file(url, p.file.name, p.file.size)])
      }
      unstage(p)
    }
    if (v) {
      await chat.send(v, kind.value)
      text.value = ''
    }
    await nextTick()
    autoresize()
  } catch (err: any) {
    ctx.ui?.toast('发送失败：' + err.message, 'error')
  } finally { uploading.value = false }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); submit() }
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
    <QuoteBar />
    <div class="bar-row">
      <button v-for="it in barItems" :key="it.id" class="ghost tiny"
              :class="{ on: it.kind === 'type' && kind === it.value }"
              @click="onBar(it)">{{ it.label }}</button>
      <input ref="imgInput" type="file" accept="image/*" hidden @change="onPick" />
      <input ref="fileInput" type="file" hidden @change="onPick" />
      <input ref="audioInput" type="file" accept="audio/*" hidden @change="(e: any) => ctx.stickers?.sendAudioFile?.(e)" />
      <input ref="videoInput" type="file" accept="video/*" hidden @change="(e: any) => ctx.stickers?.sendVideoFile?.(e)" />
      <span v-if="ctx.stickers?.state?.recording" class="rec-dot">
        录音中 {{ ctx.stickers.state.seconds }}s（再点「语音」结束并发送）
      </span>
      <span v-if="ctx.stickers?.state?.recordingVideo" class="rec-dot">
        录制中 {{ ctx.stickers.state.videoSeconds }}s（再点「录制视频」结束并发送）
      </span>
    </div>

    <div v-if="qrItems.length || addingQr" class="qr-row">
      <button v-for="it in qrItems" :key="it.id" class="qr-chip" @click="onBar(it)">
        {{ it.label }}
        <span class="x" title="移除" @click.stop="quickreply?.remove?.(it.value)">×</span>
      </button>
      <template v-if="addingQr">
        <input v-model="qrNew" class="qr-add-input" placeholder="新快捷回复" @keyup.enter="qrAdd" @keyup.esc="addingQr = false" />
        <button class="ghost tiny" @click="qrAdd">保存</button>
      </template>
      <button v-else class="qr-chip qr-add" title="添加快捷回复" @click="addingQr = true">+ 添加</button>
    </div>

    <!-- 待发送附件预览区 -->
    <div v-if="pending.length" class="pending">
      <div v-for="p in pending" :key="p.id" class="pend">
        <img v-if="p.kind === 'image'" :src="p.url" alt="" />
        <video v-else-if="p.kind === 'video'" :src="p.url" muted preload="metadata"></video>
        <div v-else class="pend-file">
          <Icon :name="p.kind === 'audio' ? 'mic' : 'paperclip'" :size="18" />
          <span class="nm">{{ p.file.name }}</span>
        </div>
        <span class="pend-meta">{{ p.kind === 'file' || p.kind === 'audio' ? fmtSize(p.file.size) : '' }}</span>
        <button class="pend-x" title="移除" @click="unstage(p)">×</button>
      </div>
    </div>

    <div class="line">
      <textarea ref="ta" v-model="text" :placeholder="placeholder"
                @input="onInput" @keydown="onKey" @paste="onPaste"></textarea>
      <button :disabled="chat.state.sending || uploading || (!text.trim() && !pending.length)" @click="submit">
        {{ chat.state.sending || uploading ? '…' : '发送' }}
      </button>
    </div>
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
.bar-row .on { background: var(--acc); color: #fff; border-color: transparent; }
.line { display: flex; gap: 9px; align-items: flex-end; }
/* 输入框加大：最小高度 96px，方便预览与编辑待发送内容 */
.line textarea { min-height: 96px; }
.rec-dot { font-size: 12px; color: var(--err); flex: 0 0 auto; }

/* 待发送附件预览 */
.pending { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pend {
  position: relative; width: 84px; height: 84px; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--line); background: var(--card2);
}
.pend img, .pend video { width: 100%; height: 100%; object-fit: cover; display: block; }
.pend-file {
  width: 100%; height: 100%; display: flex; flex-direction: column;
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
.pend-x {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; padding: 0;
  border-radius: 50%; background: rgba(0, 0, 0, .55); color: #fff; font-size: 13px; line-height: 1;
  display: grid; place-items: center;
}
.pend-x:hover { background: var(--err); }
</style>
