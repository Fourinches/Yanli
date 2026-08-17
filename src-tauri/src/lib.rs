use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
#[cfg(not(windows))]
use tauri_plugin_autostart::ManagerExt;

mod cma;
#[cfg(windows)]
mod desktop;

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn main_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "窗口不存在".into())
}

#[cfg(target_os = "macos")]
fn apply_mac_layer(win: &tauri::WebviewWindow, layer: &str) -> Result<(), String> {
    match layer {
        "desktop" => {
            let _ = win.set_always_on_top(false);
            let _ = win.set_always_on_bottom(true);
            let _ = win.set_skip_taskbar(true);
            let _ = win.set_visible_on_all_workspaces(true);
        }
        "top" => {
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(true);
            let _ = win.set_skip_taskbar(true);
        }
        _ => {
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(false);
            let _ = win.set_skip_taskbar(false);
        }
    }
    Ok(())
}

#[tauri::command]
fn set_window_layer(app: tauri::AppHandle, layer: String) -> Result<(), String> {
    let win = main_window(&app)?;
    #[cfg(windows)]
    desktop::apply_layer(&win, &layer)?;
    #[cfg(target_os = "macos")]
    apply_mac_layer(&win, &layer)?;
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = win.set_always_on_top(layer == "top");
    }
    Ok(())
}

#[tauri::command]
fn move_window(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    let win = main_window(&app)?;
    #[cfg(windows)]
    return desktop::move_window(&win, x, y);
    #[cfg(not(windows))]
    win.set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_window(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    let win = main_window(&app)?;
    #[cfg(windows)]
    return desktop::resize_window(&win, width, height);
    #[cfg(not(windows))]
    win.set_size(tauri::LogicalSize::new(f64::from(width), f64::from(height)))
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn run_key() -> Result<winreg::RegKey, String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .map(|(key, _)| key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let _ = app;
        const NAME: &str = "YanliCalendar";
        let key = run_key()?;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            key.set_value(NAME, &format!("\"{}\"", exe.display()))
                .map_err(|e| e.to_string())?;
        } else {
            let _ = key.delete_value(NAME);
        }
        return Ok(enabled);
    }
    #[cfg(not(windows))]
    {
        if enabled {
            app.autolaunch().enable().map_err(|e| e.to_string())?;
        } else {
            app.autolaunch().disable().map_err(|e| e.to_string())?;
        }
        Ok(enabled)
    }
}

#[tauri::command]
fn is_autostart_on(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let _ = app;
        const NAME: &str = "YanliCalendar";
        let key = run_key()?;
        let value: Result<String, _> = key.get_value(NAME);
        return Ok(value.is_ok());
    }
    #[cfg(not(windows))]
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            set_window_layer,
            move_window,
            resize_window,
            hide_to_tray,
            quit_app,
            set_autostart,
            is_autostart_on,
            cma::cma_get
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示日历", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let today = MenuItem::with_id(app, "today", "回到今天", true, None::<&str>)?;
            let desktop = MenuItem::with_id(app, "desktop", "贴在壁纸上", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "隐藏到托盘", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出砚历", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&show, &today, &settings, &sep, &desktop, &hide, &sep, &quit],
            )?;

            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("砚历 · 桌面日历")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "today" => {
                        show_main(app);
                        let _ = app.emit("yanli://today", ());
                    }
                    "settings" => {
                        show_main(app);
                        let _ = app.emit("yanli://settings", ());
                    }
                    "desktop" => {
                        if let Ok(win) = main_window(app) {
                            #[cfg(windows)]
                            let _ = desktop::apply_layer(&win, "desktop");
                            #[cfg(target_os = "macos")]
                            let _ = apply_mac_layer(&win, "desktop");
                            let _ = app.emit("yanli://layer", "desktop");
                        }
                        show_main(app);
                    }
                    "hide" => {
                        let _ = hide_to_tray(app.clone());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                let handle = app.handle().clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(main) = handle.get_webview_window("main") {
                            let _ = main.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动砚历失败");
}
