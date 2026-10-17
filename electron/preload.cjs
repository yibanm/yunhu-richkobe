/**
 * 预加载脚本：只暴露只读的平台信息给渲染进程（contextIsolation 下安全）。
 * 渲染层用它区分「桌面壳内」与「纯浏览器 / Capacitor」环境。
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('yunhuDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})
