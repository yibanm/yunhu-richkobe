; 云湖牢大版 Windows 安装器（Inno Setup 6，GitHub windows-latest 自带）
; 产物：yunhulaoda-<版本>-windows-x64-setup.exe
#define MyAppName "云湖牢大版"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "yibanm"
#define MyAppExeName "yunhulaoda.exe"
; 独立 AppUserModelID：任务栏/快捷方式与旧版 Electron 客户端彻底隔离
#define MyAppId "com.yunhu.yunhulaoda"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\YunhuLaoda
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=yunhulaoda-{#MyAppVersion}-windows-x64-setup
SetupIconFile=windows\runner\resources\app_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; 语言：windows runner 自带的 Inno Setup 不含非官方中文语言包，
; 故安装向导用默认语言；应用本体界面为中文。
; [Languages] 段刻意省略

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"

[Files]
Source: "build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent
