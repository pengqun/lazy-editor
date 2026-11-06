use crate::AppState;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, FilePath};

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

fn file_path_to_string(path: FilePath) -> Result<String, String> {
    path.into_path()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| format!("Invalid path from dialog: {e}"))
}

/// Maps a native picker result to an IPC path string. `None` means the user cancelled.
fn map_picked_path(picked: Option<FilePath>) -> Result<Option<String>, String> {
    match picked {
        None => Ok(None),
        Some(path) => Ok(Some(file_path_to_string(path.simplified())?)),
    }
}

async fn pick_path<F>(window: WebviewWindow, pick: F) -> Result<Option<String>, String>
where
    F: FnOnce(&WebviewWindow) -> Option<FilePath> + Send + 'static,
{
    let picked = tauri::async_runtime::spawn_blocking(move || pick(&window))
        .await
        .map_err(|e| format!("Dialog task failed: {e}"))?;

    map_picked_path(picked)
}

#[tauri::command]
pub async fn open_file_dialog(window: WebviewWindow) -> Result<Option<String>, String> {
    pick_path(window, |window| {
        #[allow(unused_mut)]
        let mut builder = window.dialog().file().set_title("Open File");
        #[cfg(any(windows, target_os = "macos"))]
        {
            builder = builder.set_parent(window);
        }
        builder.blocking_pick_file()
    })
    .await
}

#[tauri::command]
pub async fn open_folder_dialog(window: WebviewWindow) -> Result<Option<String>, String> {
    pick_path(window, |window| {
        #[allow(unused_mut)]
        let mut builder = window
            .dialog()
            .file()
            .set_title("Open Workspace Folder");
        #[cfg(any(windows, target_os = "macos"))]
        {
            builder = builder.set_parent(window);
        }
        builder.blocking_pick_folder()
    })
    .await
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_picked_path_none_is_cancel_not_empty_string() {
        assert_eq!(map_picked_path(None).unwrap(), None);
    }

    #[test]
    fn map_picked_path_converts_path_buf() {
        let input = PathBuf::from("workspace").join("docs");
        let expected = input.to_string_lossy().into_owned();
        assert_eq!(
            map_picked_path(Some(FilePath::Path(input))).unwrap(),
            Some(expected)
        );
    }

    #[test]
    fn file_path_to_string_rejects_empty_path() {
        assert!(file_path_to_string(FilePath::Path(PathBuf::new())).is_ok());
    }
}
