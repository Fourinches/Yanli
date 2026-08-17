#![cfg(target_os = "macos")]

use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

// https://developer.apple.com/documentation/coregraphics/cgwindowlevel
const DESKTOP_WINDOW_LEVEL: isize = (i32::MIN as isize) + 5 + 20;
const NORMAL_WINDOW_LEVEL: isize = 0;
const FLOATING_WINDOW_LEVEL: isize = 3;

const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const STATIONARY: usize = 1 << 4;
const IGNORES_CYCLE: usize = 1 << 6;
const DESKTOP_BEHAVIOR: usize = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE;

fn with_ns_window(win: &WebviewWindow, apply: impl FnOnce(*mut AnyObject)) {
    if let Ok(ptr) = win.ns_window() {
        apply(ptr as *mut AnyObject);
    }
}

fn set_level(ns_window: *mut AnyObject, level: isize) {
    unsafe {
        let _: () = msg_send![ns_window, setLevel: level];
    }
}

fn set_desktop_behavior(ns_window: *mut AnyObject, enable: bool) {
    unsafe {
        let current: usize = msg_send![ns_window, collectionBehavior];
        let next = if enable {
            current | DESKTOP_BEHAVIOR
        } else {
            current & !DESKTOP_BEHAVIOR
        };
        let _: () = msg_send![ns_window, setCollectionBehavior: next];
    }
}

pub fn apply_layer(win: &WebviewWindow, layer: &str) -> Result<(), String> {
    match layer {
        "desktop" => {
            let _ = win.set_always_on_top(false);
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_skip_taskbar(true);
            let _ = win.set_visible_on_all_workspaces(true);
            with_ns_window(win, |ns| {
                // 壁纸之上、桌面图标之下，点桌面/显示桌面时仍留在原处。
                set_level(ns, DESKTOP_WINDOW_LEVEL + 1);
                set_desktop_behavior(ns, true);
            });
        }
        "top" => {
            with_ns_window(win, |ns| {
                set_desktop_behavior(ns, false);
                set_level(ns, FLOATING_WINDOW_LEVEL);
            });
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(true);
            let _ = win.set_skip_taskbar(true);
        }
        _ => {
            with_ns_window(win, |ns| {
                set_desktop_behavior(ns, false);
                set_level(ns, NORMAL_WINDOW_LEVEL);
            });
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(false);
            let _ = win.set_skip_taskbar(false);
        }
    }
    Ok(())
}
