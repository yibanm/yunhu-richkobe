<script setup lang="ts">
/**
 * 调色盘（QQ 同款入口）：主题色 / 预设 / 自定义底图 的快速面板。
 * 全部走 theme 服务（setAccent / setPreset / setWallpaper），与主题页共用状态。
 */
import { ref } from 'vue'
import { useCtx } from '../core/useCtx'
import { shade } from '../plugins/theme'

const ctx = useCtx()
const theme = ctx.theme
const open = ref(false)
const wallInput = ref<HTMLInputElement | null>(null)

function toggle() { open.value = !open.value }
function close() { open.value = false }

/** 自定义底图：上传到云湖数据床后设为壁纸 */
async function onWall(e: any) {
  const f: File | undefined = e.target?.files?.[0]
  if (e.target) e.target.value = ''
  if (!f) return
  try {
    ctx.ui?.toast('上传底图…', 'info', 1200)
    const { url } = await ctx.api.uploadAndUrl(f, 'image')
    theme.setWallpaper(url)
    ctx.ui?.toast('底图已应用', 'success')
  } catch (err: any) {
    ctx.ui?.toast('底图上传失败：' + err.message, 'error')
  }
}
</script>

<template>
  <div class="palette-wrap">
    <button class="rail-btn" title="调色盘（主题色 / 底图）" @click.stop="toggle">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-2 2c0 1.5 1 2 0 3-.6.6-1.3 1-2 1z" />
        <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
        <circle cx="11" cy="7.5" r="1" fill="currentColor" />
        <circle cx="15.5" cy="9" r="1" fill="currentColor" />
      </svg>
    </button>
    <div v-if="open" class="palette-pop" @click.stop>
      <div class="pp-head">调色盘</div>
      <div class="pp-sec">主题色</div>
      <div class="pp-swatches">
        <button v-for="p in theme.presets" :key="p.id" class="pp-swatch"
                :class="{ on: theme.state.preset === p.id }"
                :title="p.name"
                :style="{ background: `linear-gradient(135deg, ${p.accent}, ${shade(p.accent, -25)})` }"
                @click="theme.setPreset(p.id)"></button>
      </div>
      <label class="pp-custom">
        自定义
        <input type="color" :value="theme.state.accent || theme.current().accent"
               @input="theme.setAccent(($event.target as HTMLInputElement).value)" />
      </label>
      <div class="pp-sec">聊天底图</div>
      <div class="pp-wall">
        <button class="ghost small" @click="wallInput?.click()">上传底图</button>
        <button class="ghost small" :disabled="!theme.state.wallpaper" @click="theme.setWallpaper('')">清除</button>
        <input ref="wallInput" type="file" accept="image/*" hidden @change="onWall" />
      </div>
      <button class="ghost small pp-reset" @click="theme.reset()">恢复默认</button>
      <button class="pp-close" @click="close">×</button>
    </div>
  </div>
</template>

<style scoped>
.palette-wrap { position: relative; }
.palette-pop {
  position: absolute; left: 52px; bottom: 0; z-index: 80; width: 232px;
  background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--elev-3); padding: 12px;
}
.pp-head { font-weight: 600; font-size: 13.5px; margin-bottom: 8px; }
.pp-sec { font-size: 11.5px; color: var(--fg2); margin: 10px 0 6px; text-transform: uppercase; letter-spacing: .5px; }
.pp-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.pp-swatch {
  width: 100%; aspect-ratio: 1; border-radius: 8px; padding: 0; border: 2px solid transparent;
}
.pp-swatch.on { border-color: var(--fg); }
.pp-custom { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--fg2); margin-top: 8px; }
.pp-custom input { width: 40px; height: 26px; padding: 2px; border-radius: 6px; cursor: pointer; }
.pp-wall { display: flex; gap: 8px; }
.pp-reset { width: 100%; margin-top: 10px; }
.pp-close {
  position: absolute; right: 6px; top: 6px; width: 24px; height: 24px; padding: 0;
  background: transparent; color: var(--fg2); font-size: 16px; line-height: 1;
}
</style>
