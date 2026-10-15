/**
 * Electron 主进程 —— 云湖牢大版桌面客户端
 *
 * 设计思路：**不重复实现业务**，直接复用现有 Node 服务端（server.ts）。
 *   1) 主进程以子进程方式拉起服务端（默认 127.0.0.1:8902）
 *   2) BrowserWindow 加载 http://127.0.0.1:8902
 *   3) Web 版有的功能桌面版全都有，不维护两份逻辑
 *
 * 桌面端特性：
 *   - 单实例锁（重复启动时聚焦已有窗口）
 *   - 系统托盘（关窗最小化到托盘，托盘菜单退出才真退出）
 *   - 启动前轮询等待服务端就绪，超时弹错误框（杜绝白屏/黑屏无反馈）
 *   - 窗口/任务栏/托盘全品牌图标
 *   - 退出时一并结束服务端子进程
 */
const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

const PORT = Number(process.env.YH_PORT || 8902)
const HTTPS_PORT = Number(process.env.YH_HTTPS_PORT || PORT + 1)
const BASE_URL = `http://127.0.0.1:${PORT}`

let mainWindow = null
let tray = null
let serverProcess = null
let isQuitting = false

/** 服务端目录：开发时是项目根，打包后是 resources/app */
function serverDir() {
  const root = path.join(__dirname, '..')
  return fs.existsSync(path.join(root, 'server.ts')) ? root : path.join(process.resourcesPath || '', 'app')
}

function iconPath() {
  return path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

/** 拉起服务端：用当前 node（process.execPath）跑 server.ts，避免 PATH 缺失静默失败 */
function startServer() {
  const dir = serverDir()
  const tsEntry = path.join(dir, 'server.ts')
  const jsEntry = path.join(dir, 'dist-server', 'server.cjs')

  let cmd = process.execPath || 'node'
  let args = []
  if (fs.existsSync(tsEntry)) {
    args = [tsEntry]
  } else if (fs.existsSync(jsEntry)) {
    args = [jsEntry]
  } else {
    dialog.showErrorBox('启动失败', '找不到服务端入口（server.ts / dist-server/server.cjs）')
    return false
  }

  serverProcess = spawn(cmd, args, {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HTTPS_PORT: String(HTTPS_PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const tag = '[yunhu-server]'
  serverProcess.stdout.on('data', (d) => console.log(tag, String(d).trim()))
  serverProcess.stderr.on('data', (d) => console.error(tag, String(d).trim()))
  serverProcess.on('exit', (code) => {
    if (!isQuitting) console.warn(tag, '服务端意外退出，code =', code)
  })
  serverProcess.on('error', (err) => {
    console.error(tag, 'spawn 失败：', err.message)
    dialog.showErrorBox('服务端启动失败', String(err.message))
  })
  return true
}

/** 轮询等待服务端就绪（最多 30 秒），超时 reject 由调用方弹错误框 */
function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE_URL}/`, (res) => {
        res.resume()
        if (res.statusCode) resolve()
      })
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('服务端启动超时'))
        else setTimeout(tick, 400)
      })
      req.setTimeout(1500, () => req.destroy())
    }
    tick()
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 560,
    title: '云湖牢大版',
    icon: iconPath(),
    backgroundColor: '#17181f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  })

  // 就绪后再显示，避免闪白
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadURL(BASE_URL)

  // 渲染进程加载失败（服务端异常等）→ 错误页，不黑屏
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          `<body style="font:14px/1.7 system-ui,sans-serif;background:#17181f;color:#d6d9e0;display:grid;place-items:center;height:100vh;margin:0">
           <div style="max-width:420px;text-align:center">
             <h2 style="color:#f2635f">页面加载失败</h2>
             <p>错误 ${code}：${desc}</p><p style="color:#868b9c">${url}</p>
             <p style="color:#868b9c">内置服务端可能未就绪，请重启应用；若反复出现请反馈日志。</p>
           </div></body>`
        )
    )
  })

  // 站内外链用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE_URL)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 关窗 → 最小化到托盘（Windows 习惯），托盘「退出」才真退出
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'tray.png'))
  tray.setToolTip('云湖牢大版')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => mainWindow && mainWindow.show() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
  )
  tray.on('double-click', () => mainWindow && mainWindow.show())
}

// 单实例锁
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.yunhu.kobe.desktop')
    if (!startServer()) return
    try {
      await waitForServer()
    } catch (e) {
      dialog.showErrorBox('启动超时', `${e.message}\n端口 ${PORT} 上的内置服务端未就绪，请检查端口占用后重试。`)
      isQuitting = true
      app.quit()
      return
    }
    createWindow()
    createTray()
  })

  app.on('window-all-closed', () => {
    // 有托盘时不退出（Windows/Linux）；macOS 保持 dock 习惯
    if (process.platform === 'darwin' && !isQuitting) return
  })

  app.on('before-quit', () => {
    isQuitting = true
    if (serverProcess) {
      try {
        serverProcess.kill()
      } catch {
        /* 已退出 */
      }
    }
  })

  app.on('activate', () => {
    if (mainWindow) mainWindow.show()
  })
}
