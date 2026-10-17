# 云湖牢大版

> 云湖第三方客户端 · **牢大版** · Vue3 + 真 cordis 插件内核 + Koishi 式控制台 + Satori 消息层
> 三端同源：Web · Windows 桌面（Electron）· Android（Capacitor）
> **QQ 式布局**：顶部标题栏（品牌 + 头像/昵称/签名）+ 左竖条功能栏 + ≡ 菜单 + 三栏聊天区

> 仅供 **学习交流**。接口来自社区公开整理：
> [yh-Tpdev/yhchatAPI](https://github.com/yh-Tpdev/yhchatAPI)（在线 <https://yh-api.yyyyt.top>）与
> [yhwiki](https://codeberg.org/ybr/yhwiki)。只使用 **你自己的账号 token**。

> 🔱 **Fork 来源**：本仓库 fork 自上游 [FLY1919](https://github.com/FLY1919)/[yunhu-vue](https://github.com/FLY1919/yunhu-vue)。
> 上游的接口实现（94 个 /v1/ 接口）、cordis 插件内核、Satori 消息层、控制台框架**原样沿用**；
> 本项目在其上重建 Windows/Android 壳、按 QQ 重排 UI、整顿工程质量。

**全量 TypeScript，`vue-tsc --noEmit` 0 error。**

> 📘 想写插件？看 [`docs/plugin-development.md`](docs/plugin-development.md) —— 从最小插件到「撤回消息」完整案例。

---

## 一、平台与获取

| 平台 | 形态 | 产物 |
|---|---|---|
| Windows x64 | Electron 桌面应用 | `yunhulaoda-<版本>-windows-x64-setup.exe`（NSIS 安装版）/ `yunhulaoda-<版本>-windows-x64.zip`（便携版） |
| Android arm64 | Capacitor 壳 + WebView | `yunhulaoda-<版本>-android-arm64.apk` |
| Web | 纯浏览器 / 自托管 | `npm run build && npm run serve` |

安装包与 APK 见 [Releases](../../releases)。桌面版内置 Node 反代服务端，双击即用；
Android 版打开后在「设置 → API 基址」确认链路即可使用。

## 二、界面（QQ 式）

```
┌──────────────────────────────────────────────┐
│ [logo] 云湖牢大版   [头像] 昵称  编辑个性签名    │  ← 顶栏
├──┬───────────┬───────────────────────────────┤
│头│ 搜索   +  │ 会话名 ●在线        📞 📹 ⋯    │
│像│───────────│───────────────────────────────│
│💬│ 会话 1 99+│      消息流（气泡/引用/撤回）     │
│👥│ 会话 2    │                               │
│⭐│ 会话 3    │                               │
│├───────────┼───────────────────────────────┤
│≡│           │ 😊 ✂ 📁  🎤   [输入] [发送]   │
└──┴───────────┴───────────────────────────────┘
```

- **顶栏**：品牌 logo + 名称；头像 + 昵称 + 个性签名（点击进账号页）
- **左竖条**：头像 + 功能图标（消息/通讯录/收藏…由插件注册页动态生成）；
  底部 **调色盘**（主题色/底图）、主题切换、**≡ 菜单**（收藏/文件/聊天记录管理/检查更新/帮助/设置/退出账号）
- **中栏**：会话列表（搜索、未读角标、@提醒、时间）
- **右栏**：聊天主区（标题栏状态点 + 工具按钮 / 消息流 / 输入区工具条）

## 三、三层结构（沿用上游内核）

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

内核机制、Satori 元素树、控制台注册 API 与上游一致，见
[`docs/plugin-development.md`](docs/plugin-development.md) 与 [`docs/cordis-notes.md`](docs/cordis-notes.md)。

## 四、功能（沿用上游已实现接口）

登录（邮箱/Token）· 会话（未读/@/搜索）· 消息收发 · **消息操作（撤回/多选/全选/转发/引用 + 右键菜单）** ·
**群管理（成员/踢出/禁言/看板/记录搜索）** · **A2UI v0.9** · **视频/语音** · **WebSocket 实时** ·
**资源代理**（补 Referer 解锁图片/表情/音频/视频/文件/头像）· **富消息渲染**（统一走元素树）·
浅色深色 · 移动端抽屉 · **桌面托盘/单实例** · **启动失败可视错误页** ·
接口覆盖见 [`docs/api-coverage.md`](docs/api-coverage.md)（已实现 94 / 文档 234）。

## 五、运行与构建

```bash
npm install
npm run dev                      # Web 开发
npm run build && npm run serve   # Web 生产：HOST=:: PORT=8902 node server.ts
npm run typecheck                # vue-tsc
npm run test:kernel              # 内核语义测试（无需账号）
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

> 本地构建环境：Node ≥ 22；Android 需 JDK 21（Capacitor 8）+ Android SDK（compileSdk 36）。
> 云端构建（GitHub Actions）与本地一致：推送 `v*` tag 触发 `.github/workflows/build-release.yml`。

## 六、目录

```
├── server.ts                 # 托管 + /api + /res + /config（Node 24 直接跑 TS）
├── electron/                 # Windows 桌面壳
├── electron-builder.yml      # NSIS 安装版 + 便携 zip
├── capacitor.config.ts       # Android 壳（appId=com.yunhu.kobe）
├── android/                  # Capacitor Android 工程（入库可复现）
├── build/ assets/            # 品牌图标源 / README 插图 / 应用内 logo
├── scripts/gen_icons.py      # 从一张方图生成全平台图标
├── src/
│   ├── core/context.ts       # ★ Cordis 内核（沿用上游）
│   ├── satori/               # ★ Satori 消息层（沿用上游）
│   ├── console/              # ★ 控制台（QQ 式外壳 + 插件页）
│   ├── plugins/              # 21 个插件（沿用上游 + 整顿）
│   └── components/           # 聊天 UI
├── flutter-prototype/        # Flutter 重写原型（存档参考，不参与构建）
└── docs/                     # 插件开发 / cordis 笔记 / 接口覆盖
```

## 七、鸣谢

- **FLY1919**（[yunhu-vue](https://github.com/FLY1919/yunhu-vue)）：内核、接口实现与整体架构
- 云湖接口文档社区：[yh-Tpdev/yhchatAPI](https://github.com/yh-Tpdev/yhchatAPI)

> ⚖️ 上游未附带开源许可证、声明「仅供学习交流」；本项目同样仅供学习交流，请勿商用。
