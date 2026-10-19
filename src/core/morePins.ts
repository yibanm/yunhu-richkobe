/**
 * 侧栏常驻功能项的共享状态（Console 的更多功能宫格 与 Sidebar 的常驻列表共用）
 * 存 localStorage：yh.more.pinned = 插件页 path 数组
 */
import { reactive } from 'vue'

const KEY = 'yh.more.pinned'

function load(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export const morePins = reactive({ paths: load() })

export function toggleMorePin(path: string) {
  const i = morePins.paths.indexOf(path)
  if (i >= 0) morePins.paths.splice(i, 1)
  else morePins.paths.push(path)
  localStorage.setItem(KEY, JSON.stringify(morePins.paths))
}

export function isMorePinned(path: string) { return morePins.paths.includes(path) }
