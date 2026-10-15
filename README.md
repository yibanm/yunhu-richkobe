# 云湖牢大版

> 云湖第三方客户端 · **牢大版** · Vue3 + 真 cordis 插件内核 + Koishi 式控制台 + Satori 消息层
> 三端同源：Web · Windows 桌面（Electron / Fluent 设计）· Android（Capacitor / Material 3）

> 仅供 **学习交流**。接口来自社区公开整理：
> [yh-Tpdev/yhchatAPI](https://github.com/yh-Tpdev/yhchatAPI)（在线 <https://yh-api.yyyyt.top>）与
> [yhwiki](https://codeberg.org/ybr/yhwiki)。只使用 **你自己的账号 token**。

> 🔱 **Fork 来源**：本仓库 fork 自上游 [FLY1919](https://github.com/FLY1919)/[yunhu-vue](https://github.com/FLY1919/yunhu-vue)，
> 在其 Web 核心之上重建了 Windows 桌面壳与 Android 壳、重做了双端 UI 设计系统并整顿了工程质量。

**全量 TypeScript，`vue-tsc --noEmit` 0 error。**

> 📘 想写插件？看 [`docs/plugin-development.md`](docs/plugin-development.md) —— 从最小插件到「撤回消息」完整案例。

---

## 一、平台与获取

| 平台 | 形态 | 产物 |
|---|---|---|
| Windows x64 | Electron 桌面应用（Fluent / WinUI 3 设计语言） | `yunhulaoda-<版本>-windows-x64-setup.exe`（NSIS 安装版）/ `yunhulaoda-<版本>-windows-x64.zip`（便携版） |
| Android arm64 | Capacitor 壳 + WebView（Material 3 主题） | `yunhulaoda-<版本>-android-arm64.apk` |
| Web | 纯浏览器 / 自托管 | `npm run build && npm run serve` |

安装包与 APK 见 [Releases](../../releases)。桌面版内置 Node 反代服务端，双击即用，无需额外后端；
Android 版打开后在「设置 → API 基址」确认链路即可使用。

## 二、三层结构

```
┌───────────────────────────────────────────────┐
│ 控制台 (Koishi 风格)                           │
│   rail 导航由「插件注册的页面」动态生成          │
│   ctx.page / ctx.slot / ctx.action / ctx.menu  │
├───────────────────────────────────────────────┤
│ Satori 消息层                                  │
│   Element[] 元素树 · Session · Bot             │
│   适配器负责 云湖 protobuf ⇄ 元素树             │
├───────────────────────────────────────────────┤
│ Cordis 内核                                    │
│   Context / plugin / Service / inject / effect │
└───────────────────────────────────────────────┘
```

### 1. 内核（`src/core/context.ts`）

| 机制 | 说明 |
|---|---|
| `Context` | `ctx.extend()` 派生；`ctx.<service>` 直接访问；`ctx.root` |
| `Context.current` | 当前正在 `apply` 的上下文（服务方法里把副作用挂到调用方） |
| `Service` | 服务基类，**构造完成后**由框架调 `start()` 注册 |
| `inject` | 服务 falsy → 不加载；值变化 → 回滚重载；服务消失 → 回滚挂起，恢复 → 自动重载 |
| `ctx.inject(deps, cb)` | 语法糖（带 using 的子插件） |
| `ctx.effect(fn)` | 副作用，随插件卸载自动清理 |
| **稳定服务代理** | `ctx.<service>` 返回按名字缓存的转发代理：插件重载换实例后，组件缓存的引用依然有效；代理取值会读 `app.revision`，保证 `computed` 正确建立依赖 |

### 2. Satori 消息层（`src/satori/`）

```ts
import { h } from '../satori'

h.text('你好') · h.image(url) · h.at(id, name) · h.a(href, [h.text('链接')])
h.markdown('# 标题') · h.html('<b>x</b>') · h.sticker(url, itemId, packId)
h.file(url, name, size) · h.audio(url, time) · h.video(url) · h.a2ui(json) · h.br()

parse(云湖content, contentType) -> Element[]     // 适配器入
render(Element[]) -> { contentType, content }    // 适配器出
toText(Element[]) / toHtml(Element[])
```

```ts
ctx.on('message-created', (session) => {
  session.channel     // { id, type: 1用户 2群 3机器人, name }
  session.user        // { id, name, avatar }
  session.elements    // Element[]
  session.content     // 纯文本
  session.send([h.text('收到'), h.image(url)])
})

ctx.bots[0].sendMessage({ id: '418769995', type: 2 }, [h.markdown('**hi**')])
```

事件：`message-created` / `message-updated` / `message-recalled`。

### 3. 控制台（`src/console/`）

```ts
ctx.inject(['console'], (ctx) => {
  ctx.console.addListener('chat/summary', () => ({ ... }))          // 后端接口
  ctx.console.menu('logger', [{ id: 'logger.clear', label: '清空' }])
  ctx.console.action('logger.clear', { action: () => logger.clear() })
  ctx.console.addEntry((ctx) => {                                   // 客户端入口
    ctx.page({ name: '日志', path: '/logs', icon: 'terminal', order: 800, component: LogsPage })
    ctx.slot({ type: 'status-left', component: Widget, order: 10 })
  })
})
```

左侧导航**完全由已注册页面生成**，插件装卸即时增减。页面组件用 `<k-layout>` / `<k-card>` / `<k-slot>` 组装。

## 三、设计系统

桌面端采用 **Fluent / WinUI 3 设计语言**，移动端（Android / 窄屏）适配 **Material 3**；
色系沿用原仓库（强调色 `#5a8cf8`、暗色底 `#17181f`），在其上建立清晰层级：

- **层叠表面**：三级阴影令牌（`--elev-1/2/3`）+ 卡片悬浮抬升，暗色下「越高越亮」
- **导航层级**：NavigationView 式左栏 + 选中指示条动画；页面切换入场动效
- **分区与卡片**：内容区按卡片/分区组织，标题栏亚克力模糊吸顶
- **交互反馈**：按钮按压缩放、输入框 Fluent 底部强调线、Toast 滑入、消息入场动画
- **移动端**：触控目标 ≥ 44px、底部安全区内边距、抽屉式会话列表

品牌图标（见下图）覆盖全部可见位置：Windows 安装器图标 / 安装界面品牌图 / 快捷方式 / 任务栏与窗口图标 / 系统托盘 / Android 启动图标与自适应图标 / 启动页 / 应用内 logo。

<p align="center">
  <img src="assets/brand.jpg" alt="云湖牢大版" width="360" />
</p>

## 四、配置文件（对标 koishi.yml）

`yunhu.config.yml`（服务端 `/config` 读写，控制台「配置」页可视化编辑）

```yaml
app:
  title: 云湖牢大版
  theme: dark
  pollMs: 4000
plugins:
  chat:
    pollMs: 4000
    maxMessages: 200
  ws:
    heartbeat: 25000
  quickreply:
    enabled: true
    items: [收到 ✅, 稍等一下, 好的]
```

- 启动时先加载配置，再把 `{...app, ...plugins.<key>}` 作为 `config` 传给插件
- 「保存」写回服务器文件；「应用并重载插件」按新配置重挂载并自动恢复登录态
- 实测：改 `plugins.quickreply.items` → 应用 → 聊天页按钮条立刻变化

## 五、功能

登录（邮箱/Token）· 会话（未读/@/搜索）· 消息收发 · **消息操作（撤回/多选/全选/转发/引用 + 右键菜单）** · **群管理（成员/踢出/禁言/看板/记录搜索）** · **A2UI v0.9** · **视频/语音** · **WebSocket 实时** · **资源代理**（补 `Referer: http://myapp.jwznb.com`，解锁图片/表情/音频/视频/文件/头像）· **富消息渲染**（文本/图片/Markdown/HTML/文件/表单/文章/表情/语音/通话/A2UI，**统一走元素树**）· 浅色深色 · 移动端抽屉 · **桌面托盘/单实例** · **启动失败可视错误页（不再黑屏白屏）**

## 六、目录

```
yunhu-vue/
├── server.ts                 # 托管 + /api + /res + /config（Node 24 直接跑 TS）
├── electron/                 # Windows 桌面壳（主进程 / preload / 托盘图标）
├── electron-builder.yml      # NSIS 安装版 + 便携 zip 打包配置
├── capacitor.config.ts       # Android 壳配置（appId=com.yunhu.kobe）
├── android/                  # Capacitor Android 工程（M3 主题，入库可复现构建）
├── build/                    # 品牌图标源（icon.ico / icon.png / NSIS 位图）
├── assets/                   # README 插图 / 应用内 logo
├── scripts/gen_icons.py      # 从一张方图生成全平台图标
├── docs/plugin-development.md   # ★ 插件开发指南（以撤回为完整案例）
├── yunhu.config.yml
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── core/context.ts       # ★ Cordis 内核
│   ├── core/{pb,res,render,util}.ts
│   ├── satori/{element,session,index}.ts   # ★ Satori 消息层
│   ├── console/              # ★ 控制台（service.ts / Console.vue / components / pages）
│   ├── plugins/              # 各插件（ts）
│   ├── components/           # 聊天 UI（vue，全部 lang="ts"）
│   ├── app.ts  main.ts  env.d.ts
├── test-kernel.mjs test.mjs test-ws.mjs
```

## 七、运行与构建

```bash
npm install
npm run dev                      # Web 开发
npm run build && npm run serve   # Web 生产：HOST=:: PORT=8902 node server.ts
npm run typecheck                # vue-tsc
npm run test:kernel              # 内核语义测试（无需账号）
YH_EMAIL=… YH_PASS=… npm run test:api && npm run test:ws
```

桌面版（Windows）：

```bash
npm run desktop                  # 开发态跑 Electron 壳
npm run desktop:pack             # 产出 release/yunhulaoda-<版本>-windows-x64-setup.exe / .zip
```

Android 版：

```bash
npm run android:sync             # 构建 Web + 同步到 android 工程
npm run android:apk              # 产出 android/app/build/outputs/apk/release/app-release.apk
```

> 本地构建环境：Node ≥ 22；Android 需 JDK 21（Capacitor 8 要求）+ Android SDK（compileSdk 36）。
> 云端构建（GitHub Actions）与本地构建产物一致，workflow 见 `.github/workflows/build-release.yml`。

调试：控制台里 `__yunhu` 就是根 Context，可查 `__yunhu.app.list()` / `__yunhu.console.state.pages`。

## 八、加一个带页面 + 消费消息的插件

```ts
// src/plugins/hello.ts
import { h } from '../satori'
import HelloPage from '../console/pages/HelloPage.vue'

export const helloPlugin = {
  name: 'hello',
  inject: { required: ['ui'], optional: ['console'] },
  provide: ['hello'],
  apply(ctx, config) {
    ctx.on('message-created', (s) => {
      if (s.content.includes('你好')) s.send([h.text('你好呀 '), h.at(s.user.id, s.user.name)])
    })
    ctx.set('hello', { hi: () => ctx.ui.toast('hi') })
    ctx.inject(['console'], (ctx) => {
      ctx.console.addEntry((c) => {
        c.page({ name: '你好', path: '/hello', icon: 'bolt', order: 200, component: HelloPage })
      })
    })
  },
}
// src/app.ts 的 registry 里加一行，并在 yunhu.config.yml 的 plugins 下写配置
```

## 访问地址

服务端默认绑双栈 `HOST=::`（IPv6 + IPv4 都能连），端口 8902：

```
IPv6:  http://[2409:8a4c:9e33:4570::9]:8902
IPv4:  http://192.168.1.100:8902
```

> 只绑 `0.0.0.0` 的话 IPv6 连不上；要同时支持就设 `HOST=::`（Linux 下双栈）。

## 服务端附带能力

| 路径 | 说明 |
|---|---|
| `/api/*` | 云湖接口反代（绕 CORS，一律 no-store） |
| `/res/<host>/<path>` | 数据床代理（补 `Referer: http://myapp.jwznb.com`） |
| `/up/<host>/` | 七牛上传代理 |
| `/webdav/*` | 群网盘 WebDAV 网关（user=群ID 或 all，pass=token） |
| `/satori/v1/*` | 标准 Satori 协议 HTTP 端点（Bearer token） |
| `/satori/v1/ws` | Satori 事件推送（WebSocket，手写 RFC6455） |
| `/config` | 配置文件读写 |

---

## 九、控制台页面一览（13 个，全部由插件注册）

| 页面 | 提供插件 | 说明 |
|---|---|---|
| 聊天 | chat | 会话列表 / 消息 / 富消息 / 引用 / 多选 / 群功能全屏界面 |
| 快捷回复 | quickreply | 输入区按钮条 + 本页管理 |
| 通讯录 | social | 用户 / 群聊 / 机器人 + 好友申请 + 添加 + 创建群聊 |
| 表情 | stickers | 表情包（列表/创建/导入 zip/重命名/删除）+ 个人收藏（置顶/删除）|
| 机器人 | botconsole | 我创建的机器人：编辑 / 重置 Token / 指令 / 创建 |
| 板块 | community | 云湖「文章分区」：创建 / 编辑 / 权限 / 绑定群聊 / 进去看文章 |
| 事件 | adapter | Satori 统一事件流 |
| 日志 | logger | 分级筛选 / 搜索 / 复制 / 清空 |
| 主题 | theme | 配色 / 壁纸 / 圆角，15 套预设 |
| 设置 | group-admin | 账号信息 + 个人资料 |
| 配置 | config | 直接编辑 yunhu.config.yml |
| 插件 | console | 插件清单 + 热装载/卸载（真 cordis Fiber）|
| 账号 | auth | 登录态 / 连接 / 外观 |

## 十、插件清单（21 个）

```
内核/基础   cfg  logger  ui  theme  console  api  http  auth
协议层      adapter(Satori)  ws
业务层      chat  message-actions  group-admin  quickreply  charbg
            session-event(session/event)  social  botconsole
            community  stickers  commands
```

装/卸一个插件，它注册的**服务 / 控制台页面 / 导航项 / 聊天菜单 / 输入区按钮 / 插槽 / 气泡渲染器**会一起消失或恢复 —— 这是 Koishi 式的核心体验。

## 十一、脚本

```bash
npm run preflight     # 部署前自检（模板 import / 本地引用 / 服务声明），已接进 build
node scripts/api-coverage.mjs     # 生成 docs/api-coverage.md（接口覆盖情况）
npx tsx scripts/test-a2ui.mts     # A2UI 解析器单测（5 种形态）
py scripts/gen_icons.py <方图>    # 从一张方图重生成全平台品牌图标
bash deploy.sh        # 类型检查 → 自检 → 构建 → 校验资源 → 同步 → 冒烟测试
```

## 十二、文档

- [`docs/plugin-development.md`](docs/plugin-development.md) —— 插件开发指南（从最小插件到完整案例 + 富消息 + 常见坑清单 + ctx.session/ctx.event）
- [`docs/cordis-notes.md`](docs/cordis-notes.md) —— 真 cordis 的实测笔记（哪些原生有、哪些坑）
- [`docs/api-coverage.md`](docs/api-coverage.md) —— 云湖接口覆盖情况（已实现 94 / 文档 234 / 待实现 141）

## 十三、两个端口

```
http://[2409:8a4c:9e33:4570::9]:8902    日常访问（双栈 HOST=::）
https://[2409:8a4c:9e33:4570::9]:8903   手机录音/录像用（安全上下文，自签证书）
```

> 浏览器只在**安全上下文**（https / localhost）才给 `navigator.mediaDevices`，
> 所以纯 http 打开时手机上连录音权限弹窗都不会出。服务端会自动自签证书。
> 注：仓库不再内置证书私钥（`certs/` 已移除并忽略），服务端启动时自动生成自签证书。
