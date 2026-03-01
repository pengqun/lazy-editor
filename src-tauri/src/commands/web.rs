use crate::web::extractor;
use serde::Serialize;

#[derive(Serialize)]
pub struct WebExtractResult {
    title: String,
    text: String,
    url: String,
}

#[tauri::command]
pub async fn fetch_url(url: String) -> Result<WebExtractResult, String> {
    let article = extractor::fetch_and_extract(&url)
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    Ok(WebExtractResult {
        title: article.title,
        text: article.text,
        url: article.url,
    })
}
