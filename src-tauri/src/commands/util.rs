use crate::AppState;
use serde::Serialize;
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
pub async fn health_check(state: State<'_, AppState>) -> Result<HealthReport, String> {
    Ok(health_check_inner(&state).await)
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

    let embedder_loaded = state.embedder.lock().await.is_some();
    let health = health_check_inner(&state).await;

    Ok(DiagnosticsInfo {
        app_version,
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        tauri_version,
        workspace_path,
        db_document_count,
        db_path,
        embedder_loaded,
        health,
    })
}

/// Shared health-check logic (avoids State extraction issues when called internally).
async fn health_check_inner(state: &AppState) -> HealthReport {
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
                        detail: format!("Cannot read directory: {}", e),
                    },
                }
            } else {
                SubsystemStatus {
                    name: "workspace".into(),
                    ok: false,
                    detail: format!("Path is not a directory: {}", path),
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
                detail: format!("Query failed: {}", e),
            },
        }
    });

    // 3. Embedder
    subsystems.push({
        let emb = state.embedder.lock().await;
        if emb.is_some() {
            SubsystemStatus {
                name: "embedder".into(),
                ok: true,
                detail: "Loaded (AllMiniLML6V2)".into(),
            }
        } else {
            SubsystemStatus {
                name: "embedder".into(),
                ok: false,
                detail: "Not initialized — KB features unavailable".into(),
            }
        }
    });

    // 4. Settings store
    subsystems.push(SubsystemStatus {
        name: "settings".into(),
        ok: true,
        detail: "Tauri plugin-store available".into(),
    });

    let all_ok = subsystems.iter().all(|s| s.ok);
    HealthReport {
        ok: all_ok,
        subsystems,
    }
}
