import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置 —— Android 壳（yhchat kobe）。
 *
 * 黑屏根因治理（对照旧版配置）：
 *  · 旧版 server.cleartext + allowMixedContent 依赖明文流量，WebView 一旦
 *    加载失败就只剩黑屏且无任何日志；本版禁用 cleartext，全部走 https。
 *  · 旧版 android 工程由 CI 现场 `cap add` 生成、不入库，主题/启动页/错误桥
 *    全缺；本版 android/ 工程入库，配 M3 主题 + 品牌启动页 + WebView 错误桥。
 *  · webDir 指向 vite 产物 dist；base './' 与 Capacitor 本地加载兼容。
 */
const config: CapacitorConfig = {
  appId: 'com.yunhu.kobe',
  appName: 'yhchat kobe',
  webDir: 'dist',
  server: {
    // 云湖接口域名白名单（WebView 内导航允许）
    allowNavigation: ['*.jwzhd.com', '*.jwznb.com'],
    // 禁用明文流量：加载失败要报错，不要静默黑屏
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // WebView 过旧时给提示页，而不是黑屏
    minWebViewVersion: 60,
  },
}

export default config
