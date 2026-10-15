# 云湖牢大版 v1.0.0

首版发布。本仓库 fork 自上游 [FLY1919/yunhu-vue](https://github.com/FLY1919/yunhu-vue)，
在其 Web 核心之上重建 Windows 桌面壳与 Android 壳、重做双端 UI、整顿工程质量。

## 关键更改

- **Windows 桌面版回归**：Electron 壳 + 内置 Node 反代服务端，双击即用；
  Fluent / WinUI 3 设计语言（层叠表面、选中指示条、亚克力吸顶标题栏、入场动效）
- **Windows「打不开」根治**：旧壳用 Electron 可执行文件直跑 TS 源码（无 type-stripping 必崩）；
  本版构建期 esbuild 编译服务端为纯 CJS、asarUnpack 落盘、ELECTRON_RUN_AS_NODE 启动，
  并修复 asar 虚拟目录作 spawn cwd 的 ENOENT —— 本地实测内置服务 http 200、页面正常托管
- **Android 版回归**：Capacitor 8 壳（`com.yunhu.kobe` / yhchat kobe），Material 3 主题，
  品牌启动页 + 自适应图标；android 工程入库，构建可复现
- **UI 设计系统重做**：桌面 Fluent / 移动 M3 双适配；色系沿用原仓库；
  卡片、分区、三级阴影、圆角、间距、导航层级、状态与交互反馈全面建立
- **品牌图标全覆盖**：Windows 安装器图标 / NSIS 安装界面品牌图与顶栏图 / 快捷方式 /
  任务栏与窗口图标 / 系统托盘 / Android 启动与自适应图标 / 启动页 / 应用内 logo / README 插图
- **README 改版**：标题与介绍改为「云湖牢大版」，注明 fork 来源，中部插入品牌图

## 修复的 bug

- **Android APK 打开黑屏**（根因组合，逐项治理）：
  1. 旧工程由 CI 现场生成不入库，主题/启动页/错误桥全缺 → 工程入库并配 M3 主题与品牌启动页
  2. `server.cleartext + allowMixedContent` 明文流量静默失败 → 禁用 cleartext，全 https
  3. bootstrap 抛错仅 `console.error`，WebView 无反馈 → 新增可视错误页（含堆栈与重载按钮）
  4. Capacitor 插件不全（缺 `@capacitor/android`）原生分支运行时报错 → 依赖补全入库
  5. WebView 过旧无提示 → `minWebViewVersion` 提升到 60
  6. 启动窗口背景 `<bitmap>` 误引用自适应图标 XML（API 26+ `@mipmap/ic_launcher` 是 XML），
     启动即 `Resources$NotFoundException` 崩溃 → 改用独立位图 `splash_logo`
- **CI 必挂**：旧 `build-desktop.yml` 引用不存在的 `desktop` 分支与已删除的 `electron/` 目录 → 删除，
  新 workflow 以语义化 tag 触发
- **typecheck 脚本损坏**：引用未安装的 `vue-tsc` → 补入 devDependencies
- **Electron 白屏隐患**：窗口加载失败无反馈 → `did-fail-load` 错误页；启动超时弹错误框
- **Android 模板资源冲突**：模板自带 splash 图与矢量前景覆盖品牌图标 → 清理

## 补全的接口

- 接口覆盖清单见 `docs/api-coverage.md`（已实现 94 / 文档收录 234）；
  本版补全构建/打包链路接口能力：Capacitor 原生 HTTP（绕 CORS）在 Android 壳内直连云湖
- 待实现清单（141 个）保留在文档中，按社区文档逐项推进

## UI 改动

- **QQ 式层级**：左侧功能栏按「消息 / 工具 / 系统」三区分组（分隔线断点）；
  重名页去重（设置→群设置、账号→我的账号）
- **调色盘**（QQ 同款入口）：左栏底部弹出面板 —— 15 套预设主题色 + 自定义取色 +
  自定义聊天底图（上传即用）+ 一键恢复默认
- **输入区**：剪贴板直接粘贴图片 / 视频 / 文件即上传发送；快捷回复独立成层（chips），
  与功能工具条分离
- 登录页：品牌 logo + 居中卡片 + 三级阴影 + 入场动画
- 控制台：NavigationView 式左栏（品牌 logo、选中指示条动画）、页面切换入场动效、
  标题栏亚克力模糊吸顶、卡片悬浮抬升
- 聊天：消息入场动画、气泡描边与阴影、会话列表选中细强调线
- Toast：滑入动效 + 三级阴影
- 移动端：触控目标 ≥ 44px、底部安全区内边距、抽屉会话列表

## 构建方式

- **云端（推荐，可复现）**：推送 `v*` tag 触发 `.github/workflows/build-release.yml`；
  Windows job（Node 22 + electron-builder NSIS/zip）、Android job（Node 22 + JDK 21 + Gradle 8.14.3 / AGP 8.13）
- **本地**：Node ≥ 22；Windows 打包 `npm run desktop:pack`；
  Android 需 JDK 21（Capacitor 8 要求）+ Android SDK（compileSdk 36），`npm run android:sync && npm run android:apk`
- 产物命名：`yunhulaoda-<版本>-windows-x64-setup.exe` / `yunhulaoda-<版本>-windows-x64.zip` /
  `yunhulaoda-<版本>-android-arm64.apk`
- **源代码包**：GitHub 在本 Release 页自动附带 Source code (zip) 与 Source code (tar.gz)

## 已知问题

- Windows / Android 产物未做代码签名（首版调试签名），安装时系统可能提示未知来源，需手动允许
- 仓库历史提交中曾包含自签证书私钥（`certs/`），本版已向前删除并忽略；
  历史残留未清洗（如需彻底清除需 force push 重写历史，另行决策）
- 单包 JS 约 520 kB（gzip 176 kB），未做路由级代码分割
- 云湖接口待实现 141 个（见 `docs/api-coverage.md`）
