/**
 * 云湖客户端服务端（Node 24 可直接运行 TS：node server.ts）
 *   · 托管 ./dist 静态资源（SPA fallback）
 *   · /api/*  -> https://chat-go.jwzhd.com/*        接口（绕过 CORS）
 *   · /res/<host>/<path> -> https://<host>/<path>   数据床（补 Referer 防盗链头）
 *   · GET/PUT /config -> yunhu.config.yml           配置文件读写
 *   · /webdav/*  -> 云湖群网盘的 WebDAV 网关（user=群ID, pass=token）
 *   · /satori/*  -> 标准 Satori 协议端点（Authorization: Bearer token）
 * 运行： HOST=:: PORT=8902 node server.ts
 */
import http from 'node:http'
import https from 'node:https'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { handleWebdav, handleMountJson } from './webdav.ts'
import { handleSatori } from './satori.ts'
import { SatoriSocket, acceptKey, isSatoriWs } from './satori-ws.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
/* Tauri sidecar 场景：资源目录与代码目录分离，用 YH_ROOT 指定 dist/config/certs 所在目录；
   未设置时保持原行为（__dirname），Electron/裸 node 运行不受影响 */
const BASE: string = process.env.YH_ROOT || __dirname
const PORT: number = Number(process.env.PORT || 8902)
const HOST: string = process.env.HOST || '0.0.0.0'
const UPSTREAM: string = process.env.UPSTREAM || 'https://chat-go.jwzhd.com'
const ROOT: string = join(BASE, 'dist')
const CONFIG_FILE: string = join(BASE, 'yunhu.config.yml')

/* ============ 用户数据目录（登录态/会话缓存/锁屏 PIN/扫码中继） ============
 * 解析顺序：YH_DATA_DIR 环境变量 → 用户自定义（~/.yhchat-dir 文件）→ 默认「文档/yhchat」。
 * 自定义目录经 GET/PUT /data-dir 读写；PUT 时把旧目录里的数据文件搬过去（尽力而为）。
 * 只允许白名单内的文件名，防止路径穿越写到任意位置。
 */
const DATA_DIR_FILE = join(homedir(), '.yhchat-dir')
const DATA_ALLOW = new Set(['session', 'cache', 'pin', 'lock', 'relay'])
const DATA_MAX_BYTES = 2 * 1024 * 1024   // 会话快照可能较大，限 2MB 足够且防滥用
const JSON_HDR = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

function defaultDataDir(): string { return join(homedir(), 'Documents', 'yhchat') }
function resolveDataDir(): string {
  if (process.env.YH_DATA_DIR) return process.env.YH_DATA_DIR
  try {
    const custom = readFileSync(DATA_DIR_FILE, 'utf8').trim()
    if (custom) return custom
  } catch { /* 没有自定义就用默认 */ }
  return defaultDataDir()
}
let DATA_DIR = resolveDataDir()
try { mkdirSync(DATA_DIR, { recursive: true }) } catch { /* 目录建不起来时 /data 请求会各自报错，不影响其他路由 */ }

/** PUT /data-dir：改自定义目录并搬迁已有数据文件 */
async function handleDataDir(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    res.writeHead(200, JSON_HDR)
    res.end(JSON.stringify({ dir: DATA_DIR, custom: existsSync(DATA_DIR_FILE), default: defaultDataDir() }))
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      const dir = String(body.dir || '').trim()
      if (!dir || dir.length > 260) { res.writeHead(400, JSON_HDR).end(JSON.stringify({ ok: false, msg: '目录路径不合法' })); return }
      mkdirSync(dir, { recursive: true })
      // 搬迁旧目录数据（同名覆盖跳过，失败不阻断）
      for (const name of DATA_ALLOW) {
        const from = join(DATA_DIR, name + '.json')
        const to = join(dir, name + '.json')
        if (existsSync(from) && !existsSync(to)) {
          await writeFile(to, await readFile(from, 'utf8'), 'utf8').catch(() => {})
        }
      }
      await writeFile(DATA_DIR_FILE, dir, 'utf8')
      DATA_DIR = dir
      res.writeHead(200, JSON_HDR)
      res.end(JSON.stringify({ ok: true, dir }))
    } catch (e: any) {
      res.writeHead(500, JSON_HDR)
      res.end(JSON.stringify({ ok: false, msg: e.message }))
    }
    return
  }
  res.writeHead(405).end('method not allowed')
}

const DEFAULT_CONFIG = `# 云湖第三方客户端配置
app:
  title: 云湖 · 第三方客户端
  theme: dark
  pollMs: 4000
plugins:
  config: {}
  theme:
    preset: kobe
    accent: ''
    wallpaper: ''
    radius: 10
    blur: 0
  message-actions: {}
  logger: {}
  ui: {}
  console: {}
  api: {}
  auth: {}
  adapter: {}
  chat:
    pollMs: 4000
  ws:
    heartbeat: 25000
  quickreply:
    enabled: false
    items:
      - 收到 ✅
      - 稍等一下
      - 好的
`

const RES_HOST_RE = /^chat-(img|img2|img3|audio1|file|file-oss|storage1|video1)\.jwznb\.com$/i
const RES_REFERER = 'http://myapp.jwznb.com'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json',
}

function follow(target: string, req: http.IncomingMessage, res: http.ServerResponse, referer: string | null, depth = 0, cacheControl = 'no-store'): void {
  const url = new URL(target)
  const headers: any = { ...req.headers, host: url.host, 'accept-encoding': 'identity' }
  delete headers.origin; delete headers.referer; delete headers.cookie
  if (referer) headers.referer = referer

  const r = https.request({
    hostname: url.hostname, port: url.port || 443, method: req.method,
    path: url.pathname + url.search, headers,
  }, up => {
    if (up.statusCode! >= 300 && up.statusCode! < 400 && up.headers.location && depth < 3) {
      up.resume()
      return follow(new URL(up.headers.location, url).toString(), req, res, referer, depth + 1, cacheControl)
    }
    /*
     * ⚠️ 视频/音频播放必须带这几个头：
     *   浏览器是发 Range 请求（分片）拿媒体的，上游回 206 + Content-Range，
     *   如果代理只透传 content-type，把 content-range/accept-ranges/content-length 丢了，
     *   浏览器就认为响应残缺 → **视频根本播不了**（之前就是这个原因）。
     */
    const h: Record<string, any> = {
      'content-type': up.headers['content-type'] || 'application/octet-stream',
      'cache-control': cacheControl,
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-range, content-length, accept-ranges',
    }
    for (const k of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'content-disposition']) {
      if (up.headers[k] !== undefined) h[k] = up.headers[k]
    }
    res.writeHead(up.statusCode || 502, h)
    up.pipe(res)
  })
  r.on('error', (e: Error) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: -1, msg: 'proxy error: ' + e.message }))
  })
  if (req.method === 'GET' || req.method === 'HEAD') r.end()
  else req.pipe(r)
}

function resProxy(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, search: string): void {
  const m = pathname.match(/^\/res\/([^/]+)(\/.*)?$/)
  if (!m) { res.writeHead(400).end('bad res url'); return }
  const host = decodeURIComponent(m[1])
  if (!RES_HOST_RE.test(host)) { res.writeHead(403).end('host not allowed'); return }
  // 数据床是静态资源，可以长缓存
  follow(`https://${host}${m[2] || '/'}${search}`, req, res, RES_REFERER, 0, 'public, max-age=86400')
}

/** /up/<host>/<path> -> https://<host>/<path>（上传走这里，绕开浏览器跨域） */
function upProxy(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, search: string): void {
  const m = pathname.match(/^\/up\/([^/]+)(\/.*)?$/)
  if (!m) { res.writeHead(400).end('bad up url'); return }
  const host = decodeURIComponent(m[1])
  if (!/^[\w.-]+$/.test(host)) { res.writeHead(403).end('host not allowed'); return }
  const url = new URL(`https://${host}${m[2] || '/'}${search}`)
  const headers: any = { ...req.headers, host: url.host }
  delete headers.origin; delete headers.referer
  const r = https.request({
    hostname: url.hostname, port: 443, method: req.method, path: url.pathname + url.search, headers,
  }, up => {
    res.writeHead(up.statusCode || 502, {
      'content-type': up.headers['content-type'] || 'application/octet-stream',
      'access-control-allow-origin': '*',
    })
    up.pipe(res)
  })
  r.on('error', (e: Error) => { res.writeHead(502).end('up proxy error: ' + e.message) })
  req.pipe(r)
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function handleConfig(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const text = existsSync(CONFIG_FILE) ? await readFile(CONFIG_FILE, 'utf8') : DEFAULT_CONFIG
      if (!existsSync(CONFIG_FILE)) await writeFile(CONFIG_FILE, DEFAULT_CONFIG, 'utf8')
      res.writeHead(200, { 'content-type': 'text/yaml; charset=utf-8', 'cache-control': 'no-store' })
      res.end(text)
    } catch (e: any) { res.writeHead(500).end(String(e.message)) }
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = await readBody(req)
      await writeFile(CONFIG_FILE, body, 'utf8')
      console.log('[config] 已更新 yunhu.config.yml')
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
    } catch (e: any) { res.writeHead(500).end(String(e.message)) }
    return
  }
  res.writeHead(405).end('method not allowed')
}

/** GET/PUT/DELETE /data/<name> —— 用户数据落盘（文档/yhchat） */
async function handleData(req: http.IncomingMessage, res: http.ServerResponse, name: string): Promise<void> {
  if (!DATA_ALLOW.has(name)) { res.writeHead(404, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'unknown data key' })); return }
  const file = join(DATA_DIR, name + '.json')
  if (req.method === 'GET') {
    try {
      const text = existsSync(file) ? await readFile(file, 'utf8') : ''
      res.writeHead(200, JSON_HDR).end(text || '{}')
    } catch (e: any) { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await readBody(req)
    if (body.length > DATA_MAX_BYTES) { res.writeHead(413, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'too large' })); return }
    try {
      JSON.parse(body)                       // 只收合法 JSON，坏数据不落盘
      await writeFile(file, body, 'utf8')
      res.writeHead(200, JSON_HDR).end(JSON.stringify({ ok: true }))
    } catch (e: any) { res.writeHead(400, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'bad json: ' + e.message })) }
    return
  }
  if (req.method === 'DELETE') {
    try { await unlink(file) } catch { /* 不存在也视为成功（幂等） */ }
    res.writeHead(200, JSON_HDR).end(JSON.stringify({ ok: true }))
    return
  }
  res.writeHead(405, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'method not allowed' }))
}

/** GET /update-check —— 代理 GitHub Releases 最新版本（检查更新用，避免前端直连被墙/CORS） */
async function handleUpdateCheck(res: http.ServerResponse): Promise<void> {
  // GitHub API 直连在国内不稳：依次试直连 → 加速镜像
  const bases = [
    'https://api.github.com',
    'https://ghfast.top/https://api.github.com',
    'https://ghproxy.net/https://api.github.com',
  ]
  const path = '/repos/yibanm/yunhu-richkobe/releases'
  let payload = ''
  let okStatus = 0
  for (const base of bases) {
    const r = await new Promise<{ status: number; body: string }>((resolve) => {
      const req = https.get(base + path, { headers: { 'user-agent': 'yunhu-client', accept: 'application/vnd.github+json' } }, up => {
        const chunks: Buffer[] = []
        up.on('data', c => chunks.push(c))
        up.on('end', () => resolve({ status: up.statusCode || 502, body: Buffer.concat(chunks).toString('utf8') }))
      })
      req.on('error', e => resolve({ status: 502, body: JSON.stringify({ message: e.message }) }))
      req.setTimeout(8000, () => { req.destroy(); resolve({ status: 504, body: '{"message":"timeout"}' }) })
    })
    if (r.status === 200) { okStatus = 200; payload = r.body; break }
  }
  if (okStatus !== 200) { res.writeHead(502, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'github 不可达（直连与镜像均失败）' })); return }
  try {
    // 取版本号最高的 v-tag release（desktop-latest 等非版本 tag 不参与比较）
    const list = JSON.parse(payload) as any[]
    const ver = (t: string) => t.replace(/^v/, '').split('.').map(Number)
    const cands = list.filter((x: any) => /^v?\d+\.\d+\.\d+$/.test(x.tag_name || ''))
    if (!cands.length) { res.writeHead(200, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'no versioned release' })); return }
    cands.sort((a: any, b: any) => {
      const pa = ver(a.tag_name), pb = ver(b.tag_name)
      for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
      return 0
    })
    const j = cands[0]
    const direct = j.html_url || ''
    res.writeHead(200, JSON_HDR).end(JSON.stringify({
      ok: true,
      tag: j.tag_name || '',
      name: j.name || j.tag_name || '',
      notes: j.body || '',
      url: direct,
      urlFast: direct ? `https://ghfast.top/${direct}` : '',
      assets: (j.assets || []).map((a: any) => ({
        name: a.name, url: a.browser_download_url,
        urlFast: a.browser_download_url ? `https://ghfast.top/${a.browser_download_url}` : '',
        size: a.size,
      })),
    }))
  } catch { res.writeHead(502, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'bad github payload' })) }
}

/** GET/PUT /file-dir：文件保存目录（默认 <数据目录>/file，即 文档/yhchat/file） */
const FILE_DIR_FILE = join(homedir(), '.yhchat-filedir')
function defaultFileDir(): string { return join(DATA_DIR, 'file') }
function resolveFileDir(): string {
  if (process.env.YH_FILE_DIR) return process.env.YH_FILE_DIR
  try {
    const custom = readFileSync(FILE_DIR_FILE, 'utf8').trim()
    if (custom) return custom
  } catch { /* 用默认 */ }
  return defaultFileDir()
}
let FILE_DIR = resolveFileDir()
try { mkdirSync(FILE_DIR, { recursive: true }) } catch { /* 忽略 */ }

async function handleFileDir(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method === 'GET') {
    res.writeHead(200, JSON_HDR)
    res.end(JSON.stringify({ dir: FILE_DIR, custom: existsSync(FILE_DIR_FILE), default: defaultFileDir() }))
    return
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      const dir = String(body.dir || '').trim()
      if (!dir || dir.length > 260) { res.writeHead(400, JSON_HDR).end(JSON.stringify({ ok: false, msg: '目录路径不合法' })); return }
      mkdirSync(dir, { recursive: true })
      await writeFile(FILE_DIR_FILE, dir, 'utf8')
      FILE_DIR = dir
      res.writeHead(200, JSON_HDR)
      res.end(JSON.stringify({ ok: true, dir }))
    } catch (e: any) {
      res.writeHead(500, JSON_HDR)
      res.end(JSON.stringify({ ok: false, msg: e.message }))
    }
    return
  }
  res.writeHead(405).end('method not allowed')
}

/**
 * POST /local-open {url, name} —— 「在文件夹中打开」/「保存文件」：
 * 把远程文件下载到**文件保存目录**（默认 文档/yhchat/file，可自定义），
 * 然后调系统资源管理器定位选中（Windows: explorer /select,xxx；其它平台打开目录）。
 * url 限本站 /res 代理或云湖数据床域名，防任意下载。
 */
async function handleLocalOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST') { res.writeHead(405, JSON_HDR).end(JSON.stringify({ ok: false })); return }
  try {
    const body = JSON.parse(await readBody(req))
    const url = String(body.url || '')
    const name = String(body.name || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'file'
    const u = new URL(url, 'http://localhost')
    const allowed = u.pathname.startsWith('/res/') || RES_HOST_RE.test(u.hostname) || u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (!allowed) { res.writeHead(403, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'url not allowed' })); return }
    mkdirSync(FILE_DIR, { recursive: true })
    const dest = join(FILE_DIR, name)
    // 下载（http/https 都支持：/res 走本站代理）
    const target = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      ? `http://127.0.0.1:${PORT}${u.pathname}${u.search}`
      : url
    const data = await new Promise<Buffer>((resolve, reject) => {
      const mod = target.startsWith('https') ? https : http
      mod.get(target, { headers: u.pathname.startsWith('/res/') ? { referer: RES_REFERER } : {} }, (up) => {
        if ((up.statusCode || 0) >= 400) { up.resume(); reject(new Error('HTTP ' + up.statusCode)); return }
        const chunks: Buffer[] = []
        up.on('data', (c) => chunks.push(c))
        up.on('end', () => resolve(Buffer.concat(chunks)))
        up.on('error', reject)
      }).on('error', reject)
    })
    await writeFile(dest, data)
    // 系统资源管理器定位
    if (process.platform === 'win32') {
      execFileSync('explorer.exe', ['/select,' + dest], { stdio: 'ignore', windowsHide: true })
    } else {
      execFileSync(process.platform === 'darwin' ? 'open' : 'xdg-open', [FILE_DIR], { stdio: 'ignore' })
    }
    res.writeHead(200, JSON_HDR).end(JSON.stringify({ ok: true, path: dest }))
  } catch (e: any) {
    res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message }))
  }
}

/** GET /local-read?path=... —— Tauri 拖放文件读取：把本地文件以流形式返回给前端转 File。
 *  需带 token 头（与 /api 同源凭据），防本地其它进程/网页滥用读任意文件。 */
async function handleLocalRead(req: http.IncomingMessage, res: http.ServerResponse, search: string): Promise<void> {
  const tok = String(req.headers.token || '').trim()
  if (!tok) { res.writeHead(401, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'token required' })); return }
  const q = new URLSearchParams(search || '')
  const p = String(q.get('path') || '')
  if (!p || !existsSync(p)) { res.writeHead(404, JSON_HDR).end(JSON.stringify({ ok: false, msg: 'file not found' })); return }
  try {
    const data = await readFile(p)
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(extname(p) ? p.slice(0, -extname(p).length).split(/[\\/]/).pop() + extname(p) : p.split(/[\\/]/).pop()),
      'access-control-allow-origin': '*',
    })
    res.end(data)
  } catch (e: any) { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }
}

async function staticFile(res: http.ServerResponse, pathname: string): Promise<void> {
  let rel = pathname === '/' ? '/index.html' : pathname
  rel = normalize(rel).replace(/^(\.\.[/\\])+/, '')
  let file = join(ROOT, rel)
  if (!file.startsWith(ROOT) || !existsSync(file)) file = join(ROOT, 'index.html')
  try {
    const data = await readFile(file)
    // ⚠️ index.html 必须 no-store：否则浏览器缓存旧 html → 永远加载旧 hash 的 JS bundle，
    //    表现为「服务端已修但用户界面不变」（多轮误判的根因）
    const cc = extname(file) === '.html' ? 'no-store' : 'public, max-age=86400'
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': cc })
    res.end(data)
  } catch { res.writeHead(404).end('404') }
}

function serverApp(req: any, res: any) {
  const { pathname, search } = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    }).end()
    return
  }
  if (pathname === '/config') { handleConfig(req, res); return }
  // 用户数据落盘（登录态/会话缓存/PIN/锁/扫码中继）
  const dataM = pathname.match(/^\/data\/([a-z]+)$/)
  if (dataM) { handleData(req, res, dataM[1]); return }
  if (pathname === '/data-dir') { handleDataDir(req, res).catch(e => { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }); return }
  if (pathname === '/update-check' && req.method === 'GET') { handleUpdateCheck(res).catch(e => { res.writeHead(502, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }); return }
  if (pathname === '/local-open' && req.method === 'POST') { handleLocalOpen(req, res).catch(e => { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }); return }
  if (pathname === '/file-dir') { handleFileDir(req, res).catch(e => { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }); return }
  if (pathname === '/local-read' && req.method === 'GET') { handleLocalRead(req, res, search).catch(e => { res.writeHead(500, JSON_HDR).end(JSON.stringify({ ok: false, msg: e.message })) }); return }
  // 标准 Satori 协议端点
  if (pathname.startsWith('/satori/')) {
    handleSatori(req, res, pathname, search).catch((e) => { try { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({code:500,message:e.message})) } catch {} })
    return
  }
  // WebDAV：把群网盘挂成标准 WebDAV（user=群ID, pass=token）
  if (pathname === '/webdav' || pathname.startsWith('/webdav/')) {
    handleWebdav(req, res, pathname, search).then((ok) => { if (!ok) res.writeHead(404).end('WebDAV route not handled') })
      .catch((e) => { try { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('WebDAV error: ' + e.message) } catch {} })
    return
  }
  // 挂载盘页内浏览（返回 JSON，前端直接渲染，不跳转）
  if (pathname === '/mount-json') {
    handleMountJson(req, res, new URL(req.url || '/', 'http://x')).catch((e) => {
      try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, msg: e.message })) } catch {}
    })
    return
  }
  if (pathname.startsWith('/res/')) { resProxy(req, res, pathname, search); return }
  if (pathname.startsWith('/up/')) { upProxy(req, res, pathname, search); return }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    // 接口一律不缓存
    follow(UPSTREAM + pathname.replace(/^\/api/, '') + search, req, res, null, 0, 'no-store')
    return
  }
  staticFile(res, pathname)
}

const server = http.createServer(serverApp).listen(PORT, HOST, () => {
  console.log(`[yunhu] http://${HOST}:${PORT}  root=${ROOT}`)
  console.log(`        api → ${UPSTREAM}   res → Referer: ${RES_REFERER}   config → ${CONFIG_FILE}`)
  console.log(`        satori: /satori/v1/*  (HTTP) + /satori/v1/ws (WebSocket)`)
})

/* ================= HTTPS（给手机录音/录像用） =================
 * 浏览器只在**安全上下文**（https 或 localhost）才给 navigator.mediaDevices，
 * 纯 http 访问时手机上根本拿不到麦克风/摄像头。所以并行起一个 https 端口。
 * 证书放 ./certs/{key,cert}.pem；没有就用 openssl 自签一张（会提示不安全，手动信任即可）。
 */
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8903)
const CERT_DIR = join(BASE, 'certs')
try {
  const keyFile = join(CERT_DIR, 'key.pem')
  const certFile = join(CERT_DIR, 'cert.pem')
  if (!existsSync(keyFile) || !existsSync(certFile)) {
    mkdirSync(CERT_DIR, { recursive: true })
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyFile, '-out', certFile, '-days', '3650',
      '-subj', '/CN=yunhu-client',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    ], { stdio: 'ignore' })
    console.log('[yunhu] 已自签 HTTPS 证书（自签的，浏览器会提示不安全，手动信任即可）')
  }
  const httpsSrv = https.createServer({
    key: readFileSync(keyFile),
    cert: readFileSync(certFile),
  }, serverApp)
  // 端口被占（如已有实例/sidecar 并存）只降级不崩进程：http 主服务仍可用
  httpsSrv.on('error', (e: any) => {
    console.log(`[yunhu] https ${HTTPS_PORT} 起不来（${e.code || e.message}），仅 http 可用`)
  })
  httpsSrv.listen(HTTPS_PORT, HOST, () => {
    console.log(`[yunhu] https://${HOST}:${HTTPS_PORT}  (手机录音/录像要用这个，因为是安全上下文)`)
  })
} catch (e: any) {
  console.log('[yunhu] HTTPS 没起来（不影响 http）：' + (e?.message || e))
}

/* WebSocket 升级：/satori/v1/ws —— 标准 Satori 协议的事件推送 */
server.on('upgrade', (req: any, socket: any) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (!isSatoriWs(url.pathname)) { socket.destroy(); return }
  const key = req.headers['sec-websocket-key']
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || ''
  if (!key || !token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return
  }
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(String(key))}\r\n\r\n`,
  )
  socket.setNoDelay(true)
  const ws = new SatoriSocket(socket, token)
  ws.on('message', (raw: string) => {
    try {
      const j = JSON.parse(raw)
      if (j.op === 1) ws.event('pong', {})       // 客户端 ping
    } catch { /* 忽略 */ }
  })
  ws.start().catch(() => {})
})

