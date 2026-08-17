use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::Command;
use tauri::AppHandle;

const CURRENT: &str = env!("CARGO_PKG_VERSION");
const RELEASES: &str = "https://api.github.com/repos/Fourinches/Yanli/releases/latest";

#[derive(Serialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub notes: String,
    pub url: String,
    pub available: bool,
}

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

fn parse_version(tag: &str) -> Option<(u32, u32, u32)> {
    let text = tag.trim().trim_start_matches('v');
    let mut parts = text.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
    ))
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_version(latest), parse_version(current)) {
        (Some(next), Some(now)) => next > now,
        _ => false,
    }
}

fn asset_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "Yanli_macos_universal.dmg"
    } else {
        "Yanli_windows_x64-setup.exe"
    }
}

fn valid_download(url: &str) -> bool {
    url.starts_with("https://github.com/Fourinches/Yanli/releases/download/")
}

fn asset_url(data: &Value) -> String {
    data["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|item| item["name"].as_str() == Some(asset_name()))
        .and_then(|item| item["browser_download_url"].as_str())
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let res = client(8)?
        .get(RELEASES)
        .header("User-Agent", format!("YanliCalendar/{CURRENT}"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err("暂时无法检查更新".into());
    }
    let data = res.json::<Value>().await.map_err(|e| e.to_string())?;
    let latest = data["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    let notes = data["body"].as_str().unwrap_or("").trim().to_string();
    let url = asset_url(&data);
    let available = !latest.is_empty() && is_newer(&latest, CURRENT) && valid_download(&url);
    Ok(UpdateInfo {
        current: CURRENT.to_string(),
        latest,
        notes,
        url,
        available,
    })
}

#[tauri::command]
pub async fn download_update(url: String) -> Result<String, String> {
    if !valid_download(&url) {
        return Err("更新地址无效".into());
    }
    let res = client(120)?
        .get(&url)
        .header("User-Agent", format!("YanliCalendar/{CURRENT}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err("下载更新失败".into());
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let path = std::env::temp_dir().join(asset_name());
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    if path.is_empty() || !std::path::Path::new(&path).exists() {
        return Err("安装包不存在".into());
    }
    #[cfg(windows)]
    Command::new(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = path;
        return Err("当前系统暂不支持应用内更新".into());
    }
    app.exit(0);
    Ok(())
}
