use crate::knowledge::db::Snapshot;
use crate::AppState;
use tauri::State;

const MAX_SNAPSHOTS_PER_FILE: i64 = 50;

#[tauri::command]
pub async fn create_snapshot(
    file_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<Option<i64>, String> {
    let db = state.db.lock().await;
    db.create_snapshot(&file_path, &content, MAX_SNAPSHOTS_PER_FILE)
        .map_err(|e| format!("Failed to create snapshot: {}", e))
}

#[tauri::command]
pub async fn list_snapshots(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<Snapshot>, String> {
    let db = state.db.lock().await;
    db.list_snapshots(&file_path, MAX_SNAPSHOTS_PER_FILE)
        .map_err(|e| format!("Failed to list snapshots: {}", e))
}

#[tauri::command]
pub async fn get_snapshot_content(
    id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.get_snapshot_content(id)
        .map_err(|e| format!("Failed to get snapshot: {}", e))
}

#[tauri::command]
pub async fn delete_snapshot(
    id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().await;
    db.delete_snapshot(id)
        .map_err(|e| format!("Failed to delete snapshot: {}", e))
}
