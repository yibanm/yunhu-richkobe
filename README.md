# 云湖牢大版（Flutter 重写版）

> 云湖第三方客户端 · **牢大版** · Flutter 单代码库双端（Windows 桌面 / Android）
> QQ 式三栏布局 · Material 3 · 调色盘（主题色 / 聊天底图自定义）

> 仅供 **学习交流**。接口来自社区公开整理：
> [yh-Tpdev/yhchatAPI](https://github.com/yh-Tpdev/yhchatAPI)（在线 <https://yh-api.yyyyt.top>）。
> 只使用 **你自己的账号 token**。

---

## 一、与上游的关系（独立性与鸣谢）

本项目**功能与协议设计参考**自 [FLY1919/yunhu-vue](https://github.com/FLY1919/yunhu-vue)，
但为 **clean-room 独立重写**：未复制其任何源码，技术栈完全不同（Flutter/Dart vs Vue/TS/Electron/Capacitor）。
旧版（Vue/Electron/Capacitor 实现）整体保留在 [`legacy/`](legacy/) 目录，仅作功能参考与鸣谢凭据，不参与构建。

> ⚖️ **许可说明**：上游 yunhu-vue **未附带开源许可证**，README 声明「仅供学习交流」。
> 因此本项目不复制其代码、不就上游代码主张权利；云湖接口为第三方私有服务，
> 使用须遵守云湖用户协议。**请勿将本客户端用于商业用途或违反服务条款的场景。**

## 二、获取

| 平台 | 产物 |
|---|---|
| Windows x64 | `yunhulaoda-<版本>-windows-x64.zip`（便携版，解压即用） |
| Android arm64 | `yunhulaoda-<版本>-android-arm64.apk` |

见 [Releases](../../releases)。GitHub 在本页自动附带 Source code (zip/tar.gz)。

## 三、界面（QQ 式）

```
┌──┬──────────┬──────────────────────────────┐
│头│ 搜索     │  会话标题              ID    │
│像├──────────┼──────────────────────────────┤
│消│ 会话 1   │                              │
│息│ 会话 2 ● │        消息流（可铺底图）      │
│通│ 会话 3   │                              │
│录├────────────────────────────────────────┤
│设│          │  [输入消息，Enter 发送] [发送] │
│置│          │                              │
││          │                              │
│ⓘ│          │                              │
└──┴──────────┴──────────────────────────────┘
```

- **左功能栏**：头像 / 消息 / 通讯录 / 设置 / **调色盘** / **关于**（对应 QQ 竖条层级）
- **中栏**：会话列表（搜索、未读角标、@提醒加粗）
- **右栏**：聊天主区（标题栏 / 消息流 / 输入区）
- **调色盘**：8 套预设主题色 + HSL 自定义取色 + 自定义聊天底图（URL）+ 清除
- **关于页**：本项目作者信息 + 对上游作者 FLY1919 的鸣谢 + 许可声明

## 四、身份独立（与旧版/他应用零冲突）

- Windows：exe 名 `yunhulaoda.exe`（ASCII）、窗口类 `YunhuLaoda_MainWindow`、
  AppUserModelID `com.yunhu.yunhulaoda` —— 任务栏分组、快捷方式解析与旧版 Electron 客户端完全隔离
- Android：包名 `com.yunhu.kobe`、应用名 `yhchat kobe`、品牌自适应图标
- 数据目录独立（Flutter 应用沙箱），不与任何 `yunhu-vue` 系应用共享

## 五、构建

本地环境：Flutter 3.35+（stable）。

```bash
flutter pub get
flutter run -d windows            # Windows 开发态（需 VS「使用 C++ 的桌面开发」工作负载）
flutter build windows --release   # Windows 产物：build/windows/x64/runner/Release/
flutter build apk --release --split-per-abi --target-platform android-arm64
```

> Windows 本地编译需要 Visual Studio「Desktop development with C++」工作负载
> （含 C++ CMake 工具与 Windows SDK）；无管理员权限的机器建议直接用云端 CI 产物。

云端构建（可复现）：推送 `v*` tag 触发 `.github/workflows/build-release.yml`，
Windows / Android 双 job 构建后自动发布 Release 并按规范重命名产物。

## 六、目录

```
├── lib/
│   ├── main.dart              # 入口 + 主题（M3 + 自定义强调色/底图）
│   ├── core/pb.dart           # protobuf wire 编解码（clean-room，跳过废弃 group 字段）
│   ├── core/api.dart          # 云湖 v1 接口封装（token 头 / protobuf 体 / 20s 超时）
│   ├── core/ws.dart           # 实时通道（JSON 帧：login / heartbeat / push_*）
│   ├── state/app_state.dart   # 全局状态（登录态 / 会话 / 消息 / 主题持久化）
│   └── ui/                    # 登录 / QQ 式主页 / 聊天区 / 调色盘 / 关于
├── windows/ android/          # Flutter 平台壳（独立身份配置）
├── assets/brand.jpg           # 品牌图
├── legacy/                    # 旧版 Vue/Electron/Capacitor 实现（仅参考，不构建）
└── test/widget_test.dart      # wire 编解码往返 + 废弃字段跳过 单测
```

## 七、鸣谢

- **FLY1919**（[yunhu-vue](https://github.com/FLY1919/yunhu-vue)）：功能蓝图与云湖接口行为的公开整理
- 云湖接口文档社区：[yh-Tpdev/yhchatAPI](https://github.com/yh-Tpdev/yhchatAPI)
