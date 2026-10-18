<script setup lang="ts">
import { inject, ref, nextTick, computed } from 'vue'
import QuoteBar from './QuoteBar.vue'
import { h } from '../satori/element'

const ctx = inject<any>('ctx')
const chat = ctx.chat
const quickreply = ctx.quickreply

const text = ref('')
const kind = ref(1)              // 1 文本 / 3 Markdown / 8 HTML
const ta = ref(null)

/**
 * 输入区按钮来自插件注册表 ctx.chat.composerOf('composer')：
 * 「文本/Markdown/HTML」由 chat 插件贡献，「快捷回复」由 quickreply 贡献。
 * 卸载哪个插件，对应按钮就消失。
 * 快捷回复单独渲染成一行 chips（qr-row），与模式切换按钮视觉区分。
 */
const barItems = computed(() => (chat.composerOf?.('composer') || []).filter((it: any) => it.kind !== 'quick'))
const qrItems = computed(() => (chat.composerOf?.('composer') || []).filter((it: any) => it.kind === 'quick'))

/**
 * 输入处理：
 *   1) 自适应高度
 *   2) 只在开头打一个 `/` 就唤起机器人指令面板（然后清掉那个 /）
 */
function onInput() {
  autoresize()
  // 输入以 / 开头 → 打开指令面板并把已输入内容当关键字（边打边筛，仿 TG/QQ）
  if (!text.value.startsWith('/')) return
  const kw = text.value.slice(1)
  // 只有「/ 开头且还没打空格」时才当指令筛选；打了空格说明是在写参数，不打扰
  if (/\s/.test(kw)) return
  ctx.commands?.openWith?.(kw)
}

/** 指令面板选中一条 → 填进输入框 */
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
    // 第一次点开始录，再点一次结束并发送
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
  1: '输入消息，Enter 发送 / Shift+Enter 换行；可直接粘贴图片/视频/文件',
  3: 'Markdown：# 标题、**粗体**、`代码`、- 列表 …',
  8: '<b>HTML</b> 消息，支持内联标签',
}[kind.value]))

function autoresize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

async function submit() {
  const v = text.value.trim()
  if (!v || chat.state.sending) return
  try {
    await chat.send(v, kind.value)
    text.value = ''
    await nextTick()
    autoresize()
  } catch { /* chat 已提示 */ }
}

/** 上传并发送附件 */
const imgInput = ref<HTMLInputElement | null>(null)
const audioInput = ref<HTMLInputElement | null>(null)
const videoInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function onPick(e: any, kind: 'image' | 'file') {
  const f: File | undefined = e.target?.files?.[0]
  if (e.target) e.target.value = ''
  if (!f) return
  await sendFile(f)
}

/** 统一上传发送：按 MIME 分流到图片/视频/语音/文件元素 */
async function sendFile(f: File) {
  uploading.value = true
  try {
    ctx.ui?.toast('上传中…' + f.name, 'info', 1500)
    if (f.type.startsWith('image/')) {
      const { url } = await ctx.api.uploadAndUrl(f, 'image')
      await chat.sendMedia([h.image(url)])
    } else if (f.type.startsWith('video/')) {
      await ctx.stickers?.sendVideo?.(f, 0)
    } else if (f.type.startsWith('audio/')) {
      await ctx.stickers?.sendAudio?.(f, 0)
    } else {
      const { url } = await ctx.api.uploadAndUrl(f, 'file')
      await chat.sendMedia([h.file(url, f.name, f.size)])
    }
    ctx.ui?.toast('已发送', 'success', 1500)
  } catch (err: any) {
    ctx.ui?.toast('上传失败：' + err.message, 'error')
  } finally { uploading.value = false }
}

/** 粘贴上传：剪贴板里的图片/视频/文件直接发送（需求 8） */
async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const it of Array.from(items)) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (!f) continue
    e.preventDefault()
    await sendFile(f)
    return
  }
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
</script>

<template>
  <div class="composer">
    <QuoteBar />
    <!-- 输入区按钮：全部由插件注册（chat.composer），这里只渲染成一行，可横向滑动 -->
    <div class="bar-row">
      <button v-for="it in barItems" :key="it.id" class="ghost tiny"
              :class="{ on: it.kind === 'type' && kind === it.value }"
              @click="onBar(it)">{{ it.label }}</button>
      <input ref="imgInput" type="file" accept="image/*" hidden @change="(e: any) => onPick(e, 'image')" />
      <input ref="fileInput" type="file" hidden @change="(e: any) => onPick(e, 'file')" />
      <input ref="audioInput" type="file" accept="audio/*" hidden @change="(e: any) => ctx.stickers?.sendAudioFile?.(e)" />
      <input ref="videoInput" type="file" accept="video/*" hidden @change="(e: any) => ctx.stickers?.sendVideoFile?.(e)" />
      <!-- 录音中提示 -->
      <span v-if="ctx.stickers?.state?.recording" class="rec-dot">
        录音中 {{ ctx.stickers.state.seconds }}s（再点「语音」结束并发送）
      </span>
      <span v-if="ctx.stickers?.state?.recordingVideo" class="rec-dot">
        录制中 {{ ctx.stickers.state.videoSeconds }}s（再点「录制视频」结束并发送）
      </span>
    </div>

    <!-- 快捷回复 chips：独立一行、强调色胶囊，与普通按钮明显区分 -->
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

    <div class="line">
      <textarea ref="ta" v-model="text" :placeholder="placeholder"
                @input="onInput" @keydown="onKey" @paste="onPaste"></textarea>
      <button :disabled="chat.state.sending || uploading || !text.trim()" @click="submit">
        {{ chat.state.sending || uploading ? '…' : '发送' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 输入区按钮：单独一个 div，排成一行，放不下就横向滑动（不再撑开输入区） */
.bar-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 2px 0 4px;
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 100%;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.bar-row::-webkit-scrollbar { display: none; }
.bar-row > * { flex: 0 0 auto; }
.tiny { padding: 3px 10px; font-size: 12px; border-radius: 7px; }
.bar-row .on { background: var(--acc); color: #fff; border-color: transparent; }
.line { display: flex; gap: 9px; align-items: flex-end; }
.rec-dot { font-size: 12px; color: var(--err); flex: 0 0 auto; }
</style>
