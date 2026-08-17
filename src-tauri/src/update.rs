use serde::Serialize;
use std::fs;
use std::process::Command;
use tauri::AppHandle;

const CURRENT: &str = env!("CARGO_PKG_VERSION");
const LATEST_PAGE: &str = "https://github.com/Fourinches/Yanli/releases/latest";
const RELEASE_ATOM: &str = "https://github.com/Fourinches/Yanli/releases.atom";

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

fn download_url(tag: &str) -> String {
    format!(
        "https://github.com/Fourinches/Yanli/releases/download/v{}/{}",
        tag.trim_start_matches('v'),
        asset_name()
    )
}

fn tag_from_url(url: &str) -> Option<String> {
    let tag = url.rsplit("/tag/").nth(0)?.trim().trim_start_matches('v');
    parse_version(tag)?;
    Some(tag.to_string())
}

fn tag_from_atom(xml: &str) -> Option<String> {
    let entry = xml.split("<entry>").nth(1)?;
    let title = entry.split("<title>").nth(1)?.split("</title>").next()?.trim();
    let tag = title.trim_start_matches('v');
    parse_version(tag)?;
    Some(tag.to_string())
}

async fn latest_tag() -> Result<String, String> {
    let ua = format!("YanliCalendar/{CURRENT}");
    let page = client(15)?
        .get(LATEST_PAGE)
        .header("User-Agent", ua.as_str())
        .send()
        .await;
    if let Ok(res) = page {
        if res.status().is_success() {
            if let Some(tag) = tag_from_url(res.url().as_str()) {
                return Ok(tag);
            }
        }
    }

    let atom = client(15)?
        .get(RELEASE_ATOM)
        .header("User-Agent", ua)
        .send()
        .await
        .map_err(|_| "暂时无法检查更新".to_string())?;
    if !atom.status().is_success() {
        return Err("暂时无法检查更新".into());
    }
    let xml = atom.text().await.map_err(|_| "暂时无法检查更新".to_string())?;
    tag_from_atom(&xml).ok_or_else(|| "暂时无法检查更新".into())
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let latest = latest_tag().await?;
    let url = download_url(&latest);
    let available = is_newer(&latest, CURRENT) && valid_download(&url);
    Ok(UpdateInfo {
        current: CURRENT.to_string(),
        latest,
        notes: String::new(),
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
