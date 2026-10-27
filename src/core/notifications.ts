/** Windows 通知桥接。等待事件订阅完成后才显示，避免首次点击丢失。 */
export function createNativeNotifications(activate: (id: string) => void, fail: (id: string, error: string) => void) {
  const tauri = (window as any).__TAURI__
  const available = !!(tauri?.core?.invoke && tauri?.event?.listen)
  let disposed = false
  const unlisteners: (() => void)[] = []
  const ready: Promise<boolean> = available ? (async () => {
    if (!await tauri.core.invoke('native_notifications_supported')) return false
    await tauri.core.invoke('clear_message_notifications')
    for (const [event, callback] of [
      ['message-notification-activated', (e: any) => activate(e.payload)],
      ['message-notification-failed', (e: any) => fail(e.payload.id, e.payload.error)],
    ] as const) {
      const unlisten = await tauri.event.listen(event, callback)
      if (disposed) unlisten()
      else unlisteners.push(unlisten)
    }
    return !disposed
  })().catch(() => {
    for (const unlisten of unlisteners.splice(0)) unlisten()
    return false
  }) : Promise.resolve(false)

  return {
    available, ready,
    async show(id: string, title: string, body: string, isActive: () => boolean) {
      if (!await ready || disposed) throw new Error('当前环境不支持 Windows 系统通知')
      if (!isActive()) return
      await tauri.core.invoke('show_message_notification', { id, title, body })
    },
    async dismiss(id: string) {
      if (available) await tauri.core.invoke('dismiss_message_notification', { id }).catch(() => {})
    },
    dispose() {
      disposed = true
      for (const unlisten of unlisteners.splice(0)) unlisten()
    },
  }
}
