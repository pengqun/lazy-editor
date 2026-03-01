use crate::ai::prompts::build_system_prompt;
use crate::ai::provider::{create_provider, GenerateRequest, Message};
use crate::knowledge::search;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub provider: String,
    #[serde(rename = "claudeApiKey", default)]
    pub claude_api_key: String,
    #[serde(rename = "claudeModel", default)]
    pub claude_model: String,
    #[serde(rename = "openaiApiKey", default)]
    pub openai_api_key: String,
    #[serde(rename = "openaiModel", default)]
    pub openai_model: String,
    #[serde(rename = "ollamaEndpoint", default)]
    pub ollama_endpoint: String,
    #[serde(rename = "ollamaModel", default)]
    pub ollama_model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(rename = "maxTokens", default = "default_max_tokens")]
    pub max_tokens: u32,
}

fn default_temperature() -> f32 {
    0.7
}
fn default_max_tokens() -> u32 {
    4096
}

/// Helper: run an AI action with KB context injection and streaming.
async fn run_ai_action(
    action: &str,
    user_message: &str,
    state: &State<'_, AppState>,
    app: &AppHandle,
    settings: &AiSettings,
    kb_query: Option<&str>,
) -> Result<(), String> {
    // 1. Search KB for relevant context
    let kb_results = if let Some(query) = kb_query {
        let db = state.db.lock().await;
        let embedder = state.embedder.lock().await;
        search::search(&db, &embedder, query, 5).unwrap_or_default()
    } else {
        vec![]
    };

    // 2. Build context-aware system prompt
    let system_prompt = build_system_prompt(action, &kb_results);

    // 3. Create the appropriate provider
    let (api_key, model, endpoint) = match settings.provider.as_str() {
        "openai" => (
            settings.openai_api_key.as_str(),
            settings.openai_model.as_str(),
            "",
        ),
        "ollama" => (
            "",
            settings.ollama_model.as_str(),
            settings.ollama_endpoint.as_str(),
        ),
        _ => (
            settings.claude_api_key.as_str(),
            settings.claude_model.as_str(),
            "",
        ),
    };

    let provider = create_provider(&settings.provider, api_key, model, endpoint);

    // 4. Build the request
    let request = GenerateRequest {
        system: system_prompt,
        messages: vec![Message {
            role: "user".to_string(),
            content: user_message.to_string(),
        }],
        max_tokens: settings.max_tokens,
        temperature: settings.temperature,
    };

    // 5. Stream the response
    state.cancel_stream.store(false, Ordering::SeqCst);
    let cancel_flag = state.cancel_stream.clone();

    let (tx, mut rx) = mpsc::channel::<String>(100);
    let app_handle = app.clone();

    // Spawn a task to forward stream chunks to frontend
    let forward_handle = tokio::spawn(async move {
        while let Some(chunk) = rx.recv().await {
            if cancel_flag.load(Ordering::SeqCst) {
                break;
            }
            let _ = app_handle.emit("ai-stream-chunk", &chunk);
        }
        let _ = app_handle.emit("ai-stream-done", ());
    });

    // Run the streaming generation
    match provider.generate_stream(request, tx).await {
        Ok(()) => {}
        Err(e) => {
            let _ = app.emit("ai-stream-error", e.to_string());
            return Err(format!("AI generation failed: {}", e));
        }
    }

    forward_handle.await.ok();
    Ok(())
}

// ── Load settings helper ─────────────────────────────────────────────

fn load_settings_from_store(app: &AppHandle) -> AiSettings {
    // Try to read from the store; fall back to defaults
    let store_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("settings.json"));

    if let Some(path) = store_path {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AiSettings>(&content) {
                return settings;
            }
        }
    }

    AiSettings {
        provider: "claude".to_string(),
        claude_api_key: String::new(),
        claude_model: "claude-sonnet-4-20250514".to_string(),
        openai_api_key: String::new(),
        openai_model: "gpt-4o".to_string(),
        ollama_endpoint: "http://localhost:11434".to_string(),
        ollama_model: "llama3.2".to_string(),
        temperature: 0.7,
        max_tokens: 4096,
    }
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_draft(
    topic: String,
    style: String,
    #[allow(non_snake_case)] kbContextCount: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let settings = load_settings_from_store(&app);
    let user_msg = format!(
        "Write a {} about the following topic:\n\n{}",
        style, topic
    );
    let _ = kbContextCount; // reserved for future use
    run_ai_action("draft", &user_msg, &state, &app, &settings, Some(&topic)).await
}

#[tauri::command]
pub async fn ai_expand(
    #[allow(non_snake_case)] selectedText: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let settings = load_settings_from_store(&app);
    let user_msg = format!(
        "Expand the following text with more detail and depth:\n\n{}",
        selectedText
    );
    run_ai_action("expand", &user_msg, &state, &app, &settings, Some(&selectedText)).await
}

#[tauri::command]
pub async fn ai_rewrite(
    #[allow(non_snake_case)] selectedText: String,
    instruction: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let settings = load_settings_from_store(&app);
    let user_msg = format!(
        "Rewrite the following text according to this instruction: {}\n\nOriginal text:\n{}",
        instruction, selectedText
    );
    run_ai_action("rewrite", &user_msg, &state, &app, &settings, Some(&selectedText)).await
}

#[tauri::command]
pub async fn ai_research(
    query: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let settings = load_settings_from_store(&app);
    let user_msg = format!(
        "Research and synthesize information about:\n\n{}",
        query
    );
    run_ai_action("research", &user_msg, &state, &app, &settings, Some(&query)).await
}

#[tauri::command]
pub async fn ai_summarize(
    text: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    let settings = load_settings_from_store(&app);
    let user_msg = format!("Summarize the following text:\n\n{}", text);
    run_ai_action("summarize", &user_msg, &state, &app, &settings, None).await
}

#[tauri::command]
pub async fn ai_cancel_stream(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_stream.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn save_ai_settings(settings: AiSettings, app: AppHandle) -> Result<(), String> {
    let store_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("settings.json");

    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    std::fs::write(&store_path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_ai_settings(app: AppHandle) -> Result<AiSettings, String> {
    Ok(load_settings_from_store(&app))
}
