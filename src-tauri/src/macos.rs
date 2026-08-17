#![cfg(target_os = "macos")]

use tauri::WebviewWindow;

pub fn apply_layer(win: &WebviewWindow, layer: &str) -> Result<(), String> {
    let _ = win.set_ignore_cursor_events(false);
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
