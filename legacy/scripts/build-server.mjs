/**
 * 把 Node 服务端（server.ts + webdav/satori 依赖图）编译成单个纯 CJS 文件。
 * 桌面打包后 Electron 二进制没有 TS type-stripping，必须以纯 JS 启动服务端；
 * 单文件也避免 asar 内散落源码。esbuild 随 electron-builder 依赖树自带。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

await build({
  entryPoints: [join(root, 'server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: join(root, 'dist-server', 'server.cjs'),
  // CJS 产物里没有 import.meta.url（server.ts 用它定位 __dirname），
  // 不替换会在模块加载时抛 Invalid URL、服务端子进程秒死。
  // banner 注入 CJS 全局，define 把 import.meta.url 指向它。
  banner: { js: 'const __YH_SERVER_FILE_URL__ = require("url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': '__YH_SERVER_FILE_URL__' },
  // node: 内置模块不打包
  external: ['node:*'],
  logLevel: 'info',
})

console.log('[build-server] dist-server/server.cjs ready')
