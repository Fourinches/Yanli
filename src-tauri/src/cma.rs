use serde_json::{json, Value};

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())
}

async fn get_json(url: &str, referer: &str, query: &[(&str, &str)]) -> Result<Value, String> {
    let res = client()?
        .get(url)
        .query(query)
        .header("User-Agent", UA)
        .header("Referer", referer)
        .header("Accept", "application/json,text/plain,*/*")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("气象台返回 {}", res.status()));
    }
    res.json::<Value>().await.map_err(|e| e.to_string())
}

async fn get_bytes(url: &str, referer: &str) -> Result<Vec<u8>, String> {
    let res = client()?
        .get(url)
        .header("User-Agent", UA)
        .header("Referer", referer)
        .header("Accept", "image/jpeg,image/png,image/*,*/*")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("气象台返回 {}", res.status()));
    }
    res.bytes().await.map_err(|e| e.to_string()).map(|b| b.to_vec())
}

async fn get_text(url: &str, referer: &str) -> Result<String, String> {
    let res = client()?
        .get(url)
        .header("User-Agent", UA)
        .header("Referer", referer)
        .header("Accept", "application/json,text/javascript,*/*")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("气象台返回 {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

fn parse_jsonp(raw: &str) -> Result<Value, String> {
    let start = raw.find('{').ok_or("台风数据无效")?;
    let end = raw.rfind('}').ok_or("台风数据无效")?;
    if end <= start {
        return Err("台风数据无效".into());
    }
    serde_json::from_str(&raw[start..=end]).map_err(|e| e.to_string())
}

fn typhoon_id(row: &Value) -> Option<String> {
    let id = row.get(0)?;
    if let Some(n) = id.as_u64() {
        return Some(n.to_string());
    }
    if let Some(n) = id.as_i64() {
        return Some(n.to_string());
    }
    id.as_str().filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())).map(str::to_string)
}

fn typhoon_ids(list: &Value) -> Vec<String> {
    let Some(rows) = list.get("typhoonList").and_then(Value::as_array) else {
        return Vec::new();
    };
    rows.iter()
        .filter(|row| {
            row.as_array()
                .and_then(|cols| cols.last())
                .and_then(Value::as_str)
                .is_some_and(|status| status != "stop")
        })
        .filter_map(typhoon_id)
        .take(3)
        .collect()
}

fn valid_station(id: &str) -> bool {
    (3..=8).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric())
}

fn valid_query(q: &str) -> bool {
    let trimmed = q.trim();
    (1..=20).contains(&trimmed.chars().count())
        && !trimmed.chars().any(|c| c.is_control() || c == '&' || c == '?')
}

#[tauri::command]
pub async fn cma_get(kind: String, q: String) -> Result<Value, String> {
    match kind.as_str() {
        "now" => {
            if !valid_station(&q) {
                return Err("站点无效".into());
            }
            let referer = format!("https://weather.cma.cn/web/weather/{q}.html");
            let now = get_json(&format!("https://weather.cma.cn/api/now/{q}"), &referer, &[]).await?;
            let weather = get_json(
                &format!("https://weather.cma.cn/api/weather/{q}"),
                &referer,
                &[],
            )
            .await
            .ok();
            Ok(json!({ "now": now, "weather": weather }))
        }
        "search" => {
            if !valid_query(&q) {
                return Err("搜索词无效".into());
            }
            let query = q.trim().to_string();
            let raw = get_json(
                "https://weather.cma.cn/api/autocomplete",
                "https://weather.cma.cn/",
                &[("q", query.as_str())],
            )
            .await?;
            Ok(json!({ "data": enrich_places(&raw).await }))
        }
        "typhoon" => {
            let referer = "https://typhoon.nmc.cn/";
            let list = parse_jsonp(
                &get_text(
                    "https://typhoon.nmc.cn/weatherservice/typhoon/jsons/list_default",
                    referer,
                )
                .await?,
            )?;
            let ids = typhoon_ids(&list);
            let mut views = Vec::new();
            for id in ids {
                let url = format!("https://typhoon.nmc.cn/weatherservice/typhoon/jsons/view_{id}");
                if let Ok(view) = get_text(&url, referer).await.and_then(|raw| parse_jsonp(&raw)) {
                    views.push(view);
                }
            }
            Ok(json!({
                "list": list,
                "views": views,
                "chart": typhoon_chart().await.unwrap_or_default(),
                "page": "https://www.nmc.cn/publish/typhoon/probability-img2.html",
            }))
        }
        _ => Err("未知请求".into()),
    }
}

fn extract_typhoon_chart(html: &str) -> Option<String> {
    let key = "https://image.nmc.cn/product/";
    let mut from = 0;
    while let Some(rel) = html[from..].find(key) {
        let start = from + rel;
        let rest = &html[start..];
        let end = rest.find('"').or_else(|| rest.find('\''))?;
        let url = rest[..end].replace("&amp;", "&");
        if url.contains("/TCBU/") {
            return Some(url);
        }
        from = start + key.len();
    }
    None
}

fn b64(bytes: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let a = u32::from(chunk[0]);
        let b = u32::from(chunk.get(1).copied().unwrap_or(0));
        let c = u32::from(chunk.get(2).copied().unwrap_or(0));
        let n = (a << 16) | (b << 8) | c;
        out.push(T[(n >> 18) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn as_data_url(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 8 || bytes.len() > 1_200_000 {
        return None;
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(format!("data:image/jpeg;base64,{}", b64(bytes)));
    }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return Some(format!("data:image/png;base64,{}", b64(bytes)));
    }
    None
}

async fn typhoon_chart() -> Result<String, String> {
    let html = get_text(
        "https://www.nmc.cn/publish/typhoon/probability-img2.html",
        "https://www.nmc.cn/",
    )
    .await?;
    let url = extract_typhoon_chart(&html).ok_or_else(|| "没有路径图".to_string())?;
    if let Ok(bytes) = get_bytes(&url, "https://www.nmc.cn/").await {
        if let Some(data) = as_data_url(&bytes) {
            return Ok(data);
        }
    }
    Ok(url)
}

async fn locate_path(id: &str) -> String {
    let referer = format!("https://weather.cma.cn/web/weather/{id}.html");
    let Ok(now) = get_json(&format!("https://weather.cma.cn/api/now/{id}"), &referer, &[]).await else {
        return String::new();
    };
    now["data"]["location"]["path"]
        .as_str()
        .unwrap_or("")
        .to_string()
}

async fn enrich_places(raw: &Value) -> Vec<Value> {
    let Some(rows) = raw.get("data").and_then(|item| item.as_array()) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for row in rows {
        let Some(text) = row.as_str() else { continue };
        let parts: Vec<&str> = text.split('|').collect();
        if parts.len() < 4 || parts[3] != "中国" || !valid_station(parts[0]) {
            continue;
        }
        items.push(json!({
            "station": parts[0],
            "name": parts[1],
            "path": locate_path(parts[0]).await,
        }));
        if items.len() >= 8 {
            break;
        }
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_tcbu_chart() {
        let html = r#"<img src="https://image.nmc.cn/product/2026/08/14/SAT/x.jpg"><img src="https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP.JPG">"#;
        assert_eq!(
            extract_typhoon_chart(html).as_deref(),
            Some("https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP.JPG")
        );
    }
}
