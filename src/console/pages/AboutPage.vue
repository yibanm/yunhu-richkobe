<script setup lang="ts">
/**
 * AboutPage —— 「关于」页（☰ 菜单帮助下方）
 * 项目介绍（同 README 摘要）+ 原仓库/本仓库超链接 + 求 star + 数据目录自定义。
 */
import { inject, ref, onMounted } from 'vue'
import Icon from '../components/Icon.vue'

const ctx = inject<any>('ctx')
const version = ctx.app?.version || '1.0.1'

const UPSTREAM = 'https://github.com/FLY1919/yunhu-vue'
const FORK = 'https://github.com/yibanm/yunhu-richkobe'

/* ---- 数据目录（用户可自定义，文件夹名建议 yhchat） ---- */
const dirState = ref({ dir: '', custom: false, def: '' })
const newDir = ref('')
const dirBusy = ref(false)

onMounted(async () => {
  try {
    const r = await fetch('/data-dir')
    if (r.ok) dirState.value = await r.json()
  } catch { /* 端点不可用（纯静态部署）时不显示该区块 */ }
})

async function saveDir() {
  const d = newDir.value.trim()
  if (!d) return
  dirBusy.value = true
  try {
    const r = await fetch('/data-dir', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dir: d }) })
    const j = await r.json()
    if (j.ok) {
      dirState.value.dir = j.dir
      dirState.value.custom = true
      newDir.value = ''
      ctx.ui?.toast?.('数据目录已改为 ' + j.dir + '（重启后完全生效）', 'success')
    } else ctx.ui?.toast?.('修改失败：' + j.msg, 'error')
  } catch (e: any) { ctx.ui?.toast?.('修改失败：' + e.message, 'error') }
  finally { dirBusy.value = false }
}
async function resetDir() {
  dirBusy.value = true
  try {
    await fetch('/data-dir', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dir: dirState.value.def }) })
    dirState.value.dir = dirState.value.def
    dirState.value.custom = false
    ctx.ui?.toast?.('已恢复默认目录', 'success')
  } finally { dirBusy.value = false }
}
</script>

<template>
  <div class="about-page">
    <div class="ab-card">
      <div class="ab-head">
        <span class="ab-logo">湖</span>
        <div>
          <div class="ab-title">云湖牢大版 <em>v{{ version }}</em></div>
          <div class="ab-sub">云湖第三方客户端 · Vue3 + cordis 插件内核 + Satori 协议</div>
        </div>
      </div>
      <p class="ab-desc">
        本仓库 fork 自上游云湖客户端，在保留其消息内核与接口能力的基础上，
        按 QQ 的交互习惯重排了界面：会话列表、输入区暂存预览、锁屏与手机端解锁、
        主题与壁纸自定义、插件化功能宫格。登录信息与会话缓存保存在你的文档目录，
        换设备不丢现场。仅供学习交流。
      </p>
      <div class="ab-links">
        <a class="ab-link" :href="UPSTREAM" target="_blank" rel="noreferrer">
          <Icon name="link" :size="14" /> 原仓库 FLY1919/yunhu-vue
        </a>
        <a class="ab-link me" :href="FORK" target="_blank" rel="noreferrer">
          <Icon name="star" :size="14" /> 本仓库 yibanm/yunhu-richkobe
        </a>
      </div>
      <p class="ab-star">
        如果这个小客户端帮到了你，去本仓库点个 <b>Star</b> 吧 ⭐ ——
        也欢迎给原仓库一颗星，感谢上游作者的开源。
      </p>
    </div>

    <div v-if="dirState.dir" class="ab-card">
      <div class="ab-sec">数据目录</div>
      <p class="ab-desc small">
        登录信息、会话缓存、锁屏 PIN 保存在：<b>{{ dirState.dir }}</b>
        <em v-if="dirState.custom">（自定义）</em><em v-else>（默认）</em>
      </p>
      <div class="ab-dir-row">
        <input v-model="newDir" class="ab-input" placeholder="自定义目录，如 D:\文档\yhchat" />
        <button class="ab-btn" :disabled="dirBusy || !newDir.trim()" @click="saveDir">保存</button>
        <button v-if="dirState.custom" class="ab-btn ghost" :disabled="dirBusy" @click="resetDir">恢复默认</button>
      </div>
      <p class="ab-hint">建议文件夹名用 yhchat；修改后旧目录里的数据会自动搬过去。</p>
    </div>
  </div>
</template>

<style scoped>
.about-page { padding: 22px; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.ab-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 20px 22px; box-shadow: var(--shadow, none);
}
.ab-head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.ab-logo {
  width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--acc), #8b5cf6); color: #fff; font-weight: 700; font-size: 20px;
}
.ab-title { font-size: 17px; font-weight: 600; }
.ab-title em { font-style: normal; font-size: 12px; color: var(--fg2); margin-left: 6px; }
.ab-sub { font-size: 12px; color: var(--fg2); margin-top: 2px; }
.ab-desc { font-size: 13px; line-height: 1.8; color: var(--fg); }
.ab-desc.small { font-size: 12.5px; }
.ab-links { display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0 8px; }
.ab-link {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px;
  color: var(--fg); background: var(--card2); border: 1px solid var(--line);
  padding: 7px 12px; border-radius: 9px; text-decoration: none;
}
.ab-link:hover { border-color: var(--acc); color: var(--acc); }
.ab-link.me { color: var(--acc); border-color: color-mix(in srgb, var(--acc) 40%, transparent); }
.ab-star { font-size: 12.5px; color: var(--fg2); line-height: 1.7; }
.ab-sec { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.ab-dir-row { display: flex; gap: 8px; margin-top: 10px; }
.ab-input {
  flex: 1; background: var(--card2); border: 1px solid var(--line); border-radius: 9px;
  color: var(--fg); padding: 8px 10px; font-size: 13px; outline: none;
}
.ab-input:focus { border-color: var(--acc); }
.ab-btn {
  padding: 8px 16px; border-radius: 9px; border: none; background: var(--acc);
  color: #fff; font-size: 13px; cursor: pointer;
}
.ab-btn:disabled { opacity: .5; cursor: not-allowed; }
.ab-btn.ghost { background: var(--card2); color: var(--fg); border: 1px solid var(--line); }
.ab-hint { font-size: 11.5px; color: var(--fg2); margin-top: 8px; }
</style>
