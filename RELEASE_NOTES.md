# 云湖牢大版 v1.0.0（Flutter 重写版 · 首版）

**彻底独立的重写版**：技术栈从 Vue/Electron/Capacitor 全面切换为 **Flutter 单代码库**，
clean-room 实现（未复制上游任何源码），旧版整体保留在 `legacy/` 仅作参考与鸣谢凭据。

## 关键更改

- **全新 Flutter 工程**（`lib/`）：Material 3 + QQ 式三栏布局（功能栏/会话列表/聊天主区）
- **协议层 clean-room 重写**（Dart）：protobuf wire 编解码（含废弃 group 字段跳过）、
  云湖 v1 接口封装、JSON 帧实时通道（login/heartbeat/push_*）
- **不再需要本地反代服务器**：Flutter 原生 HTTP 无 CORS 限制，架构比旧版少一层
- **身份彻底独立**（解决「装了自家应用却打开原版」问题）：
  exe `yunhulaoda.exe`、窗口类 `YunhuLaoda_MainWindow`、
  AppUserModelID `com.yunhu.yunhulaoda`、Android 包名 `com.yunhu.kobe`；
  与旧版 Electron 客户端及任何 yunhu-vue 系应用零共享
- **QQ 式功能映射**：消息/通讯录/设置竖栏 + 会话列表（搜索/未读角标/@加粗）+ 聊天主区
- **调色盘**：8 套预设主题色 + HSL 自定义取色 + 自定义聊天底图 + 清除（持久化）
- **关于页**：本项目作者 + 鸣谢上游作者 FLY1919 + 许可声明

## 修复的 bug（继承自旧版教训）

- 启动黑屏/闪退类问题在架构上消除：Flutter 无 WebView 渲染链路；
  启动失败由 Flutter 错误边界接管，不再出现无反馈黑屏
- Windows 身份冲突：独立 AppUserModelID/窗口类/exe 名，多版本共存互不干扰

## 补全的接口

首版覆盖核心链路：登录、会话列表、消息拉取/发送/撤回、群信息/成员、账号信息；
其余接口（表情/通讯录/机器人/板块/WebDAV 等）按 `legacy/docs/api-coverage.md`
清单在后续版本接入（协议事实已固化在 `lib/core/api.dart` 字段表）。

## UI 改动

- QQ 式三栏 + M3 卡片/圆角/阴影层级
- 登录页品牌卡片；聊天区支持底图；深浅色主题
- 品牌图标：Android 自适应图标 + 启动图标（mipmap 全密度）

## 构建方式

- **云端（推荐）**：推送 `v*` tag → `.github/workflows/build-release.yml`
  （windows-latest / ubuntu-latest + subosito/flutter-action，可复现）
- **本地**：Flutter 3.35+；Windows 需 VS「Desktop development with C++」工作负载；
  Android 需 JDK 17+ 与 Android SDK
- 产物命名：`yunhulaoda-<版本>-windows-x64.zip` / `yunhulaoda-<版本>-android-arm64.apk`
- 源代码包：GitHub Release 页自动附带

## 已知问题

- Windows 安装版为 Inno Setup 打包（CI 生成）；未代码签名
- 通讯录/表情/机器人/板块/WebDAV/快捷回复等模块首版未接入（见上）
- 上游无开源许可证：本项目 clean-room 重写、不复制代码；仅供学习交流，勿商用
