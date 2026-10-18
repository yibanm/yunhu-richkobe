<script setup lang="ts">
/**
 * ImageEditor —— 发送前图片编辑（裁剪/旋转/翻转）
 * 基于 cropperjs（MIT）。确认后用 getCroppedCanvas 导出新 File 回传父组件。
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import Icon from '../console/components/Icon.vue'

const props = defineProps<{ file: File; url: string }>()
const emit = defineEmits<{
  (e: 'done', f: File): void
  (e: 'close'): void
}>()

const img = ref<HTMLImageElement | null>(null)
let cropper: Cropper | null = null
const busy = ref(false)

onMounted(async () => {
  await nextTick()
  if (!img.value) return
  cropper = new Cropper(img.value, {
    viewMode: 1,
    autoCropArea: 1,
    background: false,
    responsive: true,
  })
})
onUnmounted(() => { cropper?.destroy(); cropper = null })

function rot(d: number) { cropper?.rotate(d) }
function flipX() { const d = cropper?.getData(); cropper?.scaleX(-(d?.scaleX || 1)) }
function flipY() { const d = cropper?.getData(); cropper?.scaleY(-(d?.scaleY || 1)) }
function reset() { cropper?.reset() }

function confirm() {
  if (!cropper || busy.value) return
  busy.value = true
  try {
    cropper.getCroppedCanvas({ maxWidth: 4096, maxHeight: 4096 }).toBlob((b) => {
      busy.value = false
      if (!b) { emit('close'); return }
      const f = new File([b], props.file.name.replace(/\.\w+$/, '') + '_edited.png', { type: 'image/png' })
      emit('done', f)
    }, 'image/png')
  } catch { busy.value = false; emit('close') }
}
</script>

<template>
  <div class="ied-mask" @click.self="emit('close')">
    <div class="ied-box">
      <div class="ied-head">
        <span>编辑图片 · {{ file.name }}</span>
        <button class="ghost tiny" @click="emit('close')">取消</button>
      </div>
      <div class="ied-canvas">
        <img ref="img" :src="url" alt="" />
      </div>
      <div class="ied-bar">
        <button class="ghost tiny" title="左旋 90°" @click="rot(-90)"><Icon name="refresh" :size="15" /> 左旋</button>
        <button class="ghost tiny" title="右旋 90°" @click="rot(90)"><Icon name="refresh" :size="15" /> 右旋</button>
        <button class="ghost tiny" title="水平翻转" @click="flipX">水平翻转</button>
        <button class="ghost tiny" title="垂直翻转" @click="flipY">垂直翻转</button>
        <button class="ghost tiny" title="重置" @click="reset">重置</button>
        <span class="sp"></span>
        <button class="primary tiny" :disabled="busy" @click="confirm">{{ busy ? '导出中…' : '确认' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ied-mask {
  position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, .55);
  display: grid; place-items: center; backdrop-filter: blur(6px);
}
.ied-box {
  width: min(720px, 92vw); max-height: 86vh; display: flex; flex-direction: column;
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .45); overflow: hidden;
}
.ied-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 13px;
}
.ied-canvas { flex: 1; min-height: 300px; max-height: 56vh; background: #111; }
.ied-canvas :deep(img) { display: block; max-width: 100%; }
.ied-bar {
  display: flex; gap: 8px; align-items: center; padding: 10px 14px;
  border-top: 1px solid var(--line); flex-wrap: wrap;
}
.ied-bar .sp { flex: 1; }
.tiny { padding: 3px 10px; font-size: 12px; border-radius: 7px; }
.primary { background: var(--acc); color: #fff; border-color: transparent; }
</style>
