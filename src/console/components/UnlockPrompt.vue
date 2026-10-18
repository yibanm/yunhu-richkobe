<script setup lang="ts">
/**
 * UnlockPrompt —— 手机端解锁确认弹窗（QQ 式）
 * 当本机未锁定、且云端中继里出现**别的设备**发来的解锁请求时弹出，
 * 显示设备/平台/发起人/时间，选择「解锁」或「拒绝」，结果回写中继。
 */
import { inject, computed } from 'vue'
import Icon from './Icon.vue'

const ctx = inject<any>('ctx')
const lock = ctx.lock
const ui = ctx.ui

const req = computed(() => lock?.state?.pending || null)

function fmtTs(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

async function answer(ok: boolean) {
  await lock.answerRemote(ok)
  ui?.toast?.(ok ? '已同意解锁' : '已拒绝解锁', ok ? 'success' : 'info')
}
</script>

<template>
  <div v-if="req" class="up-mask">
    <div class="up-box">
      <div class="up-icon"><Icon name="lock" :size="22" /></div>
      <div class="up-title">解锁请求</div>
      <div class="up-body">
        <p><b>{{ req.by || '另一台设备' }}</b> 的桌面端请求解锁</p>
        <p class="up-meta">设备：{{ req.device }} · 平台：{{ req.platform }} · {{ fmtTs(req.ts) }}</p>
      </div>
      <div class="up-row">
        <button class="up-btn deny" @click="answer(false)">拒绝</button>
        <button class="up-btn ok" @click="answer(true)">解锁</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.up-mask {
  position: fixed; inset: 0; z-index: 96; display: grid; place-items: center;
  background: rgba(0, 0, 0, .35); backdrop-filter: blur(3px);
}
.up-box {
  width: min(320px, 90vw); background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; box-shadow: 0 18px 50px rgba(0, 0, 0, .5);
  padding: 22px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.up-icon {
  width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center;
  background: var(--acc-soft, var(--card2)); color: var(--acc);
}
.up-title { font-size: 16px; font-weight: 600; }
.up-body { text-align: center; font-size: 13px; color: var(--fg); line-height: 1.7; }
.up-meta { font-size: 11.5px; color: var(--fg2); }
.up-row { display: flex; gap: 10px; width: 100%; margin-top: 6px; }
.up-btn {
  flex: 1; padding: 9px 0; border-radius: 10px; border: none; font-size: 14px; cursor: pointer;
}
.up-btn.deny { background: var(--card2); color: var(--fg); }
.up-btn.deny:hover { background: var(--line); }
.up-btn.ok { background: var(--acc); color: #fff; }
.up-btn.ok:hover { filter: brightness(1.1); }
</style>
