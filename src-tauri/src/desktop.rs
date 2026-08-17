#![cfg(windows)]

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{LogicalSize, WebviewWindow};
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_SYSTEMBACKDROP_TYPE, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMSBT_NONE, DWMWCP_DONOTROUND,
};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::WindowsAndMessaging::{
    GetParent, SetParent, SetWindowPos, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
};

static LAST_SINK: Mutex<Option<Instant>> = Mutex::new(None);

fn mark_sunk() {
    if let Ok(mut last) = LAST_SINK.lock() {
        *last = Some(Instant::now());
    }
}

fn recently_sunk() -> bool {
    LAST_SINK
        .lock()
        .ok()
        .and_then(|last| *last)
        .is_some_and(|prev| prev.elapsed() < Duration::from_millis(400))
}

fn window_hwnd(win: &WebviewWindow) -> Result<HWND, String> {
    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    Ok(HWND(hwnd.0))
}

pub fn clear_system_backdrop(win: &WebviewWindow) {
    if let Ok(hwnd) = window_hwnd(win) {
        unsafe {
            let backdrop = DWMSBT_NONE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_SYSTEMBACKDROP_TYPE,
                &backdrop as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&backdrop) as u32,
            );
            let corners = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &corners as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&corners) as u32,
            );
        }
    }
}

fn send_to_bottom(win: &WebviewWindow) -> Result<(), String> {
    unsafe {
        let hwnd = window_hwnd(win)?;
        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn keep_bottom(win: &WebviewWindow) {
    if recently_sunk() {
        return;
    }
    mark_sunk();
    let _ = send_to_bottom(win);
}

pub fn detach_from_wallpaper(win: &WebviewWindow) -> Result<(), String> {
    unsafe {
        let hwnd = window_hwnd(win)?;
        if let Ok(parent) = GetParent(hwnd) {
            if !parent.is_invalid() {
                SetParent(hwnd, None).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub fn apply_layer(win: &WebviewWindow, layer: &str) -> Result<(), String> {
    clear_system_backdrop(win);
    let _ = detach_from_wallpaper(win);
    match layer {
        "desktop" => {
            let _ = win.set_always_on_top(false);
            mark_sunk();
            send_to_bottom(win)?;
        }
        "top" => {
            let _ = win.set_always_on_top(true);
            unsafe {
                let hwnd = window_hwnd(win)?;
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
        _ => {
            let _ = win.set_always_on_top(false);
            unsafe {
                let hwnd = window_hwnd(win)?;
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_NOTOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
        }
    }
    Ok(())
}

pub fn move_window(win: &WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    unsafe {
        let hwnd = window_hwnd(win)?;
        let mut point = POINT { x, y };
        if let Ok(parent) = GetParent(hwnd) {
            if !parent.is_invalid() {
                let _ = ScreenToClient(parent, &mut point);
            }
        }
        SetWindowPos(
            hwnd,
            None,
            point.x,
            point.y,
            0,
            0,
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn resize_window(win: &WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    win.set_size(LogicalSize::new(f64::from(width), f64::from(height)))
        .map_err(|e| e.to_string())
}
