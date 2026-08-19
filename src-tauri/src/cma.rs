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

fn typhoon_no(row: &Value) -> Option<String> {
    let no = row.get(3)?;
    if let Some(n) = no.as_u64() {
        return Some(n.to_string());
    }
    if let Some(n) = no.as_i64() {
        return Some(n.to_string());
    }
    no.as_str()
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string)
}

fn active_storm_nos(list: &Value) -> Vec<String> {
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
        .filter_map(typhoon_no)
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
            let (chart, page) = typhoon_chart(&list).await.unwrap_or_default();
            Ok(json!({
                "list": list,
                "views": views,
                "chart": chart,
                "page": page,
            }))
        }
        _ => Err("未知请求".into()),
    }
}

fn extract_typhoon_charts(html: &str) -> Vec<String> {
    let key = "https://image.nmc.cn/product/";
    let mut from = 0;
    let mut out = Vec::new();
    while let Some(rel) = html[from..].find(key) {
        let start = from + rel;
        let rest = &html[start..];
        let Some(end) = rest.find('"').or_else(|| rest.find('\'')) else {
            break;
        };
        let url = rest[..end].replace("&amp;", "&");
        if url.contains("/TCBU/") && !out.iter().any(|item| item == &url) {
            out.push(url);
        }
        from = start + key.len();
    }
    out
}

fn chart_has_other_storm(url: &str, nos: &[String]) -> bool {
    let Some(at) = url.find("0W") else {
        return false;
    };
    let tag = url[at..].get(..6).unwrap_or("");
    if !tag.starts_with("0W") || !tag[2..].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    !nos.iter().any(|no| tag.ends_with(no) || tag == format!("0W{no}"))
}

fn pick_typhoon_chart(urls: &[String], nos: &[String]) -> Option<String> {
    for no in nos {
        let tagged = format!("0W{no}");
        if let Some(url) = urls.iter().find(|item| item.contains(&tagged)) {
            return Some(url.clone());
        }
    }
    urls.iter()
        .find(|item| item.contains("/TCBU/") && !chart_has_other_storm(item, nos))
        .cloned()
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

async fn typhoon_chart(list: &Value) -> Result<(String, String), String> {
    let nos = active_storm_nos(list);
    let pages = [
        "https://www.nmc.cn/publish/typhoon/warning.html",
        "https://www.nmc.cn/publish/typhoon/probability-img2.html",
    ];
    let mut urls = Vec::new();
    for item in pages {
        let Ok(html) = get_text(item, "https://www.nmc.cn/").await else {
            continue;
        };
        urls.extend(extract_typhoon_charts(&html));
    }
    let url = pick_typhoon_chart(&urls, &nos).ok_or_else(|| "没有路径图".to_string())?;
    let page = if url.contains("0W") {
        pages[1].to_string()
    } else {
        pages[0].to_string()
    };
    if let Ok(bytes) = get_bytes(&url, "https://www.nmc.cn/").await {
        let _ = std::fs::write(chart_cache_path(), &bytes);
        if let Some(data) = as_data_url(&bytes) {
            return Ok((data, page));
        }
    }
    Ok((url, page))
}

pub fn chart_cache_path() -> std::path::PathBuf {
    std::env::temp_dir().join("yanli-typhoon-chart.img")
}

#[allow(dead_code)]
pub fn persist_chart_source(chart: &str, page: &str) {
    let _ = std::fs::write(std::env::temp_dir().join("yanli-typhoon-chart.txt"), page);
    if chart.is_empty() {
        return;
    }
    if let Some(raw) = chart
        .strip_prefix("data:image/jpeg;base64,")
        .or_else(|| chart.strip_prefix("data:image/png;base64,"))
    {
        if let Ok(bytes) = b64_decode(raw) {
            let _ = std::fs::write(chart_cache_path(), bytes);
            let _ = std::fs::remove_file(std::env::temp_dir().join("yanli-typhoon-chart.url"));
        }
        return;
    }
    if chart.starts_with("https://image.nmc.cn/product/") && chart.contains("/TCBU/") {
        let _ = std::fs::write(std::env::temp_dir().join("yanli-typhoon-chart.url"), chart);
        let _ = std::fs::remove_file(chart_cache_path());
    }
}

fn b64_decode(input: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut buf = 0u32;
    let mut n = 0;
    for c in input.bytes() {
        if c == b'=' || c.is_ascii_whitespace() {
            continue;
        }
        let Some(v) = val(c) else {
            return Err("图片数据无效".into());
        };
        buf = (buf << 6) | u32::from(v);
        n += 1;
        if n == 4 {
            out.push((buf >> 16) as u8);
            out.push((buf >> 8) as u8);
            out.push(buf as u8);
            n = 0;
            buf = 0;
        }
    }
    if n == 2 {
        out.push((buf >> 4) as u8);
    } else if n == 3 {
        out.push((buf >> 10) as u8);
        out.push((buf >> 2) as u8);
    }
    Ok(out)
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
    fn picks_current_storm_chart() {
        let html = r#"<img src="https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP_0W26170000.JPG"><img src="https://image.nmc.cn/product/2026/08/19/TCBU/SEVP_P9.png">"#;
        let urls = extract_typhoon_charts(html);
        assert_eq!(
            pick_typhoon_chart(&urls, &["2618".into()]).as_deref(),
            Some("https://image.nmc.cn/product/2026/08/19/TCBU/SEVP_P9.png")
        );
        assert_eq!(
            pick_typhoon_chart(&urls, &["2617".into()]).as_deref(),
            Some("https://image.nmc.cn/product/2026/08/14/TCBU/medium/SEVP_0W26170000.JPG")
        );
        assert_eq!(pick_typhoon_chart(&urls[..1], &["2618".into()]), None);
    }

    #[test]
    fn roundtrips_base64() {
        let raw = b"\xFF\xD8\xFF hello-chart";
        assert_eq!(b64_decode(&b64(raw)).unwrap(), raw);
    }
}
