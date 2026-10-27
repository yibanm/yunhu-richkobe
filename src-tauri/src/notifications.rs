//! Windows 10/11 原生 WinRT Toast；只处理运行中客户端的消息通知。
//! 不通过 PowerShell 弹窗，不使用浏览器 Notification 冒充 Windows 通知。
#[cfg(windows)]
mod platform {
    use std::{collections::HashMap, sync::{Mutex, OnceLock}};
    use tauri::{AppHandle, Emitter, Manager};
    use windows::{
        core::{HSTRING, IInspectable, Interface, PROPVARIANT},
        Data::Xml::Dom::XmlDocument,
        Foundation::TypedEventHandler,
        UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager},
        Win32::{
            Foundation::RPC_E_CHANGED_MODE,
            Storage::EnhancedStorage::PKEY_AppUserModel_ID,
            System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
            UI::Shell::{IShellLinkW, ShellLink, SetCurrentProcessExplicitAppUserModelID,
                PropertiesSystem::IPropertyStore},
        },
    };
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    const APP_ID: &str = "com.richkobe.yunhulaoda";
    const GROUP: &str = "messages";
    static TOASTS: OnceLock<Mutex<HashMap<String, ToastNotification>>> = OnceLock::new();
    fn toasts() -> &'static Mutex<HashMap<String, ToastNotification>> {
        TOASTS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    struct ComGuard(bool);
    impl ComGuard {
        fn enter() -> Result<Self, String> {
            match unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() } {
                Ok(()) => Ok(Self(true)),
                Err(error) if error.code() == RPC_E_CHANGED_MODE => Ok(Self(false)),
                Err(error) => Err(error.to_string()),
            }
        }
    }
    impl Drop for ComGuard {
        fn drop(&mut self) { if self.0 { unsafe { CoUninitialize(); } } }
    }

    // 安装版与便携版共用同一应用身份。只写当前用户，不需要管理员权限。
    fn register() -> Result<(), String> {
        static REGISTERED: OnceLock<Result<(), String>> = OnceLock::new();
        REGISTERED.get_or_init(|| {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
                .create_subkey(format!(r"Software\Classes\AppUserModelId\{APP_ID}"))
                .map_err(|e| e.to_string())?;
            key.set_value("DisplayName", &"云湖牢大版").map_err(|e| e.to_string())?;
            let icon_dir = std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA"))
                .ok_or("无法读取用户应用目录")?;
            let icon_dir = std::path::PathBuf::from(icon_dir).join("YunhuLaoda");
            std::fs::create_dir_all(&icon_dir).map_err(|e| e.to_string())?;
            let icon = icon_dir.join("notification-icon.png");
            std::fs::write(&icon, include_bytes!("../icons/icon.png")).map_err(|e| e.to_string())?;
            key.set_value("IconUri", &icon.to_string_lossy().as_ref()).map_err(|e| e.to_string())?;
            // Win32 Toast 还需要开始菜单快捷方式上的 AUMID。便携版也补齐此身份。
            let programs = std::env::var_os("APPDATA").ok_or("无法读取用户应用目录")?;
            let shortcut = std::path::PathBuf::from(programs)
                .join(r"Microsoft\Windows\Start Menu\Programs\云湖牢大版.lnk");
            if let Some(parent) = shortcut.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            unsafe {
                SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(APP_ID)).map_err(|e| e.to_string())?;
                let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|e| e.to_string())?;
                link.SetPath(&HSTRING::from(exe.as_path())).map_err(|e| e.to_string())?;
                link.SetDescription(&HSTRING::from("云湖牢大版")).map_err(|e| e.to_string())?;
                link.SetIconLocation(&HSTRING::from(exe.as_path()), 0).map_err(|e| e.to_string())?;
                if let Some(parent) = exe.parent() {
                    link.SetWorkingDirectory(&HSTRING::from(parent)).map_err(|e| e.to_string())?;
                }
                let props: IPropertyStore = link.cast().map_err(|e| e.to_string())?;
                props.SetValue(&PKEY_AppUserModel_ID, &PROPVARIANT::from(APP_ID)).map_err(|e| e.to_string())?;
                props.Commit().map_err(|e| e.to_string())?;
                let file: IPersistFile = link.cast().map_err(|e| e.to_string())?;
                file.Save(&HSTRING::from(shortcut.as_path()), true).map_err(|e| e.to_string())?;
            }
            // 上次进程退出后已无法点击定位的旧通知不继续留在通知中心。
            if let Ok(history) = ToastNotificationManager::History() {
                let _ = history.RemoveGroupWithId(&HSTRING::from(GROUP), &HSTRING::from(APP_ID));
            }
            Ok(())
        }).clone()
    }

    fn xml_text(text: &str, limit: usize) -> String {
        text.chars().filter(|c| matches!(*c, '\n' | '\r' | '\t') || (*c >= ' ' && !matches!(*c, '\u{fffe}' | '\u{ffff}')))
            .take(limit).collect::<String>()
            .replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
    }

    pub fn show(app: AppHandle, id: String, title: String, body: String) -> Result<(), String> {
        if id.is_empty() || id.len() > 16 || !id.bytes().all(|b| b.is_ascii_alphanumeric()) {
            return Err("通知标识无效".into());
        }
        let _com = ComGuard::enter()?;
        register()?;
        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)).map_err(|e| e.to_string())?;
        if notifier.Setting().map_err(|e| e.to_string())? != NotificationSetting::Enabled {
            return Err("Windows 已关闭此应用的系统通知，请在系统设置中启用".into());
        }
        let xml = XmlDocument::new().map_err(|e| e.to_string())?;
        xml.LoadXml(&HSTRING::from(format!(
            "<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
            xml_text(&title, 120), xml_text(&body, 500)
        ))).map_err(|e| e.to_string())?;
        let toast = ToastNotification::CreateToastNotification(&xml).map_err(|e| e.to_string())?;
        toast.SetTag(&HSTRING::from(&id)).map_err(|e| e.to_string())?;
        toast.SetGroup(&HSTRING::from(GROUP)).map_err(|e| e.to_string())?;
        let clicked_id = id.clone();
        let clicked_app = app.clone();
        toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(move |_, _| {
            // 已被静音/退出登录/切换模式清掉的旧通知不能再激活。
            let active = toasts().lock().map(|items| items.contains_key(&clicked_id)).unwrap_or(false);
            if active {
                let handle = clicked_app.clone();
                let id = clicked_id.clone();
                let _ = clicked_app.run_on_main_thread(move || {
                    if !toasts().lock().map(|items| items.contains_key(&id)).unwrap_or(false) { return; }
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.unminimize();
                        let _ = win.show();
                        let _ = win.set_focus();
                        let _ = win.emit("message-notification-activated", id);
                    }
                });
            }
            Ok(())
        })).map_err(|e| e.to_string())?;
        let failed_id = id.clone();
        toast.Failed(&TypedEventHandler::new(move |_, _| {
            let _ = app.emit_to("main", "message-notification-failed", serde_json::json!({
                "id": failed_id, "error": "Windows 无法显示通知"
            }));
            Ok(())
        })).map_err(|e| e.to_string())?;
        // 持有 Toast 及其事件回调，保留通知中心中超时横幅的点击能力。
        toasts().lock().map_err(|_| "通知状态不可用")?.insert(id.clone(), toast.clone());
        if let Err(error) = notifier.Show(&toast) {
            let _ = dismiss(&id);
            return Err(error.to_string());
        }
        Ok(())
    }

    pub fn dismiss(id: &str) -> Result<(), String> {
        let _com = ComGuard::enter()?;
        let toast = toasts().lock().map_err(|_| "通知状态不可用")?.remove(id);
        if let Some(toast) = toast {
            if let Ok(notifier) = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)) {
                let _ = notifier.Hide(&toast);
            }
            if let Ok(history) = ToastNotificationManager::History() {
                history.RemoveGroupedTagWithId(&HSTRING::from(id), &HSTRING::from(GROUP), &HSTRING::from(APP_ID))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn clear() {
        let ids = toasts().lock().map(|items| items.keys().cloned().collect::<Vec<_>>()).unwrap_or_default();
        for id in ids { let _ = dismiss(&id); }
    }
}

#[tauri::command]
pub fn native_notifications_supported() -> bool { cfg!(windows) }

#[tauri::command]
pub fn show_message_notification(window: tauri::WebviewWindow, id: String, title: String, body: String) -> Result<(), String> {
    if window.label() != "main" { return Err("通知来源无效".into()); }
    #[cfg(windows)]
    { use tauri::Manager; platform::show(window.app_handle().clone(), id, title, body) }
    #[cfg(not(windows))]
    { let _ = (id, title, body); Err("仅 Windows 桌面版支持系统通知".into()) }
}

#[tauri::command]
pub fn dismiss_message_notification(window: tauri::WebviewWindow, id: String) -> Result<(), String> {
    if window.label() != "main" { return Err("通知来源无效".into()); }
    #[cfg(windows)]
    { platform::dismiss(&id) }
    #[cfg(not(windows))]
    { let _ = id; Ok(()) }
}

#[tauri::command]
pub fn clear_message_notifications(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("通知来源无效".into()); }
    clear();
    Ok(())
}

pub fn clear() {
    #[cfg(windows)]
    platform::clear();
}
