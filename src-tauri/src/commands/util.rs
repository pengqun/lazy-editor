use crate::knowledge::embedder_init::ensure_embedder_loaded;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct StartupParams {
    pub workspace: Option<String>,
    pub self_test: Option<String>,
}

#[tauri::command]
pub async fn get_startup_params(state: State<'_, AppState>) -> Result<StartupParams, String> {
    let workspace = state.workspace_path.lock().await.clone();
    let self_test = state.self_test.lock().await.clone();
    eprintln!(
        "[selftest] get_startup_params invoked: workspace={:?} self_test={:?}",
        workspace, self_test
    );
    Ok(StartupParams { workspace, self_test })
}

#[tauri::command]
pub fn exit_app(app: AppHandle, code: i32) {
    app.exit(code);
}

/// Used only for diagnosing self-test startup. Safe no-op in production.
#[tauri::command]
pub fn selftest_ping(message: String) {
    eprintln!("[selftest] ping: {}", message);
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
pub struct SubsystemStatus {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Serialize, Clone)]
pub struct HealthReport {
    pub ok: bool,
    pub subsystems: Vec<SubsystemStatus>,
}

#[tauri::command]
pub async fn health_check(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<HealthReport, String> {
    let app_data_dir = app.path().app_data_dir().ok();
    Ok(health_check_inner(&state, app_data_dir.as_deref(), true).await)
}

// ---------------------------------------------------------------------------
// Diagnostics collection
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct DiagnosticsInfo {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub tauri_version: String,
    pub workspace_path: Option<String>,
    pub db_document_count: Option<i64>,
    pub db_path: String,
    pub embedder_loaded: bool,
    pub embedder_last_error: Option<String>,
    pub health: HealthReport,
}

#[tauri::command]
pub async fn collect_diagnostics(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DiagnosticsInfo, String> {
    let app_version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "unknown".into());

    let tauri_version = tauri::VERSION.to_string();
    let workspace_path = state.workspace_path.lock().await.clone();

    let db_document_count = {
        let db = state.db.lock().await;
        db.document_count().ok()
    };

    let db_path = app
        .path()
        .app_data_dir()
        .map(|p| p.join("knowledge.db").to_string_lossy().into_owned())
        .unwrap_or_else(|_| "unknown".into());

    let app_data_dir = app.path().app_data_dir().ok();
    Ok(build_diagnostics_info(
        &state,
        app_data_dir.as_deref(),
        DiagnosticsStaticInfo {
            app_version,
            tauri_version,
            workspace_path,
            db_document_count,
            db_path,
        },
    )
    .await)
}

struct DiagnosticsStaticInfo {
    app_version: String,
    tauri_version: String,
    workspace_path: Option<String>,
    db_document_count: Option<i64>,
    db_path: String,
}

/// Shared diagnostics assembly (health check + embedder snapshot fields).
pub(crate) async fn build_diagnostics_info(
    state: &AppState,
    app_data_dir: Option<&Path>,
    static_info: DiagnosticsStaticInfo,
) -> DiagnosticsInfo {
    let health = health_check_inner(state, app_data_dir, true).await;
    let (embedder_loaded, embedder_last_error) = embedder_snapshot_fields(state).await;
    debug_assert!(embedder_fields_consistent_with_health(
        &health,
        embedder_loaded
    ));

    DiagnosticsInfo {
        app_version: static_info.app_version,
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        tauri_version: static_info.tauri_version,
        workspace_path: static_info.workspace_path,
        db_document_count: static_info.db_document_count,
        db_path: static_info.db_path,
        embedder_loaded,
        embedder_last_error,
        health,
    }
}

async fn embedder_snapshot_fields(state: &AppState) -> (bool, Option<String>) {
    let embedder_loaded = state.embedder.lock().await.is_some();
    let embedder_last_error = state.embedder_init_error.lock().await.clone();
    (embedder_loaded, embedder_last_error)
}

pub(crate) fn embedder_fields_consistent_with_health(
    health: &HealthReport,
    embedder_loaded: bool,
) -> bool {
    health
        .subsystems
        .iter()
        .find(|s| s.name == "embedder")
        .is_some_and(|s| s.ok == embedder_loaded)
}

// ---------------------------------------------------------------------------
// AI settings (minimal subset for health check validation)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct AiSettingsPartial {
    #[serde(default)]
    provider: String,
    #[serde(rename = "claudeApiKey", default)]
    claude_api_key: String,
    #[serde(rename = "openaiApiKey", default)]
    openai_api_key: String,
    #[serde(rename = "ollamaEndpoint", default)]
    ollama_endpoint: String,
}

/// Try to load AI settings from the settings file on disk.
fn load_ai_settings_from_path(settings_path: &Path) -> Result<AiSettingsPartial, String> {
    let content = std::fs::read_to_string(settings_path)
        .map_err(|e| format!("Cannot read settings file: {}", e))?;
    serde_json::from_str::<AiSettingsPartial>(&content)
        .map_err(|e| format!("Invalid settings JSON: {}", e))
}

/// Validate the AI provider configuration: checks that the active provider
/// has its required credential (API key or endpoint) set.
fn check_ai_provider(settings_path: &Path) -> SubsystemStatus {
    let settings = match load_ai_settings_from_path(settings_path) {
        Ok(s) => s,
        Err(_) => {
            // Settings file missing or unreadable — provider cannot be validated
            return SubsystemStatus {
                name: "ai_provider".into(),
                ok: false,
                detail: "Settings file not found — Open Settings to configure your AI provider"
                    .into(),
            };
        }
    };

    let provider = if settings.provider.is_empty() {
        "claude"
    } else {
        settings.provider.as_str()
    };

    match provider {
        "claude" => {
            if settings.claude_api_key.trim().is_empty() {
                SubsystemStatus {
                    name: "ai_provider".into(),
                    ok: false,
                    detail: "Claude API key not set — Open Settings to add your Anthropic API key"
                        .into(),
                }
            } else {
                SubsystemStatus {
                    name: "ai_provider".into(),
                    ok: true,
                    detail: "Claude provider configured".into(),
                }
            }
        }
        "openai" => {
            if settings.openai_api_key.trim().is_empty() {
                SubsystemStatus {
                    name: "ai_provider".into(),
                    ok: false,
                    detail: "OpenAI API key not set — Open Settings to add your OpenAI API key"
                        .into(),
                }
            } else {
                SubsystemStatus {
                    name: "ai_provider".into(),
                    ok: true,
                    detail: "OpenAI provider configured".into(),
                }
            }
        }
        "ollama" => {
            let endpoint = if settings.ollama_endpoint.trim().is_empty() {
                "http://localhost:11434"
            } else {
                settings.ollama_endpoint.trim()
            };
            SubsystemStatus {
                name: "ai_provider".into(),
                ok: true,
                detail: format!("Ollama provider configured ({})", endpoint),
            }
        }
        other => SubsystemStatus {
            name: "ai_provider".into(),
            ok: false,
            detail: format!(
                "Unknown provider '{}' — Open Settings to select a valid AI provider",
                other
            ),
        },
    }
}

/// Validate the settings store: checks that the app data directory is writable
/// and the settings file, if present, contains valid JSON.
fn check_settings_store(app_data_dir: &Path) -> SubsystemStatus {
    // Check directory exists and is writable
    if !app_data_dir.is_dir() {
        return SubsystemStatus {
            name: "settings".into(),
            ok: false,
            detail: format!(
                "App data directory missing: {} — Try restarting the application",
                app_data_dir.display()
            ),
        };
    }

    // Verify we can write to the directory by checking permissions
    let probe_path = app_data_dir.join(".health_check_probe");
    match std::fs::write(&probe_path, b"ok") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe_path);
        }
        Err(e) => {
            return SubsystemStatus {
                name: "settings".into(),
                ok: false,
                detail: format!(
                    "App data directory not writable: {} — Check filesystem permissions",
                    e
                ),
            };
        }
    }

    // If settings.json exists, verify it parses as valid JSON
    let settings_path = app_data_dir.join("settings.json");
    if settings_path.exists() {
        match std::fs::read_to_string(&settings_path) {
            Ok(content) => {
                if serde_json::from_str::<serde_json::Value>(&content).is_err() {
                    return SubsystemStatus {
                        name: "settings".into(),
                        ok: false,
                        detail: "Settings file contains invalid JSON — Reset settings or edit settings.json manually".into(),
                    };
                }
            }
            Err(e) => {
                return SubsystemStatus {
                    name: "settings".into(),
                    ok: false,
                    detail: format!(
                        "Cannot read settings file: {} — Check filesystem permissions",
                        e
                    ),
                };
            }
        }
    }

    SubsystemStatus {
        name: "settings".into(),
        ok: true,
        detail: format!("Store writable: {}", app_data_dir.display()),
    }
}

/// User-facing detail when the embedder is unavailable.
pub(crate) fn format_embedder_unavailable_detail(
    self_test_active: bool,
    last_error: Option<&str>,
    retry_attempted: bool,
) -> String {
    if self_test_active {
        return "Disabled in --self-test mode — run the app normally to load the embedding model"
            .into();
    }

    let mut parts = Vec::new();

    match last_error {
        Some(err) if !err.trim().is_empty() => {
            parts.push(format!("Initialization failed: {}", err.trim()));
            parts.push(embedder_failure_hint(err));
        }
        _ if retry_attempted => {
            parts.push(
                "Initialization failed — the embedding model could not be loaded (no error detail captured)"
                    .into(),
            );
            parts.push(
                "Check disk space and app permissions, then press Re-run in Diagnostics to retry"
                    .into(),
            );
        }
        _ => {
            parts.push(
                "Not loaded yet — press Re-run in Diagnostics to initialize the embedding model (no workspace required)"
                    .into(),
            );
        }
    }

    parts.join(" — ")
}

fn embedder_failure_hint(error: &str) -> String {
    let lower = error.to_lowercase();
    if lower.contains("download")
        || lower.contains("network")
        || lower.contains("connection")
        || lower.contains("timed out")
        || lower.contains("timeout")
        || lower.contains("http")
        || lower.contains("retrieve")
        || lower.contains("model.onnx")
        || lower.contains("onnx/")
    {
        "The AllMiniLML6V2 embedding model must download from Hugging Face on first use — check network access (set HF_ENDPOINT if you use a mirror), confirm the model cache path above is writable, then press Re-run in Diagnostics"
            .into()
    } else if lower.contains("permission")
        || lower.contains("denied")
        || lower.contains("read-only")
        || lower.contains("no space")
        || lower.contains("disk")
    {
        "Check that the app data folder is writable and you have free disk space, then press Re-run in Diagnostics"
            .into()
    } else {
        "Press Re-run in Diagnostics to retry initialization; if this persists, export this report and check application logs"
            .into()
    }
}

async fn embedder_subsystem_status(state: &AppState, retry: bool) -> SubsystemStatus {
    let self_test_active = state.self_test.lock().await.is_some();
    let mut retry_attempted = false;

    if retry && !self_test_active {
        let loaded_before = state.embedder.lock().await.is_some();
        if !loaded_before {
            retry_attempted = true;
            *state
                .embedder_init_flight
                .lock()
                .expect("embedder_init_flight lock") = None;
            let _ = ensure_embedder_loaded(state, true).await;
        }
    }

    let loaded = state.embedder.lock().await.is_some();
    if loaded {
        return SubsystemStatus {
            name: "embedder".into(),
            ok: true,
            detail: "Loaded (AllMiniLML6V2)".into(),
        };
    }

    let last_error = state.embedder_init_error.lock().await.clone();
    SubsystemStatus {
        name: "embedder".into(),
        ok: false,
        detail: format_embedder_unavailable_detail(
            self_test_active,
            last_error.as_deref(),
            retry_attempted,
        ),
    }
}

/// Shared health-check logic (avoids State extraction issues when called internally).
///
/// `app_data_dir` is used for settings store and AI provider checks. When `None`
/// (e.g. in unit tests), those checks report a graceful degradation message.
/// When `retry_embedder` is true, attempts to initialize the embedder if missing.
async fn health_check_inner(
    state: &AppState,
    app_data_dir: Option<&Path>,
    retry_embedder: bool,
) -> HealthReport {
    let mut subsystems = Vec::new();

    // 1. Workspace access
    let ws = state.workspace_path.lock().await.clone();
    subsystems.push(match &ws {
        Some(path) => {
            let p = std::path::Path::new(path);
            if p.is_dir() {
                match std::fs::read_dir(p) {
                    Ok(_) => SubsystemStatus {
                        name: "workspace".into(),
                        ok: true,
                        detail: format!("Readable: {}", path),
                    },
                    Err(e) => SubsystemStatus {
                        name: "workspace".into(),
                        ok: false,
                        detail: format!(
                            "Cannot read directory: {} — Check that the folder exists and is accessible",
                            e
                        ),
                    },
                }
            } else {
                SubsystemStatus {
                    name: "workspace".into(),
                    ok: false,
                    detail: format!(
                        "Path is not a directory: {} — Open a valid folder as your workspace",
                        path
                    ),
                }
            }
        }
        None => SubsystemStatus {
            name: "workspace".into(),
            ok: true,
            detail: "No workspace set (optional)".into(),
        },
    });

    // 2. Knowledge base DB
    subsystems.push({
        let db = state.db.lock().await;
        match db.document_count() {
            Ok(count) => SubsystemStatus {
                name: "database".into(),
                ok: true,
                detail: format!("OK — {} documents", count),
            },
            Err(e) => SubsystemStatus {
                name: "database".into(),
                ok: false,
                detail: format!(
                    "Query failed: {} — The knowledge base may be corrupted; try restarting",
                    e
                ),
            },
        }
    });

    // 3. Embedder (optionally retry init — e.g. Diagnostics Re-run)
    subsystems.push(embedder_subsystem_status(state, retry_embedder).await);

    // 4. Settings store (validates app data directory and settings file integrity)
    subsystems.push(match app_data_dir {
        Some(dir) => check_settings_store(dir),
        None => SubsystemStatus {
            name: "settings".into(),
            ok: true,
            detail: "App data directory not available (runtime context)".into(),
        },
    });

    // 5. AI provider (validates the active provider has credentials configured)
    subsystems.push(match app_data_dir {
        Some(dir) => check_ai_provider(&dir.join("settings.json")),
        None => SubsystemStatus {
            name: "ai_provider".into(),
            ok: false,
            detail: "Settings file not found — Open Settings to configure your AI provider".into(),
        },
    });

    let all_ok = subsystems.iter().all(|s| s.ok);
    HealthReport {
        ok: all_ok,
        subsystems,
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::db::Database;
    use crate::knowledge::embedder_init::EmbedderLoader;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::sync::Mutex;

    fn failing_loader(message: &'static str) -> EmbedderLoader {
        Arc::new(move || Err(message.into()))
    }

    /// Create a minimal AppState for testing (in-memory DB, no embedder).
    fn test_app_state() -> AppState {
        test_app_state_with_loader(failing_loader("test embedder unavailable"))
    }

    fn test_app_state_with_loader(loader: EmbedderLoader) -> AppState {
        let db = Database::new(&PathBuf::from(":memory:")).unwrap();
        AppState {
            db: Arc::new(Mutex::new(db)),
            embedder: Arc::new(Mutex::new(None)),
            embedder_init_error: Arc::new(Mutex::new(None)),
            embedder_loader: loader,
            embedder_init_flight: Arc::new(std::sync::Mutex::new(None)),
            workspace_path: Arc::new(Mutex::new(None)),
            cancel_stream: Arc::new(AtomicBool::new(false)),
            self_test: Arc::new(Mutex::new(None)),
        }
    }

    // -- Embedder status formatting ------------------------------------------

    #[test]
    fn embedder_unavailable_without_error_does_not_claim_network() {
        let detail = format_embedder_unavailable_detail(false, None, false);
        assert!(detail.contains("Re-run"));
        assert!(!detail.to_lowercase().contains("network"));
        assert!(!detail.to_lowercase().contains("download"));
        assert!(!detail.to_lowercase().contains("restart"));
    }

    #[test]
    fn embedder_unavailable_after_retry_without_error_is_honest() {
        let detail = format_embedder_unavailable_detail(false, None, true);
        assert!(detail.contains("could not be loaded"));
        assert!(!detail.to_lowercase().contains("network"));
        assert!(!detail.to_lowercase().contains("download"));
    }

    #[test]
    fn embedder_unavailable_shows_stored_error() {
        let detail = format_embedder_unavailable_detail(false, Some("cache corrupt"), true);
        assert!(detail.contains("Initialization failed: cache corrupt"));
        assert!(detail.contains("Re-run"));
    }

    #[test]
    fn embedder_unavailable_network_hint_only_when_error_suggests_it() {
        let detail = format_embedder_unavailable_detail(false, Some("HTTP download failed"), true);
        assert!(detail.to_lowercase().contains("network"));
        let detail2 = format_embedder_unavailable_detail(false, Some("permission denied"), true);
        assert!(!detail2.to_lowercase().contains("network"));
        assert!(detail2.to_lowercase().contains("writable"));
    }

    #[test]
    fn embedder_unavailable_retrieve_onnx_error_suggests_download_and_cache() {
        let detail = format_embedder_unavailable_detail(
            false,
            Some("Failed to retrieve model.onnx"),
            true,
        );
        assert!(detail.contains("Failed to retrieve model.onnx"));
        assert!(detail.to_lowercase().contains("hugging face"));
        assert!(detail.to_lowercase().contains("hf_endpoint"));
        assert!(detail.contains("Re-run"));
    }

    #[test]
    fn embedder_unavailable_self_test_message() {
        let detail = format_embedder_unavailable_detail(true, None, false);
        assert!(detail.contains("--self-test"));
        assert!(!detail.contains("Restart"));
    }

    // -- AI provider check ---------------------------------------------------

    #[test]
    fn ai_provider_missing_settings_file() {
        let path = PathBuf::from("/nonexistent/settings.json");
        let status = check_ai_provider(&path);
        assert!(!status.ok);
        assert_eq!(status.name, "ai_provider");
        assert!(
            status.detail.contains("Open Settings"),
            "should include actionable hint"
        );
    }

    #[test]
    fn ai_provider_claude_key_present() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({
            "provider": "claude",
            "claudeApiKey": "sk-ant-test-key"
        });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(status.ok);
        assert!(status.detail.contains("Claude"));
    }

    #[test]
    fn ai_provider_claude_key_empty() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({
            "provider": "claude",
            "claudeApiKey": ""
        });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(!status.ok);
        assert!(status.detail.contains("API key not set"));
        assert!(status.detail.contains("Open Settings"));
    }

    #[test]
    fn ai_provider_openai_key_present() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({
            "provider": "openai",
            "openaiApiKey": "sk-openai-test-key"
        });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(status.ok);
        assert!(status.detail.contains("OpenAI"));
    }

    #[test]
    fn ai_provider_openai_key_empty() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({
            "provider": "openai",
            "openaiApiKey": ""
        });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(!status.ok);
        assert!(status.detail.contains("OpenAI API key not set"));
    }

    #[test]
    fn ai_provider_ollama_always_ok() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({
            "provider": "ollama",
            "ollamaEndpoint": "http://localhost:11434"
        });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(status.ok);
        assert!(status.detail.contains("Ollama"));
        assert!(status.detail.contains("localhost:11434"));
    }

    #[test]
    fn ai_provider_unknown_provider() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        let json = serde_json::json!({ "provider": "foobar" });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(!status.ok);
        assert!(status.detail.contains("Unknown provider"));
        assert!(status.detail.contains("Open Settings"));
    }

    #[test]
    fn ai_provider_defaults_to_claude_when_provider_empty() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        // provider field empty — should fall back to "claude"
        let json = serde_json::json!({ "provider": "", "claudeApiKey": "sk-key" });
        std::fs::write(&settings_path, json.to_string()).unwrap();

        let status = check_ai_provider(&settings_path);
        assert!(status.ok);
        assert!(status.detail.contains("Claude"));
    }

    // -- Settings store check ------------------------------------------------

    #[test]
    fn settings_store_valid_directory() {
        let dir = tempfile::tempdir().unwrap();
        let status = check_settings_store(dir.path());
        assert!(status.ok);
        assert!(status.detail.contains("Store writable"));
    }

    #[test]
    fn settings_store_missing_directory() {
        let path = PathBuf::from("/nonexistent/app/data");
        let status = check_settings_store(&path);
        assert!(!status.ok);
        assert!(status.detail.contains("App data directory missing"));
        assert!(status.detail.contains("restarting"));
    }

    #[test]
    fn settings_store_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        std::fs::write(&settings_path, "NOT VALID JSON {{{").unwrap();

        let status = check_settings_store(dir.path());
        assert!(!status.ok);
        assert!(status.detail.contains("invalid JSON"));
    }

    #[test]
    fn settings_store_valid_json() {
        let dir = tempfile::tempdir().unwrap();
        let settings_path = dir.path().join("settings.json");
        std::fs::write(&settings_path, r#"{"provider":"claude"}"#).unwrap();

        let status = check_settings_store(dir.path());
        assert!(status.ok);
    }

    // -- Full health check ---------------------------------------------------

    #[tokio::test]
    async fn health_check_inner_returns_five_subsystems() {
        let state = test_app_state();
        let dir = tempfile::tempdir().unwrap();
        let report = health_check_inner(&state, Some(dir.path()), false).await;
        assert_eq!(report.subsystems.len(), 5);

        let names: Vec<&str> = report.subsystems.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"workspace"));
        assert!(names.contains(&"database"));
        assert!(names.contains(&"embedder"));
        assert!(names.contains(&"settings"));
        assert!(names.contains(&"ai_provider"));
    }

    #[tokio::test]
    async fn health_check_inner_without_app_data_dir() {
        let state = test_app_state();
        let report = health_check_inner(&state, None, false).await;
        assert_eq!(report.subsystems.len(), 5);

        // Settings and AI provider should still return graceful results
        let settings = report.subsystems.iter().find(|s| s.name == "settings").unwrap();
        assert!(settings.ok);

        let ai = report.subsystems.iter().find(|s| s.name == "ai_provider").unwrap();
        assert!(!ai.ok);
        assert!(ai.detail.contains("Open Settings"));
    }

    #[tokio::test]
    async fn health_check_workspace_not_a_dir() {
        let state = test_app_state();
        // Set workspace to a file (not a directory)
        let tmp = tempfile::NamedTempFile::new().unwrap();
        *state.workspace_path.lock().await = Some(tmp.path().to_string_lossy().into_owned());

        let report = health_check_inner(&state, None, false).await;
        let ws = report.subsystems.iter().find(|s| s.name == "workspace").unwrap();
        assert!(!ws.ok);
        assert!(ws.detail.contains("not a directory"));
        assert!(ws.detail.contains("Open a valid folder"));
    }

    #[tokio::test]
    async fn health_check_overall_ok_reflects_subsystems() {
        let state = test_app_state();
        let dir = tempfile::tempdir().unwrap();
        // Write valid settings with a provider key so all checks pass except embedder
        let settings_path = dir.path().join("settings.json");
        std::fs::write(&settings_path, r#"{"provider":"claude","claudeApiKey":"sk-test"}"#)
            .unwrap();

        let report = health_check_inner(&state, Some(dir.path()), false).await;
        // Embedder is None in test state, so overall should NOT be ok
        assert!(!report.ok);
        let emb = report.subsystems.iter().find(|s| s.name == "embedder").unwrap();
        assert!(!emb.ok);
        assert!(emb.detail.contains("Re-run"));
        assert!(!emb.detail.to_lowercase().contains("restart"));
    }

    #[tokio::test]
    async fn health_check_embedder_reports_stored_startup_error() {
        let state = test_app_state();
        *state.embedder_init_error.lock().await =
            Some("model files missing".to_string());

        let report = health_check_inner(&state, None, false).await;
        let emb = report.subsystems.iter().find(|s| s.name == "embedder").unwrap();
        assert!(!emb.ok);
        assert!(emb.detail.contains("model files missing"));
    }

    #[tokio::test]
    async fn build_diagnostics_info_embedder_fields_match_health_after_retry() {
        let state = test_app_state_with_loader(failing_loader("injected boom"));
        let dir = tempfile::tempdir().unwrap();

        let info = build_diagnostics_info(
            &state,
            Some(dir.path()),
            DiagnosticsStaticInfo {
                app_version: "0.0-test".into(),
                tauri_version: "test".into(),
                workspace_path: None,
                db_document_count: Some(0),
                db_path: "/tmp/knowledge.db".into(),
            },
        )
        .await;

        assert!(
            embedder_fields_consistent_with_health(&info.health, info.embedder_loaded),
            "embedder_loaded={} health_ok={}",
            info.embedder_loaded,
            info.health.subsystems.iter().find(|s| s.name == "embedder").unwrap().ok
        );
        assert!(!info.embedder_loaded);
        assert_eq!(info.embedder_last_error.as_deref(), Some("injected boom"));
    }

    #[tokio::test]
    async fn health_check_embedder_retry_after_completed_flight_reruns_loader() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_loader = Arc::clone(&calls);
        let loader: EmbedderLoader = Arc::new(move || {
            calls_in_loader.fetch_add(1, Ordering::SeqCst);
            Err("Failed to retrieve model.onnx".into())
        });

        let state = test_app_state_with_loader(loader);
        *state.embedder_init_error.lock().await =
            Some("Failed to retrieve model.onnx".into());
        *state.embedder_init_flight.lock().unwrap() =
            Some(crate::knowledge::embedder_init::EmbedderInitFlight::Completed);

        let report = health_check_inner(&state, None, true).await;
        let emb = report.subsystems.iter().find(|s| s.name == "embedder").unwrap();
        assert!(!emb.ok);
        assert!(emb.detail.contains("Failed to retrieve model.onnx"));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn health_check_self_test_skips_loader() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_loader = Arc::clone(&calls);
        let loader: EmbedderLoader = Arc::new(move || {
            calls_in_loader.fetch_add(1, Ordering::SeqCst);
            Err("must not run".into())
        });
        let state = test_app_state_with_loader(loader);
        *state.self_test.lock().await = Some("editor-basic".into());

        let report = health_check_inner(&state, None, true).await;
        let emb = report.subsystems.iter().find(|s| s.name == "embedder").unwrap();
        assert!(!emb.ok);
        assert!(emb.detail.contains("--self-test"));
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
