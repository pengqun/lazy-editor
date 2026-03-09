use crate::AppState;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[derive(Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    modified: u64,
}

#[derive(Serialize)]
pub struct WorkspaceInfo {
    path: String,
    files: Vec<FileEntry>,
}

fn canonicalize_within_workspace(path: &str, workspace: Option<String>) -> Result<PathBuf, String> {
    let canonical = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| format!("Invalid file path: {}", e))?;

    if let Some(workspace) = workspace {
        let ws_canon = PathBuf::from(workspace)
            .canonicalize()
            .map_err(|e| format!("Invalid workspace path: {}", e))?;
        if !canonical.starts_with(&ws_canon) {
            return Err("Path is outside current workspace".to_string());
        }
    }

    Ok(canonical)
}

#[tauri::command]
pub async fn open_file(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let workspace = state.workspace_path.lock().await.clone();
    let canonical = canonicalize_within_workspace(&path, workspace)?;
    fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn open_file_by_path(path: String, state: State<'_ , AppState>) -> Result<String, String> {
    let workspace = state.workspace_path.lock().await.clone();
    let canonical = canonicalize_within_workspace(&path, workspace)?;
    fs::read_to_string(&canonical).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn save_file(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let requested = PathBuf::from(&path);
    let workspace = state.workspace_path.lock().await.clone();

    if let Some(workspace_path) = workspace {
        let ws_canon = PathBuf::from(workspace_path)
            .canonicalize()
            .map_err(|e| format!("Invalid workspace path: {}", e))?;

        let parent = requested
            .parent()
            .ok_or_else(|| "Invalid target path".to_string())?;
        let parent_canon = parent
            .canonicalize()
            .map_err(|e| format!("Invalid parent path: {}", e))?;

        if !parent_canon.starts_with(&ws_canon) {
            return Err("Path is outside current workspace".to_string());
        }
    }

    // Ensure parent directory exists
    if let Some(parent) = requested.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&requested, &content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub async fn get_workspace(state: State<'_, AppState>) -> Result<WorkspaceInfo, String> {
    let workspace = state.workspace_path.lock().await;
    let path = workspace
        .as_ref()
        .ok_or_else(|| "No workspace set".to_string())?
        .clone();

    let files = list_files_in_dir(&path)?;
    Ok(WorkspaceInfo { path, files })
}

#[tauri::command]
pub async fn set_workspace_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut workspace = state.workspace_path.lock().await;
    *workspace = Some(path);
    Ok(())
}

#[tauri::command]
pub async fn open_file_dialog() -> Result<Option<String>, String> {
    
    // For now, return None — the frontend uses @tauri-apps/plugin-dialog directly
    // This is a placeholder for file dialog integration
    Ok(None)
}

#[tauri::command]
pub async fn open_folder_dialog() -> Result<Option<String>, String> {
    Ok(None)
}

fn list_files_in_dir(dir: &str) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        let modified = metadata
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files
        if name.starts_with('.') {
            continue;
        }

        files.push(FileEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            modified,
        });
    }

    Ok(files)
}
