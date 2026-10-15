<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useCtx } from '../core/useCtx'
import QuoteBar from './QuoteBar.vue'
import { h } from '../satori/element'

const ctx = useCtx()
const chat = ctx.chat
const quickreply = ctx.quickreply

const text = ref('')
const kind = ref(1)              // 1 文本 / 3 Markdown / 8 HTML
const ta = ref(null)

/**
 * 输入区按钮来自插件注册表 ctx.chat.composerOf('composer')：
 * 「文本/Markdown/HTML/图片/文件…」功能项由 chat/stickers 插件贡献，
 * 「快捷回复」由 quickreply 贡献。卸载哪个插件，对应按钮就消失。
 * 快捷回复与功能项**分层**：功能项一行（工具条），快捷回复单独一行（chips），
 * 混在一排时快捷回复会被功能项淹没（QQ 也是分层的）。
 */
const allBarItems = computed(() => chat.composerOf?.('composer') || [])
const barItems = computed(() => allBarItems.value.filter((it: any) => it.kind !== 'quick'))
const quickItems = computed(() => allBarItems.value.filter((it: any) => it.kind === 'quick'))

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

const KINDS_UNUSED = [
  { v: 1, name: '文本' },
  { v: 3, name: 'Markdown' },
  { v: 8, name: 'HTML' },
]
const placeholder = computed(() => ({
  1: '输入消息，Enter 发送 / Shift+Enter 换行',
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
  uploading.value = true
  try {
    ctx.ui?.toast('上传中…' + f.name, 'info', 1500)
    const { url } = await ctx.api.uploadAndUrl(f, kind)
    if (kind === 'image') await chat.sendMedia([h.image(url)])
    else await chat.sendMedia([h.file(url, f.name, f.size)])
    ctx.ui?.toast('已发送', 'success', 1500)
  } catch (err: any) {
    ctx.ui?.toast('上传失败：' + err.message, 'error')
  } finally { uploading.value = false }
}

function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); submit() }
}

/**
 * 剪贴板粘贴：图片 / 视频 / 任意文件直接上传发送（QQ 同款体验）。
 * 纯文本粘贴走浏览器默认行为，不拦截。
 */
async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (!f) continue
    e.preventDefault()
    const media: 'image' | 'video' | 'file' =
      f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'file'
    uploading.value = true
    try {
      ctx.ui?.toast('粘贴上传中…' + (f.name || media), 'info', 1500)
      const { url } = await ctx.api.uploadAndUrl(f, media === 'video' ? 'file' : media)
      if (media === 'image') await chat.sendMedia([h.image(url)])
      else if (media === 'video') await chat.sendMedia([h.video(url)])
      else await chat.sendMedia([h.file(url, f.name || '粘贴的文件', f.size)])
      ctx.ui?.toast('已发送', 'success', 1500)
    } catch (err: any) {
      ctx.ui?.toast('粘贴上传失败：' + err.message, 'error')
    } finally {
      uploading.value = false
    }
    return
  }
}
</script>

<template>
  <div class="composer">
    <QuoteBar />
    <!-- 快捷回复层：独立一行 chips，与功能工具条分层 -->
    <div v-if="quickItems.length" class="quick-row">
      <button v-for="it in quickItems" :key="it.id" class="ghost tiny quick-chip"
              @click="onBar(it)">{{ it.label }}</button>
    </div>
    <!-- 功能工具条层：文本/Markdown/图片/文件/语音… -->
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

    <div class="line">
      <textarea ref="ta" v-model="text" :placeholder="placeholder"
                @input="onInput" @keydown="onKey" @paste="onPaste"></textarea>
      <button :disabled="chat.state.sending || !text.trim()" @click="submit">
        {{ chat.state.sending ? '…' : '发送' }}
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
/* 快捷回复层：圆角 chips，视觉上和工具条区分 */
.quick-row {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;
}
.quick-chip {
  border-radius: 999px; background: var(--acc-soft); border-color: transparent; color: var(--acc);
}
.quick-chip:hover { background: var(--acc); color: #fff; }
.tiny { padding: 3px 10px; font-size: 12px; border-radius: 7px; }
.bar-row .on { background: var(--acc); color: #fff; border-color: transparent; }
.line { display: flex; gap: 9px; align-items: flex-end; }
.rec-dot { font-size: 12px; color: var(--err); flex: 0 0 auto; }
</style>
