import { reactive } from 'vue'

export interface PendingAttachment {
  id: number
  file: File
  url: string
  kind: 'image' | 'video' | 'audio' | 'file'
  caption: string
  error: string
  progress: number
  speed: number
  /** 已上传的元素和已确认发送状态：配文失败时重试不重复发送图片。 */
  elements?: any[]
  sent?: boolean
}

/** 属于 chat 服务的会话草稿；组件切换不释放，退出账号/卸载服务时统一回收。 */
export function createComposerDrafts() {
  const drafts = new Map<string, ReturnType<typeof makeDraft>>()
  function makeDraft() {
    return reactive({ text: '', kind: 1, pending: [] as PendingAttachment[], uploading: false })
  }
  return {
    get(channel: { id: string; type: number }) {
      const key = `${channel.type}:${channel.id}`
      if (!drafts.has(key)) drafts.set(key, makeDraft())
      return drafts.get(key)!
    },
    clear() {
      for (const draft of drafts.values()) {
        for (const p of draft.pending) if (p.url) URL.revokeObjectURL(p.url)
        draft.pending = []
        draft.text = ''
      }
      drafts.clear()
    },
  }
}
