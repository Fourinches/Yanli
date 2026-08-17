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
        _ => Err("未知请求".into()),
    }
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
