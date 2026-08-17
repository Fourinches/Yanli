#![cfg(target_os = "macos")]

use objc2::msg_send;
use objc2::runtime::AnyObject;
use tauri::WebviewWindow;

unsafe extern "C" {
    fn CGWindowLevelForKey(key: i32) -> i32;
}

const DESKTOP_WINDOW_KEY: i32 = 2;
const NORMAL_WINDOW_KEY: i32 = 4;
const FLOATING_WINDOW_KEY: i32 = 5;

const CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
const STATIONARY: u64 = 1 << 4;
const IGNORES_CYCLE: u64 = 1 << 6;
const DESKTOP_BEHAVIOR: u64 = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE;

fn with_ns_window(win: &WebviewWindow, apply: impl FnOnce(*mut AnyObject)) {
    if let Ok(ptr) = win.ns_window() {
        apply(ptr as *mut AnyObject);
    }
}

fn set_level(ns_window: *mut AnyObject, key: i32, offset: i32) {
    unsafe {
        let level = isize::from(CGWindowLevelForKey(key) + offset);
        let _: () = msg_send![ns_window, setLevel: level];
    }
}

fn set_desktop_behavior(ns_window: *mut AnyObject, enable: bool) {
    unsafe {
        let current: u64 = msg_send![ns_window, collectionBehavior];
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
                set_level(ns, DESKTOP_WINDOW_KEY, 1);
                set_desktop_behavior(ns, true);
            });
        }
        "top" => {
            with_ns_window(win, |ns| {
                set_desktop_behavior(ns, false);
                set_level(ns, FLOATING_WINDOW_KEY, 0);
            });
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(true);
            let _ = win.set_skip_taskbar(true);
        }
        _ => {
            with_ns_window(win, |ns| {
                set_desktop_behavior(ns, false);
                set_level(ns, NORMAL_WINDOW_KEY, 0);
            });
            let _ = win.set_always_on_bottom(false);
            let _ = win.set_always_on_top(false);
            let _ = win.set_skip_taskbar(false);
        }
    }
    Ok(())
}
