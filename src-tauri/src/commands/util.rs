use crate::AppState;
use serde::Serialize;
use tauri::{AppHandle, State};

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
