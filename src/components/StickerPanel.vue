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

/** 外来表情包里的表情：右键直接加进个人收藏（url 已是云端地址，直接 expression/create） */
async function favFromPack(e: any) {
  const u = e.urlOriginal || e.url || ''
  if (!u) { ctx.ui?.toast?.('这张表情没有可用地址', 'warn'); return }
  const full = /^https?:\/\//i.test(u) ? u : `https://chat-img.jwznb.com/${String(u).replace(/^\/+/, '')}`
  await st.addFromUrl?.(full)
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
        <button class="sp-x" @click="st.close()">×</button>
      </header>

      <!-- 页签：收藏 + 各表情包组（QQ 式表情面板分组） -->
      <div class="sp-tabs">
        <button class="sp-tab" :class="{ on: tab === 'fav' }" @click="pickTab('fav')">收藏</button>
        <button v-for="p in s.packs" :key="p.id" class="sp-tab" :class="{ on: tab === p.id }" @click="pickTab(p.id)">
          {{ p.name }} <em>{{ p.items?.length || 0 }}</em>
        </button>
        <span v-if="s.packsLoading" class="dim small">加载表情包…</span>
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
            <button v-for="e in packItems" :key="e.id" class="cell" :title="'点击发送 · 右键添加到收藏'"
                    @click="st.send(e)" @contextmenu.prevent="favFromPack(e)">
              <img :src="src(e)" loading="lazy" alt=""
                   @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
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
