<script setup lang="ts">
/**
 * Satori 元素树渲染器（消息正文的统一出口）。
 *
 * 内核把云湖各种 content_type 都 parse 成 Element[]，所以这里只处理一种结构，
 * 不再关心 content_type 是什么。包含：
 *   文本/Markdown/HTML/图片/表情/语音/视频/文件/提及/链接/引用/A2UI/表单/提示
 *
 * 自定义渲染器：先查 ctx.chat.rendererFor(...)（插件可注册气泡渲染器），
 * 没人认领才走下面这套内置分支。
 * A2UI 的 HTML 内嵌按钮（data-a2ui-action）用事件委托在根节点上统一接。
 */
import { ref, computed, watch, onMounted, nextTick, inject } from 'vue'
import { resUrl, mediaUrl } from '../core/res'
import { renderMarkdown, sanitizeHtml, postProcess, linkify, renderRich } from '../core/render'
import { analyzeA2ui } from '../satori/a2ui'
import type { Element } from '../satori/element'
import A2uiNode from './A2uiNode.vue'

const props = defineProps<{
  elements: Element[]
  /** 引用块：{ sender, preview } */
  quote?: { sender: string; preview: string; id?: string } | null
  /** 原始消息（自定义渲染器要用到） */
  msg?: any
}>()
const emit = defineEmits<{ (e: 'a2ui-action', a: any): void; (e: 'quote-jump', id: string): void }>()

const ctx = inject<any>('ctx')
const body = ref<HTMLElement | null>(null)

/**
 * 自定义气泡渲染器（消息气泡插件化的落点）
 * 插件用 ctx.chat.renderer({ id, match, render }) 注册，谁先认领就用谁的组件；
 * 没人认领才走下面内置的这套元素渲染。
 */
const custom = computed(() => {
  try { return ctx?.chat?.rendererFor?.({ msg: props.msg, elements: props.elements, quote: props.quote }) || null }
  catch { return null }
})

const list = computed(() => props.elements || [])

/**
 * A2UI 完整版：HTML 里内嵌的按钮（data-a2ui-action）也要能点。
 * 用事件委托一次性覆盖整个元素容器，不需要给每个按钮单独绑。
 */
function onHtmlClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  const btn = t?.closest?.('[data-a2ui-action]') as HTMLElement | null
  if (!btn) return
  e.preventDefault()
  e.stopPropagation()
  emit('a2ui-action', {
    name: btn.getAttribute('data-a2ui-action') || '',
    sourceComponentId: btn.getAttribute('data-a2ui-id') || btn.getAttribute('data-a2ui-source') || '',
    context: {},
  })
}
const mdHtml = (el: Element) => renderMarkdown(el.attrs.content)
const htmlHtml = (el: Element) => sanitizeHtml(el.attrs.content)

/** A2UI：可能是组件流 / HTML / 文本 */
function a2uiOf(el: Element) {
  return analyzeA2ui(el.attrs.data)
}

function formFields(el: Element) {
  const raw = el.attrs.data
  if (!raw) return null
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(j) ? j : (j.fields || j.components || null)
  } catch { return null }
}

/** 有宽高就用 aspect-ratio 占位（截图这种长图不会先撑成 0 高再跳） */
function ratioOf(el: Element) {
  const w = Number(el.attrs.width) || 0
  const h = Number(el.attrs.height) || 0
  if (!w || !h) return {}
  // 只用来占位，实际尺寸交给 CSS 的 max-width/max-height
  return { aspectRatio: `${w} / ${h}` }
}

/** 点击图片/视频 → 页内灯箱查看（QQ 式），点空白处收起 */
const viewer = ref<{ kind: 'image' | 'video'; url: string } | null>(null)
const viewerVideo = ref<HTMLVideoElement | null>(null)
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
function openRaw(src: string) {
  const u = resUrl(src)
  if (u) { viewer.value = { kind: 'image', url: u }; zoom.value = 1; pan.value = { x: 0, y: 0 } }
}
function openVideo(src: string) {
  const u = mediaUrl(src, 'video')
  if (u) { viewer.value = { kind: 'video', url: u }; zoom.value = 1; pan.value = { x: 0, y: 0 } }
}
/** 视频全屏：CSS 伪全屏铺满灯箱（WebView2 里 Fullscreen API 常被拒），原生全屏作增强 */
const videoFull = ref(false)
function toggleVideoFull() {
  videoFull.value = !videoFull.value
  const v = viewerVideo.value
  if (videoFull.value && v?.requestFullscreen) v.requestFullscreen().catch(() => {})
  if (!videoFull.value && document.fullscreenElement) document.exitFullscreen().catch(() => {})
}
function closeViewer() { viewer.value = null; videoFull.value = false }

/** 聊天里左键点表情 → 打开表情面板并定位到它所属合集（未收藏则提示可添加） */
function openStickerPack(el: any) {
  const a = el.attrs || {}
  ctx.stickers?.openPackOf?.(a.packId || 0, a.expressionId || a.itemId || 0)
}
/** 滚轮缩放（以 1.25 步进，限 0.2–8 倍） */
function onWheel(e: WheelEvent) {
  if (!viewer.value || viewer.value.kind !== 'image') return
  zoom.value = Math.min(8, Math.max(0.2, zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
}
/** 拖拽平移（放大后看局部） */
function startPan(e: MouseEvent) {
  if (zoom.value <= 1) return
  const sx = e.clientX, sy = e.clientY
  const ox = pan.value.x, oy = pan.value.y
  const move = (ev: MouseEvent) => { pan.value = { x: ox + ev.clientX - sx, y: oy + ev.clientY - sy } }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
/** 视频应用内全屏（requestFullscreen，不跳外部播放器） */
function fullVideo() {
  viewerVideo.value?.requestFullscreen?.().catch(() => {})
}

/** 文章卡片：页内弹窗看正文（markdown/HTML 净化渲染） */
const postView = ref<any>(null)
const postLoading = ref(false)
const postBody = ref<HTMLElement | null>(null)
// 弹窗正文渲染后把图片/资源链接改写到 /res 代理（防盗链 Referer，否则带图文章图全裂）
watch(postView, async (v) => {
  if (!v) return
  await nextTick()
  if (postBody.value) postProcess(postBody.value)
})
async function openPost(el: any) {
  const a = el.attrs || {}
  // 消息里可能只带 post_id 不带正文 → 拉详情补全（之前空弹窗的根因）
  if (!a.content && a.id) {
    postLoading.value = true
    postView.value = { ...a, content: '', loading: true }
    try {
      const d = await ctx.api?.baPostDetail?.(Number(a.id))
      // 详情字段兼容：content / body / text 都可能出现
      const body = d?.content ?? d?.body ?? d?.text ?? ''
      postView.value = { title: d?.title || a.title || '文章', content: body, id: a.id }
    } catch (e: any) {
      postView.value = { title: a.title || '文章', content: `正文加载失败：${e.message}`, id: a.id }
    } finally { postLoading.value = false }
    return
  }
  postView.value = a
}
function closePost() { postView.value = null }

/** 消息内按钮点击 → /v1/msg/button-report 回报（审计补齐死路径） */
async function onMsgButton(el: any) {
  const m = props.msg
  if (!m) return
  try {
    await ctx.api.buttonReport({
      chatId: m.chatId, chatType: m.chatType || ctx.chat?.state?.current?.type || 1,
      msgId: m.id, buttonId: el.attrs.id || '', value: el.attrs.value || el.attrs.text || '',
    })
  } catch { /* 回报失败不打断用户 */ }
}

/**
 * 保存文件：下载到用户文件目录（默认 文档/yhchat/file，关于页可自定义）
 * 并在系统资源管理器中定位选中。WebView2/Electron 里 <a download> 跨域不生效，
 * 统一走 server 端下载，行为在所有壳里一致。
 */
async function saveFile(el: any) {
  const url = mediaUrl(el.attrs.src, 'file')
  const name = el.attrs.name || url.split('/').pop() || '文件'
  try {
    ctx.ui?.toast?.('保存中…', 'info')
    const r = await fetch('/local-open', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, name }),
    })
    const j = await r.json().catch(() => null)
    if (!j?.ok) throw new Error(j?.msg || ('HTTP ' + r.status))
    ctx.ui?.toast?.('已保存并在资源管理器中打开', 'success')
  } catch (e: any) {
    ctx.ui?.toast?.('保存失败：' + e.message, 'error')
  }
}

async function fix() { await nextTick(); postProcess(body.value) }
onMounted(fix)
watch(() => props.elements, fix, { deep: true })
</script>

<template>
  <!-- 插件注册的自定义渲染器优先 -->
  <component v-if="custom" :is="custom.render"
             :msg="msg" :elements="elements" :quote="quote"
             v-bind="custom.props || {}" />

  <div v-else ref="body" class="els" @click="onHtmlClick">
    <!-- 引用块：点一下回到被引用的消息 -->
    <div v-if="quote" class="quote" :class="{ clickable: !!quote.id }" title="点击回到被引用的消息"
         @click.stop="quote.id && emit('quote-jump', quote.id)">
      <span class="q-bar"></span>
      <span class="q-name">{{ quote.sender }}</span>
      <span class="q-text">{{ quote.preview }}</span>
    </div>

    <template v-for="(el, i) in list" :key="i">
      <!-- 文本 / 换行 / 样式 -->
      <span v-if="el.type === 'text'" v-html="linkify(el.attrs.content)"></span>
      <br v-else-if="el.type === 'br'" />
      <b v-else-if="el.type === 'b'"><MessageElements :elements="el.children" /></b>
      <i v-else-if="el.type === 'i'"><MessageElements :elements="el.children" /></i>
      <code v-else-if="el.type === 'code'">{{ el.attrs.content }}</code>
      <pre v-else-if="el.type === 'pre'" class="pre">{{ el.attrs.content }}</pre>

      <!-- 提及 / 链接 -->
      <span v-else-if="el.type === 'at'" class="at">@{{ el.attrs.name || el.attrs.id }}</span>
      <a v-else-if="el.type === 'a'" :href="el.attrs.href" target="_blank" rel="noreferrer">
        <MessageElements :elements="el.children" />
      </a>

      <!-- 富文本 -->
      <div v-else-if="el.type === 'markdown'" class="rich" v-html="mdHtml(el)"></div>
      <div v-else-if="el.type === 'html'" class="rich" v-html="htmlHtml(el)"></div>

      <!-- 媒体 -->
      <!-- 图片：带上宽高能提前占位，避免加载时跳动；点击可看原图 -->
      <img v-else-if="el.type === 'img'" class="media" :src="resUrl(el.attrs.src)" loading="lazy"
           :style="ratioOf(el)" alt="[图片]" @click="openRaw(el.attrs.src)"
           @error="(e: any) => (e.target.style.display = 'none')" />
      <img v-else-if="el.type === 'sticker'" class="sticker" :src="resUrl(el.attrs.src)" loading="lazy" alt="[表情]"
           title="点击查看所属合集" style="cursor:pointer" @click.stop="openStickerPack(el)" />
      <div v-else-if="el.type === 'video'" class="video-wrap">
        <video class="media" :src="mediaUrl(el.attrs.src, 'video')" controls preload="metadata" @click="openVideo(el.attrs.src)"></video>
        <span v-if="el.attrs.time" class="vtime">{{ el.attrs.time }}s</span>
      </div>
      <audio v-else-if="el.type === 'audio'" :src="mediaUrl(el.attrs.src, 'audio')" controls preload="metadata" />

      <!-- 文件（链接 + 保存按钮同属一个条件分支：⚠️ 必须用 template 包裹，
           中间插 v-if 会截断 v-else-if 链，导致每条消息多渲染一个兜底 pre） -->
      <template v-else-if="el.type === 'file'">
        <a class="file" :href="mediaUrl(el.attrs.src, 'file')" target="_blank" rel="noreferrer"
           :download="el.attrs.name || undefined">
          <span class="fico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/></svg></span>
          <span class="fmeta">
            <b>{{ el.attrs.name || '文件' }}</b>
            <small v-if="el.attrs.size">{{ (el.attrs.size / 1024).toFixed(1) }} KB</small>
          </span>
        </a>
        <button class="file-save" title="保存到本地文件目录" @click.stop="saveFile(el)">
          <Icon name="download" :size="14" /> 保存
        </button>
      </template>

      <!-- 云湖扩展 -->
      <button v-else-if="el.type === 'button'" class="msg-btn"
              @click="onMsgButton(el)">{{ el.attrs.text || el.attrs.content || '按钮' }}</button>
      <span v-else-if="el.type === 'tip'" class="tip">{{ el.attrs.content }}</span>
      <span v-else-if="el.type === 'call'" class="tip">📞 {{ el.attrs.content || '语音通话' }}</span>
      <!-- 文章卡片：点击在页内打开正文（之前是死链接 @click.prevent 无处理 → 「点不开」） -->
      <button v-else-if="el.type === 'post'" class="post" @click.stop="openPost(el)">
        <b>{{ el.attrs.title || '文章' }}</b>
        <small v-if="el.attrs.content">{{ String(el.attrs.content).slice(0, 80) }}</small>
      </button>

      <!-- A2UI：组件流 / HTML / markdown 文本 -->
      <template v-else-if="el.type === 'a2ui'">
        <template v-if="a2uiOf(el)?.kind === 'a2ui'">
          <div class="a2ui">
            <div v-for="s in (a2uiOf(el) as any).surfaces" :key="s.id" class="a2ui-surface">
              <A2uiNode :id="s.root" :surface="s" @action="a => emit('a2ui-action', a)" />
            </div>
          </div>
          <div v-if="(a2uiOf(el) as any).rest" class="rich" v-html="renderMarkdown((a2uiOf(el) as any).rest)"></div>
        </template>
        <div v-else-if="a2uiOf(el)?.kind === 'html'" class="rich" v-html="sanitizeHtml((a2uiOf(el) as any).html)"></div>
        <div v-else class="rich" v-html="renderMarkdown((a2uiOf(el) as any)?.text || '')"></div>
      </template>

      <div v-else-if="el.type === 'form'" class="form">
        <template v-if="formFields(el)">
          <label v-for="(f, j) in formFields(el)" :key="j" class="ffield">
            <span class="flabel">{{ f.title || f.propsValue?.label || f.id }}</span>
            <input v-if="f.type === 'input'" :placeholder="f.propsValue?.placeholder || ''" disabled />
            <textarea v-else-if="f.type === 'textarea'" :placeholder="f.propsValue?.placeholder || ''" disabled></textarea>
            <select v-else-if="f.type === 'select' || f.type === 'radio'" disabled>
              <option v-for="(o, k) in String(f.propsValue?.options || '').split('#')" :key="k">{{ o }}</option>
            </select>
            <span v-else class="flabel">{{ f.propsValue?.defaultValue || f.type }}</span>
          </label>
        </template>
        <pre v-else class="pre">{{ el.attrs.data }}</pre>
      </div>

      <pre v-else class="pre">{{ el.attrs.content || ('[未支持的元素 ' + el.type + ']') }}</pre>
    </template>
  </div>

  <!-- 图片/视频灯箱：点空白收起；图片滚轮缩放+拖拽平移；视频可应用内全屏 -->
  <Teleport to="body">
    <div v-if="viewer" class="viewer-mask" :class="{ 'video-full': videoFull }" @click.self="closeViewer" @wheel.prevent="onWheel">
      <img v-if="viewer.kind === 'image'" :src="viewer.url" alt=""
           :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"
           class="viewer-img" @click.self="closeViewer"
           @mousedown.prevent="startPan" @dblclick="zoom = zoom > 1 ? 1 : 2" />
      <video v-else ref="viewerVideo" :src="viewer.url" controls autoplay @click.self="closeViewer"></video>
      <div class="viewer-bar">
        <template v-if="viewer.kind === 'image'">
          <button class="viewer-ctl" title="缩小" @click="zoom = Math.max(0.2, zoom / 1.25)">−</button>
          <span class="viewer-zoom">{{ Math.round(zoom * 100) }}%</span>
          <button class="viewer-ctl" title="放大" @click="zoom = Math.min(8, zoom * 1.25)">＋</button>
          <button class="viewer-ctl" title="还原" @click="zoom = 1; pan = { x: 0, y: 0 }">1:1</button>
        </template>
        <template v-else>
          <!-- 全屏：CSS 伪全屏铺满灯箱（WebView2 里 Fullscreen API 常被拒），再试原生全屏作增强 -->
          <button class="viewer-ctl" :title="videoFull ? '退出全屏' : '全屏播放'" @click="toggleVideoFull">
            {{ videoFull ? '退出' : '全屏' }}
          </button>
        </template>
        <span class="grow"></span>
        <button class="viewer-ctl" title="关闭" @click="closeViewer">×</button>
      </div>
    </div>
    <!-- 文章弹窗：标题 + 净化渲染正文，右上 × 关闭 -->
    <div v-if="postView" class="post-mask" @click.self="closePost">
      <div class="post-box">
        <div class="post-head">
          <b>{{ postView.title || '文章' }}</b>
          <button class="post-x" title="关闭" @click="closePost">×</button>
        </div>
        <div ref="postBody" class="post-body rich" v-html="renderRich(postView.content || '')"></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.els { display: block; }
.els > * { vertical-align: bottom; }

.quote {
  display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px;
  padding: 4px 8px; border-radius: 6px; font-size: 12px;
  background: rgba(127, 127, 127, .16); max-width: 100%;
}
.q-bar { width: 3px; align-self: stretch; border-radius: 2px; background: var(--acc); flex: 0 0 3px; }
.q-name { color: var(--acc); flex: 0 0 auto; }
.q-text { color: var(--fg2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quote.clickable { cursor: pointer; }
.quote.clickable:hover { background: var(--acc-soft); }

.at { color: var(--acc); background: var(--acc-soft); border-radius: 5px; padding: 0 4px; }
.rich :deep(p) { margin: 4px 0; }
.rich :deep(a) { color: var(--acc); }
.rich :deep(code) { background: rgba(127, 127, 127, .18); padding: 1px 4px; border-radius: 4px; font-size: 12px; }
.rich :deep(pre) { background: rgba(0, 0, 0, .25); padding: 8px; border-radius: 8px; overflow-x: auto; }
.rich :deep(img) { max-width: 100%; border-radius: 8px; }
.rich :deep(blockquote) { margin: 4px 0; padding-left: 8px; border-left: 3px solid var(--line); opacity: .85; }
.media { max-width: min(320px, 100%); max-height: 460px; border-radius: 10px; display: block; object-fit: contain; cursor: zoom-in; background: var(--card2); }
/* 文件气泡旁的保存按钮 */
.file-save {
  align-self: center; margin-left: 6px; padding: 4px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--card2); color: var(--fg2);
  font-size: 12px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;
}
.file-save:hover { color: var(--acc); border-color: var(--acc); }
/* markdown 消息行距收紧（用户反馈空太大） */
.rich :deep(p) { margin: 2px 0; }
.rich :deep(h1), .rich :deep(h2), .rich :deep(h3) { margin: 4px 0 2px; }
.rich :deep(ul), .rich :deep(ol) { margin: 2px 0; padding-left: 20px; }
.rich :deep(pre) { margin: 4px 0; }
.rich :deep(blockquote) { margin: 4px 0; }
/* 灯箱（Teleport 到 body，scoped 样式需 :deep 或直接写全局类） */
.viewer-mask {
  position: fixed; inset: 0; z-index: 92; background: rgba(0, 0, 0, .82);
  display: grid; place-items: center; cursor: zoom-out; backdrop-filter: blur(3px);
  overflow: hidden;
}
.viewer-img { transition: transform .08s linear; cursor: grab; }
.viewer-mask img, .viewer-mask video {
  max-width: 92vw; max-height: 86vh; border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .6);
}
.viewer-bar {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; padding: 6px 12px;
  background: rgba(20, 20, 24, .8); border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 999px; backdrop-filter: blur(8px);
}
.viewer-bar .grow { flex: 1; }
.viewer-ctl {
  min-width: 30px; height: 30px; padding: 0 8px; border-radius: 50%; border: none;
  background: rgba(255, 255, 255, .12); color: #fff; font-size: 15px; line-height: 1;
  display: inline-grid; place-items: center; cursor: pointer;
}
.viewer-ctl:hover { background: rgba(255, 255, 255, .24); }
.viewer-zoom { color: rgba(255, 255, 255, .8); font-size: 12px; min-width: 42px; text-align: center; }
/* 视频伪全屏：铺满灯箱（不依赖 Fullscreen API） */
.viewer-mask.video-full video {
  position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none;
  border-radius: 0; z-index: 93; background: #000; object-fit: contain;
}
.viewer-mask.video-full .viewer-bar { z-index: 94; }
.sticker { max-width: 96px; max-height: 96px; display: block; object-fit: contain; }
.video-wrap { display: inline-flex; flex-direction: column; gap: 3px; }
.vtime { font-size: 11px; color: var(--fg2); }
.pre { font-size: 12px; white-space: pre-wrap; margin: 0; }
.file { display: flex; gap: 8px; align-items: center; text-decoration: none; color: inherit; }
.fico { font-size: 22px; }
.fmeta { display: flex; flex-direction: column; }
.fmeta small { color: var(--fg2); }
.post { display: flex; flex-direction: column; text-decoration: none; color: inherit; }
.post small { color: var(--fg2); }
.form { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
.ffield { display: flex; flex-direction: column; gap: 3px; }
.flabel { font-size: 12px; color: var(--fg2); }
.a2ui { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
.a2ui-surface { display: flex; flex-direction: column; gap: 6px; }
.tip { opacity: .85; }
</style>

/* 文章弹窗 */
.post-mask {
  position: fixed; inset: 0; z-index: 93; background: rgba(0, 0, 0, .5);
  display: grid; place-items: center; backdrop-filter: blur(4px);
}
.post-box {
  width: min(680px, 92vw); max-height: 84vh; display: flex; flex-direction: column;
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .45); overflow: hidden;
}
.post-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 15px;
}
.post-x {
  width: 26px; height: 26px; border-radius: 7px; border: none; background: none;
  color: var(--fg2); font-size: 17px; line-height: 1; cursor: pointer;
}
.post-x:hover { background: var(--card2); color: var(--fg); }
.post-body { padding: 16px 18px; overflow: auto; font-size: 13.5px; line-height: 1.75; }
