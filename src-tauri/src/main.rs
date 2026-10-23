// 云湖牢大版 Tauri 壳：
//   · 启动时拉起 sidecar（resources/node.exe + resources/server-bundle.mjs），
//     环境变量 YH_ROOT 指向资源目录（server 从那里读 dist/config/certs）
//   · 等 127.0.0.1:8902 可连接后创建主窗口加载 http://127.0.0.1:8902
//     （与 Electron 版同模型：前端零改动，全部接口走同源代理）
//   · 托盘图标 + 主窗口销毁时杀掉 sidecar 子进程
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

const PORT: u16 = 8902;

/// sidecar 子进程句柄：用全局 static 持有，避开 Tauri State 在
/// on_window_event 闭包里的生命周期问题（E0597）
static SIDECAR: std::sync::OnceLock<Mutex<Option<Child>>> = std::sync::OnceLock::new();
fn sidecar_slot() -> &'static Mutex<Option<Child>> {
    SIDECAR.get_or_init(|| Mutex::new(None))
}

fn wait_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 先 clone handle 再进闭包/线程，避免借用冲突
            let handle = app.handle().clone();

            // 资源目录（安装后 = 安装目录/resources）
            let res = handle
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap());
            let node = res.join("node.exe");
            let bundle = res.join("server-bundle.mjs");

            // 拉起 sidecar（端口已被占用时复用现有实例，避免双开冲突）
            if !wait_port(PORT, Duration::from_millis(300)) {
                match Command::new(&node)
                    .arg(&bundle)
                    .env("YH_ROOT", &res)
                    .env("PORT", PORT.to_string())
                    .spawn()
                {
                    Ok(child) => {
                        if let Ok(mut guard) = sidecar_slot().lock() {
                            *guard = Some(child);
                        }
                    }
                    Err(e) => eprintln!("[tauri] sidecar 启动失败: {e}"),
                }
            }

            // 等服务就绪（最多 20s）后在主线程建窗口
            let win_handle = handle.clone();
            std::thread::spawn(move || {
                let ready = wait_port(PORT, Duration::from_secs(20));
                let url = format!("http://127.0.0.1:{PORT}");
                let inner = win_handle.clone();
                let _ = win_handle.run_on_main_thread(move || {
                    let mut builder = WebviewWindowBuilder::new(
                        &inner,
                        "main",
                        WebviewUrl::External(url.parse().expect("bad sidecar url")),
                    )
                    .title("云湖牢大版")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(900.0, 600.0);
                    if !ready {
                        builder = builder.title("云湖牢大版（服务启动中…）");
                    }
                    if let Ok(win) = builder.build() {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                });
            });

            // 托盘：复用 bundle 的窗口图标
            let icon = handle
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| Image::new(&[], 0, 0));
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("云湖牢大版")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // 主窗口关闭 = 退出应用并清理 sidecar
                if let Ok(mut guard) = sidecar_slot().lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
