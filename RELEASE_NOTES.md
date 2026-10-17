# 云湖牢大版 v1.0.0（首版）

本仓库 fork 自上游 [FLY1919/yunhu-vue](https://github.com/FLY1919/yunhu-vue)：
上游的 cordis 内核、Satori 消息层、94 个已实现接口**原样沿用**；
本项目重建 Windows/Android 壳、按 QQ 重排 UI、整顿工程质量。仅供学习交流。

## 关键更改

- **QQ 式布局**：顶部标题栏（品牌 + 头像/昵称/个性签名）+ 左竖条功能栏
  （头像 + 插件页图标 + 底部调色盘/主题/≡ 菜单）+ 三栏聊天区；
  ≡ 菜单对标 QQ：收藏/文件/聊天记录管理/检查更新/帮助/设置/退出账号
- **Windows 桌面版**：Electron 壳 + 内置 Node 反代服务端，双击即用；
  NSIS 安装版 + 便携 zip，产物命名 `yunhulaoda-<版本>-windows-x64-*`
- **Android 版**：Capacitor 8 壳（`com.yunhu.kobe` / yhchat kobe），Material 3 主题，
  品牌启动页 + 自适应图标；android 工程入库，构建可复现
- **品牌图标全覆盖**：安装器/安装界面/快捷方式/窗口/托盘/Android 启动与自适应图标/README
- **调色盘**：预设主题色 + 自定义取色 + 自定义聊天底图（沿用上游 theme 服务）

## 修复的 bug

- **Android APK 打开黑屏**（根因组合，逐项治理）：工程入库配 M3 主题与品牌启动页；
  禁用 cleartext 明文静默失败；bootstrap 抛错改可视错误页（含堆栈与重载）；
  Capacitor 依赖补全；启动窗口背景 `<bitmap>` 误引自适应图标 XML 改独立位图
- **CI 必挂**：旧 workflow 引用不存在的 desktop 分支与已删除目录 → 重写为 tag 触发
- **typecheck 损坏**：vue-tsc 缺失 + TS7 不兼容 → 补依赖降 TS 5.9；
  新增 useCtx 类型化注入消除 ~50 个 unknown 报错；修复 SettingsPage 未定义变量等存量债
- **Electron 打不开**：服务端子进程 TS 直跑必崩 → esbuild 打纯 CJS + asarUnpack +
  ELECTRON_RUN_AS_NODE + 真实目录 cwd；证书/配置改写 userData
- **test-kernel**：适配 cordis 3.x（dispose 异步 / 无 app.services）

## 补全的接口

接口覆盖见 `docs/api-coverage.md`（已实现 94 / 文档 234，沿用上游实现）；
本版补全的是构建/打包链路：Capacitor 原生 HTTP 在 Android 壳内直连云湖。
待实现 141 个保留在文档清单中。

## UI 改动

- 登录页：品牌卡片 + 邮箱/Token 双 tab
- 控制台：QQ 式顶栏与 ≡ 菜单；NavigationView 式左栏（选中指示条）；亚克力吸顶标题栏
- 聊天：消息入场动画、气泡描边阴影、会话选中细强调线；Toast 滑入
- 移动端：触控目标 ≥ 44px、安全区内边距、抽屉会话列表

## 构建方式

- **云端（可复现）**：推送 `v*` tag 触发 `.github/workflows/build-release.yml`；
  Windows job（Node 22 + electron-builder）、Android job（Node 22 + JDK 21 + Gradle/AGP）
- **本地**：Node ≥ 22；`npm run desktop:pack` / `npm run android:sync && npm run android:apk`
- 产物：`yunhulaoda-<版本>-windows-x64-setup.exe` / `-windows-x64.zip` / `-android-arm64.apk`
- 源代码包：GitHub Release 页自动附带 zip/tarball

## 已知问题

- Windows / Android 未代码签名（首版调试签名），安装时需手动允许
- 单包 JS 约 520 kB（gzip 176 kB），未做路由级代码分割
- 待实现接口 141 个（见 docs/api-coverage.md）
- `flutter-prototype/` 为 Flutter 重写原型存档，不参与构建
