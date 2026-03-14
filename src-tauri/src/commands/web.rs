use crate::web::extractor;
use crate::AppState;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct WebExtractResult {
    title: String,
    text: String,
    url: String,
}

#[tauri::command]
pub async fn fetch_url(url: String, state: State<'_, AppState>) -> Result<WebExtractResult, String> {
    let ws_path = state.workspace_path.lock().await;
    let config = extractor::load_extractor_config(ws_path.as_deref());
    drop(ws_path);

    let article = extractor::fetch_and_extract(&url, &config)
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    Ok(WebExtractResult {
        title: article.title,
        text: article.text,
        url: article.url,
    })
}
