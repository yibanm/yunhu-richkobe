<script setup lang="ts">
/**
 * MorePanel —— 「更多功能」宫格面板（仿 QQ 截图 3）
 * 两区：已添加（常驻 ☰ 菜单的插件页，可收拢回宫格）/ 未添加（宫格内，可设为常驻）。
 * 「管理」进插件页装卸插件。
 */
import { inject } from 'vue'
import Icon from './components/Icon.vue'

const props = defineProps<{ pages: any[]; pinned: any[] }>()
const emit = defineEmits<{
  (e: 'go', path: string): void
  (e: 'manage'): void
  (e: 'pin', path: string): void
  (e: 'close'): void
}>()

const ctx = inject<any>('ctx')
</script>

<template>
  <div class="mp-mask" @click.self="emit('close')">
    <div class="mp-box">
      <div class="mp-head">
        <span class="mp-title">更多功能</span>
        <button class="mp-manage" @click="emit('manage')"><Icon name="settings" :size="14" /> 管理</button>
        <button class="mp-x" title="关闭" @click="emit('close')">×</button>
      </div>

      <div v-if="pinned.length" class="mp-sec">已添加（常驻菜单，点击收拢回宫格）</div>
      <div v-if="pinned.length" class="mp-grid">
        <button v-for="p in pinned" :key="p.path" class="mp-cell on" @click="emit('pin', p.path)" :title="'收拢「' + p.name + '」'">
          <Icon :name="p.icon || 'page'" :size="22" />
          <span>{{ p.name }}</span>
          <em class="mp-tag">常驻中</em>
        </button>
      </div>

      <div class="mp-sec">未添加（点击打开，右键/双击设为常驻）</div>
      <div class="mp-grid">
        <button v-for="p in pages" :key="p.path" class="mp-cell"
                @click="emit('go', p.path)" @dblclick.prevent="emit('pin', p.path)"
                @contextmenu.prevent="emit('pin', p.path)" :title="'「' + p.name + '」：单击打开，右键设为常驻'">
          <Icon :name="p.icon || 'page'" :size="22" />
          <span>{{ p.name }}</span>
        </button>
        <div v-if="!pages.length" class="mp-empty">全部功能都已常驻菜单</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mp-mask {
  position: fixed; inset: 0; z-index: 80; background: rgba(0, 0, 0, .45);
  display: grid; place-items: center; backdrop-filter: blur(4px);
}
.mp-box {
  width: min(560px, 92vw); max-height: 80vh; overflow: auto;
  background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .45); padding: 18px 20px 22px;
}
.mp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.mp-title { font-size: 17px; font-weight: 600; flex: 1; }
.mp-manage {
  display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px;
  color: var(--fg2); background: none; border: none; cursor: pointer; padding: 4px 6px; border-radius: 7px;
}
.mp-manage:hover { background: var(--card2); color: var(--fg); }
.mp-x {
  width: 26px; height: 26px; border-radius: 7px; border: none; background: none;
  color: var(--fg2); font-size: 17px; line-height: 1; cursor: pointer;
}
.mp-x:hover { background: var(--card2); color: var(--fg); }
.mp-sec { font-size: 12px; color: var(--fg2); margin: 10px 0 8px; }
.mp-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.mp-cell {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 6px 12px; border-radius: 10px; border: none; cursor: pointer;
  background: var(--card2); color: var(--fg); font-size: 12px;
}
.mp-cell:hover { background: var(--acc-soft, var(--card)); outline: 1px solid var(--line); }
.mp-cell.on { outline: 1px solid var(--acc); background: var(--acc-soft, var(--card2)); }
.mp-tag {
  position: absolute; top: 4px; right: 4px; font-style: normal; font-size: 9.5px;
  color: var(--acc); background: var(--acc-soft, var(--card)); padding: 1px 5px; border-radius: 6px;
}
.mp-empty { grid-column: 1 / -1; text-align: center; color: var(--fg2); font-size: 12.5px; padding: 20px 0; }
@media (max-width: 560px) { .mp-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
