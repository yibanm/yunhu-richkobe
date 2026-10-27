<script setup lang="ts">
/**
 * 表情面板（输入区「表情」按钮唤起，走 chat 的 global 插槽）。
 *
 * 数据：/v1/expression/list（个人收藏）。
 * 发送：把选中项包成 h.sticker(...) 走 chat.sendMedia（content_type=7）。
 * 过滤：url 为空或 CDN 上已不存在的 .tmp 条目直接不显示（否则一片裂图）。
 * 收藏/置顶/删除：expression/create、expression/topping、expression/delete。
 */
import { inject, computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { resUrl } from '../core/res'
import Icon from '../console/components/Icon.vue'

const ctx = inject<any>('ctx')
const st = ctx.stickers
const s = st.state
const favAsk = ref<any>(null)
let favMenuTimer: ReturnType<typeof setTimeout> | undefined
const renaming = ref<{ id: number; name: string } | null>(null)

/** 页签：收藏 / 各表情包组（之前面板只渲染收藏，表情包组识别不到 —— 补上） */
const normalizeTab = (t: any): 'fav' | number => t === 'fav' ? 'fav' : Number(t)
const tab = ref<'fav' | number>(normalizeTab(s.activeTab || 'fav'))
const packKeyword = ref('')
const filteredPacks = computed(() => (s.packs || []).filter((p: any) =>
  matches(packKeyword.value, p.name, p.id)))
function pickTab(t: 'fav' | number) {
  tab.value = normalizeTab(t)
  s.activeTab = tab.value
  s.keyword = ''
  closeFavMenu()
  renaming.value = null
  st.closeBrowse()
  s.locateSticker = null          // 手动切页签即取消圈线定位
  if (t !== 'fav' && !s.packs.length) st.loadPacks?.()
}
// 外部定位（聊天里点表情 → openPackOf 设 activeTab）
watch(() => s.activeTab, (value) => {
  const t = normalizeTab(value)
  if (t !== tab.value) {
    tab.value = t
    s.keyword = ''
    packKeyword.value = ''
    closeFavMenu()
    renaming.value = null
    if (t !== 'fav' && !s.packs.length && !s.packsLoading) st.loadPacks?.()
  }
})
// 打开面板时顺带拉一次表情包组
watch(() => s.panelOpen, (v) => { if (v && !s.packs.length && !s.packsLoading) st.loadPacks?.() }, { immediate: true })

function matches(keyword: string, ...values: any[]): boolean {
  const normalize = (value: any) => String(value ?? '').normalize('NFKC').toLowerCase()
  const q = normalize(keyword).trim()
  return !q || values.some(value => normalize(value).includes(q))
}
function filterItems(items: any[]) {
  return items.filter(e => matches(s.keyword, nameOf(e), e.id, e.itemId))
}

const list = computed(() => {
  // 过滤掉 url 为空的、以及 CDN 上已不存在的 .tmp 条目
  return (s.list || []).filter((e: any) => {
    const u = String(e.urlOriginal || e.url || '')
    return u && !u.endsWith('.tmp')
  })
})

/** 当前页签的表情包组内容 */
const packItems = computed(() => {
  if (tab.value === 'fav') return []
  // ⚠️ 包 id 可能是字符串、activeTab 可能是数字：双侧强转再比，否则合集页签空
  const p = (s.packs || []).find((x: any) => Number(x.id) === Number(tab.value))
  return (p?.items || []).filter((e: any) => e.urlOriginal || e.url)
})
const curPack = computed(() => (s.packs || []).find((x: any) => Number(x.id) === Number(tab.value)) || null)
const visibleFavs = computed(() => filterItems(list.value))
const visiblePackItems = computed(() => filterItems(packItems.value))
const browseItems = computed(() => filterItems(s.browsePack?.items || []))
const currentTitle = computed(() => s.browsePack?.name || (tab.value === 'fav' ? '收藏' : curPack.value?.name || `表情包 ${tab.value}`))
const currentTotal = computed(() => s.browsePack ? s.browsePack.items.length : tab.value === 'fav' ? list.value.length : packItems.value.length)
const visibleCount = computed(() => s.browsePack ? browseItems.value.length : tab.value === 'fav' ? visibleFavs.value.length : visiblePackItems.value.length)

async function refresh() {
  await Promise.all([st.load(), st.loadPacks()])
  if (s.browsePack) await st.openPackOf({ packId: s.browsePack.id, itemId: s.browsePack.locateId })
}

/** 是否是「聊天里点进来的」要圈线高亮的那一张。
 *  收藏页签按 expression id 比，合集页签按包内贴纸 itemId 比。 */
function isLocated(e: any): boolean {
  const loc = s.locateSticker
  if (!loc || normalizeTab(loc.tab) !== tab.value) return false
  const id = Number(tab.value === 'fav' ? e.id : (e.id || e.itemId))
  return !!id && id === loc.id
}
/** 定位到目标表情并滚到可视区（圈线 + 居中） */
const bodyEl = ref<HTMLElement | null>(null)
const packListEl = ref<HTMLElement | null>(null)
function scrollLocateIntoView() {
  nextTick(() => {
    const body = bodyEl.value
    const hit = body?.querySelector('.cell.located') as HTMLElement | null
    if (!body || !hit) return
    // 只滚动图片区，不能把整个弹层或聊天记录一起滚走。
    const top = hit.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop
    body.scrollTo({ top: Math.max(0, top - (body.clientHeight - hit.offsetHeight) / 2), behavior: 'auto' })
  })
}
// activeTab / locateSticker 变化（外部定位）后，等渲染完滚动到那张
watch(() => [s.locateSticker, s.browsePack?.locateId], () => {
  if (s.locateSticker || s.browsePack?.locateId) { s.keyword = ''; packKeyword.value = '' }
}, { flush: 'sync' })
watch(() => [tab.value, s.locateSticker, s.browsePack, s.packs, s.list, s.panelOpen, s.keyword], () => {
  if (!s.panelOpen) return
  if (s.locateSticker || s.browsePack?.locateId) scrollLocateIntoView()
  else nextTick(() => bodyEl.value?.scrollTo({ top: 0 }))
}, { flush: 'post' })
watch(() => [tab.value, s.packs, s.panelOpen], () => {
  if (!s.panelOpen) return
  nextTick(() => {
    const nav = packListEl.value
    const selected = nav?.querySelector('[aria-current="true"]') as HTMLElement | null
    if (!nav || !selected) return
    const delta = selected.getBoundingClientRect().top - nav.getBoundingClientRect().top
    if (delta < 0) nav.scrollTop += delta
    else if (delta + selected.offsetHeight > nav.clientHeight) nav.scrollTop += delta + selected.offsetHeight - nav.clientHeight
  })
}, { flush: 'post' })

/** 收藏里的 url 是相对 key（expression/xxx.jpg），要补域名 */
function src(e: any) {
  const u = e.urlOriginal || e.url || ''
  return resUrl(u)
}

/** 上传到「当前选中的页签」：收藏 or 某个表情包组 */
async function onPickUpload(e: any) {
  const fs: File[] = Array.from(e.target?.files || [])
  e.target.value = ''
  if (s.browsePack) return ctx.ui?.toast?.('请先收藏该合集，再上传图片', 'warn')
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
    if (!s.browsePack) st.addFileToTarget(f, tab.value)
  }
  if (took) {
    e.preventDefault()
    if (s.browsePack) ctx.ui?.toast?.('请先收藏该合集，再粘贴图片', 'warn')
  }
}
watch(() => s.panelOpen, (v) => {
  if (v) document.addEventListener('paste', onPaste)
  else { document.removeEventListener('paste', onPaste); closeFavMenu() }
}, { immediate: true })
onUnmounted(() => { document.removeEventListener('paste', onPaste); closeFavMenu() })

/** 表情显示名：完整文件名（含后缀），截断交给 CSS 省略号 */
function nameOf(e: any): string {
  if (e.name) return e.name
  const u = String(e.urlOriginal || e.url || '')
  return u.split('/').pop() || String(e.id)
}

/** 收藏项重命名：云端无 expression rename 接口，如实提示 */
async function renameFav(e: any) {
  favAsk.value = null
  ctx.ui?.toast?.('个人收藏不支持改名（云端无接口）；表情包内贴纸可改名', 'warn')
}
function closeFavMenu() {
  clearTimeout(favMenuTimer)
  document.removeEventListener('click', closeFavMenu)
  favAsk.value = null
}
function askFav(e: any, ev: MouseEvent) {
  closeFavMenu()
  favAsk.value = e
  // 点面板其它地方收起
  favMenuTimer = setTimeout(() => {
    document.addEventListener('click', closeFavMenu)
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
async function addPackById(id: number) {
  try {
    await ctx.api.stickerAddPack(id)
    ctx.ui?.toast?.('合集已添加', 'success')
    st.suggestPack.id = 0
    await st.loadPacks()
    pickTab(id)
  } catch (e: any) { ctx.ui?.toast?.('添加失败：' + e.message, 'error') }
}
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
    <div class="sp" role="dialog" aria-label="表情面板">
      <header>
        <b>表情</b>
        <div class="sp-header-actions">
          <label class="ghost small file" :class="{ disabled: !!s.browsePack }"
                 :title="s.browsePack ? '请先收藏该合集，再上传图片' : '上传图片到当前分类'">
            <input type="file" accept="image/*" multiple hidden :disabled="!!s.browsePack" @change="onPickUpload" />上传到当前栏
          </label>
          <button class="ghost small" :disabled="s.loading || s.packsLoading" @click="refresh">刷新</button>
          <button class="ghost small" :class="{ on: addPackOpen }" @click="addPackOpen = !addPackOpen">收藏合集</button>
          <button class="ghost small" :class="{ on: qrEnabled }" title="在面板底部显示快捷回复条"
                  @click="qr?.toggle?.()">快捷回复</button>
        </div>
        <button class="sp-x" aria-label="关闭表情面板" @click="st.close()">×</button>
      </header>

      <div class="sp-workspace">
        <nav class="sp-nav" aria-label="表情包分类">
          <div class="sp-nav-title"><span>我的表情包</span><span>{{ s.packs.length }}</span></div>
          <input v-model="packKeyword" class="sp-pack-search" type="search" placeholder="搜索表情包名称 / ID" aria-label="搜索表情包" />
          <select class="sp-mobile-select" :value="tab" aria-label="选择表情分类"
                  @change="pickTab(normalizeTab(($event.target as HTMLSelectElement).value))">
            <option value="fav">收藏（{{ list.length }}）</option>
            <option v-for="p in filteredPacks" :key="p.id" :value="p.id">{{ p.name }}（{{ p.items?.length || 0 }}）</option>
          </select>
          <button class="sp-pack sp-fav" :class="{ on: tab === 'fav' && !s.browsePack }"
                  :aria-current="tab === 'fav' && !s.browsePack ? 'true' : undefined" @click="pickTab('fav')">
            <Icon name="star" :size="16" /><span class="sp-pack-name">收藏</span><em>{{ list.length }}</em>
          </button>
          <div class="sp-pack-list" ref="packListEl">
            <button v-for="p in filteredPacks" :key="p.id" class="sp-pack"
                    :class="{ on: tab === Number(p.id) && !s.browsePack }"
                    :aria-current="tab === Number(p.id) && !s.browsePack ? 'true' : undefined"
                    :title="`${p.name} · ${p.items?.length || 0} 张 · ID ${p.id}`" @click="pickTab(p.id)">
              <span class="sp-pack-name">{{ p.name }}</span><em>{{ p.items?.length || 0 }}</em>
            </button>
            <p v-if="!filteredPacks.length" class="sp-nav-empty dim small">
              {{ s.packsLoading ? '加载表情包…' : packKeyword.trim() ? '没有匹配的表情包' : '还没有收藏合集' }}
            </p>
          </div>
        </nav>

        <section class="sp-content" aria-label="当前分类">
          <div class="sp-content-head">
            <div class="sp-current">
              <strong :title="currentTitle">{{ currentTitle }}</strong>
              <span class="dim small">{{ s.keyword.trim() ? `${visibleCount} / ${currentTotal}` : currentTotal }} 张{{ s.browsePack ? ' · 未收藏' : '' }}</span>
            </div>
            <input v-model="s.keyword" type="search" placeholder="搜索表情名称 / ID" aria-label="搜索当前表情" />
          </div>
          <div v-if="s.browsePack" class="sp-addrow">
            <button class="ghost tiny" @click="addPackById(s.browsePack.id)">添加该合集</button>
            <button class="ghost tiny" @click="st.closeBrowse()">返回我的表情</button>
          </div>
          <div v-else-if="st.suggestPack?.id" class="sp-addrow">
            <span class="dim small">{{ st.suggestPack.name }}未收藏</span>
            <button class="ghost tiny" @click="addPackById(st.suggestPack.id)">添加该合集</button>
            <button class="ghost tiny" @click="st.suggestPack.id = 0">忽略</button>
          </div>
          <div v-if="addPackOpen" class="sp-addrow">
            <input v-model="addPackId" placeholder="表情包 ID" aria-label="要收藏的表情包 ID" inputmode="numeric" @keyup.enter="addPack" />
            <button class="ghost tiny" :disabled="!addPackId.trim()" @click="addPack">收藏</button>
            <button class="ghost tiny" @click="addPackOpen = false">取消</button>
          </div>
          <div v-if="renaming" class="sp-addrow">
            <input v-model="renaming.name" aria-label="表情名称" @keyup.enter="renameStickerOk" @keyup.esc="renaming = null" autofocus />
            <button class="ghost tiny" @click="renameStickerOk">保存</button>
            <button class="ghost tiny" @click="renaming = null">取消</button>
          </div>

          <div class="sp-body" ref="bodyEl" role="region" aria-label="表情列表" tabindex="0">
            <div class="grid">
              <template v-if="s.browsePack">
                <button v-for="e in browseItems" :key="e.id" class="cell"
                        :class="{ located: Number(e.id) === Number(s.browsePack.locateId) }"
                        :title="nameOf(e) + ' · 点击发送'" @click="st.send(e)">
                  <img :src="src(e)" alt="" loading="lazy" decoding="async"
                       @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
                  <span class="cell-name" :title="nameOf(e)">{{ nameOf(e) }}</span>
                </button>
              </template>
              <template v-else-if="tab === 'fav'">
                <button v-for="e in visibleFavs" :key="e.id" class="cell" :class="{ located: isLocated(e) }" :title="nameOf(e) + ' · 点击发送 · 右键更多'"
                        @click="st.send(e)" @contextmenu.prevent="askFav(e, $event)">
                  <img :src="src(e)" alt="" loading="lazy" decoding="async"
                       @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
                  <span class="cell-name" :title="nameOf(e)">{{ nameOf(e) }}</span>
                  <span class="top" @click.stop="st.topping(e)" title="置顶">↑</span>
                  <span class="del" @click.stop="st.remove(e)" title="从收藏删除">×</span>
                  <span v-if="favAsk?.id === e.id" class="fav-ask menu" @click.stop>
                    <button @click.stop="renameFav(e)">重命名</button>
                  </span>
                </button>
              </template>
              <template v-else>
                <button v-for="e in visiblePackItems" :key="e.id" class="cell" :class="{ located: isLocated(e) }" :title="nameOf(e) + ' · 点击发送 · 右键更多'"
                        @click="st.send(e)" @contextmenu.prevent="askFav(e, $event)">
                  <img :src="src(e)" alt="" loading="lazy" decoding="async"
                       @error="(ev: any) => { ev.target.style.visibility = 'hidden' }" />
                  <span class="cell-name" :title="nameOf(e)">{{ nameOf(e) }}</span>
                  <span v-if="favAsk?.id === e.id" class="fav-ask menu" @click.stop>
                    <button @click.stop="doFav(e)"><Icon name="star" :size="12" /> 收藏</button>
                    <button @click.stop="renameSticker(e)">重命名</button>
                  </span>
                  <span class="cell-acts">
                    <span class="ca" title="重命名" @click.stop="renameSticker(e)">✎</span>
                    <span class="ca del" title="从包中删除" @click.stop="removeSticker(e)">×</span>
                  </span>
                </button>
              </template>
            </div>
            <p v-if="!visibleCount" class="dim center">
              {{ s.keyword.trim() ? '没有匹配的表情，试试名称或 ID。' : (s.loading || s.packsLoading) ? '加载中…' : s.browsePack ? '这个合集是空的或已被删除' : '当前分类还没有表情，可上传图片或 Ctrl+V 粘贴加入。' }}
            </p>
          </div>
        </section>
      </div>

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
.sp { width: 960px; max-width: calc(100vw - 24px); height: min(680px, 82vh); height: min(680px, 82dvh); min-height: 0; display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 14px 14px 0 0; box-shadow: var(--shadow); overflow: hidden; }
.sp > header { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.sp > header > b, .sp-x { flex: 0 0 auto; }
.sp-header-actions { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; overflow-x: auto; }
.sp-header-actions > * { flex: 0 0 auto; white-space: nowrap; }
.sp-x { background: transparent; color: var(--fg2); font-size: 20px; padding: 0 8px; line-height: 1; }
/* 所有中间层允许收缩；列表和图片区分别消化自己的溢出。 */
.sp-workspace { flex: 1 1 0; min-height: 0; min-width: 0; display: grid; grid-template-columns: 208px minmax(0, 1fr); overflow: hidden; }
.sp-nav { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 8px 8px; border-right: 1px solid var(--line); background: var(--card2); }
.sp-nav-title { display: flex; justify-content: space-between; padding: 0 6px; color: var(--fg2); font-size: 12px; }
.sp-pack-search { width: 100%; min-width: 0; padding: 7px 9px; font-size: 12px; }
.sp-nav-title, .sp-pack-search, .sp-fav { flex: 0 0 auto; }
.sp-pack-list { flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 4px; }
.sp-pack { flex: 0 0 auto; min-width: 0; width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--fg2); text-align: left; font-size: 12.5px; font-weight: 400; }
.sp-pack:hover { color: var(--fg); background: var(--card); }
.sp-pack.on { color: var(--acc); background: var(--acc-soft); border-color: var(--acc); font-weight: 600; }
.sp-pack-name { flex: 1; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; line-height: 1.5; }
.sp-pack em { flex: 0 0 auto; font-style: normal; font-size: 11px; font-variant-numeric: tabular-nums; }
.sp-nav-empty { padding: 8px; margin: 0; }
.sp-mobile-select { display: none; }
.sp-content { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.sp-content-head { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.sp-current { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.sp-current strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.4; font-size: 13px; }
.sp-content-head input { flex: 0 1 190px; width: 36%; min-width: 100px; padding: 7px 9px; font-size: 12px; }
.sp-body { flex: 1 1 0; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 12px; }
.sp-addrow { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 6px 12px; }
.sp-addrow > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sp-addrow button { flex: 0 0 auto; }
.sp-addrow input { flex: 1; min-width: 0; background: var(--card2); border: 1px solid var(--line); border-radius: 8px; color: var(--fg); padding: 5px 9px; font-size: 12.5px; }
.sp button:focus-visible, .sp-body:focus-visible { outline: 2px solid var(--acc); outline-offset: -2px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(82px, 1fr)); gap: 8px; }
.cell { position: relative; display: flex; flex-direction: column; min-width: 0; aspect-ratio: 1; border: 1px solid var(--line); border-radius: 9px; background: var(--card2); padding: 4px; cursor: pointer; overflow: hidden; }
.cell:hover { border-color: var(--acc); }
.cell img { flex: 1 1 0; min-height: 0; width: 100%; object-fit: contain; }
.cell-name { display: block; flex: 0 0 auto; width: 100%; font-size: 11px; color: var(--fg2); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 2px 0; }
.cell-acts { position: absolute; top: 2px; left: 2px; display: none; gap: 3px; }
.cell:hover .cell-acts, .cell:focus-within .cell-acts { display: flex; }
.cell-acts .ca { width: 18px; height: 18px; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; font-size: 11px; line-height: 1; display: grid; place-items: center; cursor: pointer; }
.cell-acts .ca.del:hover { background: var(--err); }
.top, .del { position: absolute; top: 2px; font-size: 12px; color: var(--fg2); background: var(--card); border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; line-height: 1; opacity: 0; }
.top { left: 4px; } .del { right: 4px; }
.cell:hover .top, .cell:hover .del, .cell:focus-within .top, .cell:focus-within .del { opacity: .9; }
.top:hover { color: var(--acc); } .del:hover { color: var(--err); }
/* 保留已有聊天表情定位的圈线高亮。 */
.cell.located { border-color: var(--acc); box-shadow: 0 0 0 2px var(--acc), 0 0 12px color-mix(in srgb, var(--acc) 60%, transparent); animation: cell-locate 1.6s ease-in-out infinite; }
@keyframes cell-locate { 0%, 100% { box-shadow: 0 0 0 2px var(--acc), 0 0 8px color-mix(in srgb, var(--acc) 45%, transparent); } 50% { box-shadow: 0 0 0 3px var(--acc), 0 0 16px color-mix(in srgb, var(--acc) 75%, transparent); } }
/* 快捷回复有自己的高度上限，不能再次挤占整个图片区。 */
.sp-qr { flex: 0 0 auto; max-height: min(96px, 16vh); max-height: min(96px, 16dvh); overflow-y: auto; overscroll-behavior: contain; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 12px; border-top: 1px solid var(--line); background: var(--card2); }
.qr-chip { max-width: 100%; overflow-wrap: anywhere; }
.fav-ask.menu { position: absolute; inset: auto; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 6; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 9px; box-shadow: 0 6px 20px rgba(0, 0, 0, .45); min-width: 76px; }
.fav-ask.menu button { display: flex; align-items: center; gap: 5px; white-space: nowrap; padding: 5px 10px; border: none; border-radius: 6px; background: transparent; color: var(--fg); font-size: 12px; font-weight: 400; cursor: pointer; width: 100%; text-align: left; }
.fav-ask.menu button:hover { background: var(--card2); color: var(--acc); }
.file { display: inline-flex; align-items: center; cursor: pointer; padding: 3px 10px; font-size: 12px; border-radius: 7px; border: 1px solid var(--line); }
.file.disabled { opacity: .5; cursor: not-allowed; }
.center { text-align: center; padding: 22px 0; }
@media (max-width: 620px) {
  .sp { max-width: 100vw; height: calc(100vh - 16px); height: calc(100dvh - 16px); }
  .sp > header { gap: 6px; padding: 8px; }
  .sp-workspace { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .sp-nav { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 8px; border-right: 0; border-bottom: 1px solid var(--line); }
  .sp-nav-title, .sp-pack-list, .sp-fav { display: none; }
  .sp-mobile-select { display: block; grid-column: 1; grid-row: 1; width: 100%; min-width: 0; font-size: 12px; padding: 7px; }
  .sp-pack-search { grid-column: 2; grid-row: 1; }
  .sp-content-head { gap: 8px; padding: 8px; }
  .sp-content-head input { flex-basis: 130px; }
  .sp-body { padding: 10px; }
}
@media (prefers-reduced-motion: reduce) { .cell.located { animation: none; } }
</style>
