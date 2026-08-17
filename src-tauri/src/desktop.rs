#![cfg(windows)]

use tauri::{LogicalSize, WebviewWindow};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetParent, SendMessageTimeoutW, SetParent,
    SetWindowPos, HWND_BOTTOM, HWND_NOTOPMOST, HWND_TOPMOST, SMTO_NORMAL, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW,
};
use windows::core::BOOL;
use windows::core::w;

struct FindState {
    worker: HWND,
}

unsafe extern "system" fn find_wallpaper_worker(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let state = &mut *(lparam.0 as *mut FindState);
    if let Ok(def_view) = FindWindowExW(Some(hwnd), None, w!("SHELLDLL_DefView"), None) {
        if !def_view.is_invalid() {
            if let Ok(worker) = FindWindowExW(None, Some(hwnd), w!("WorkerW"), None) {
                if !worker.is_invalid() {
                    state.worker = worker;
                    return BOOL(0);
                }
            }
        }
    }
    BOOL(1)
}

fn window_hwnd(win: &WebviewWindow) -> Result<HWND, String> {
    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    Ok(HWND(hwnd.0))
}

unsafe fn wallpaper_worker() -> Result<HWND, String> {
    let progman = FindWindowW(w!("Progman"), None).map_err(|e| e.to_string())?;
    let mut result = 0usize;
    let _ = SendMessageTimeoutW(
        progman,
        0x052C,
        WPARAM(0xD),
        LPARAM(0x1),
        SMTO_NORMAL,
        1000,
        Some(&mut result),
    );

    let mut state = FindState {
        worker: HWND::default(),
    };
    let _ = EnumWindows(
        Some(find_wallpaper_worker),
        LPARAM(&mut state as *mut FindState as isize),
    );
    if !state.worker.is_invalid() {
        return Ok(state.worker);
    }
    if let Ok(worker) = FindWindowExW(Some(progman), None, w!("WorkerW"), None) {
        if !worker.is_invalid() {
            return Ok(worker);
        }
    }
    Err("找不到桌面壁纸层".into())
}

pub fn attach_to_wallpaper(win: &WebviewWindow) -> Result<(), String> {
    let pos = win.outer_position().ok();
    unsafe {
        let hwnd = window_hwnd(win)?;
        let worker = wallpaper_worker()?;
        SetParent(hwnd, Some(worker)).map_err(|e| e.to_string())?;
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
    let _ = win.set_always_on_top(false);
    if let Some(p) = pos {
        let _ = move_window(win, p.x, p.y);
    }
    Ok(())
}

pub fn detach_from_wallpaper(win: &WebviewWindow) -> Result<(), String> {
    unsafe {
        let hwnd = window_hwnd(win)?;
        SetParent(hwnd, None).map_err(|e| e.to_string())?;
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_NOTOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        );
    }
    Ok(())
}

pub fn apply_layer(win: &WebviewWindow, layer: &str) -> Result<(), String> {
    match layer {
        "desktop" => {
            let _ = win.set_always_on_top(false);
            if attach_to_wallpaper(win).is_err() {
                unsafe {
                    let hwnd = window_hwnd(win)?;
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_BOTTOM),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }
            }
        }
        "top" => {
            let _ = detach_from_wallpaper(win);
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
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
        _ => {
            let _ = detach_from_wallpaper(win);
            let _ = win.set_always_on_top(false);
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
            SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn resize_window(win: &WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    win.set_size(LogicalSize::new(f64::from(width), f64::from(height)))
        .map_err(|e| e.to_string())
}
