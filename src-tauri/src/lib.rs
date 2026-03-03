mod ai;
mod commands;
mod knowledge;
mod web;

use knowledge::db::Database;
use knowledge::embedder::Embedder;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
    pub embedder: Arc<Mutex<Embedder>>,
    pub workspace_path: Arc<Mutex<Option<String>>>,
    pub cancel_stream: Arc<AtomicBool>,
}

fn parse_workspace_arg() -> Option<String> {
    // Accept: --workspace <path> or --workspace=<path>
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--workspace" {
            if let Some(p) = args.next() {
                return Some(p);
            }
        } else if let Some(rest) = arg.strip_prefix("--workspace=") {
            if !rest.is_empty() {
                return Some(rest.to_string());
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("knowledge.db");
            let db = Database::new(&db_path).expect("Failed to initialize database");

            let embedder = Embedder::new().expect("Failed to initialize embedder");

            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                embedder: Arc::new(Mutex::new(embedder)),
                workspace_path: Arc::new(Mutex::new(None)),
                cancel_stream: Arc::new(AtomicBool::new(false)),
            };

            // CLI: allow setting workspace without UI interaction
            if let Some(ws) = parse_workspace_arg() {
                let ws_path = PathBuf::from(&ws);
                if ws_path.is_dir() {
                    *state.workspace_path.blocking_lock() = Some(ws);
                } else {
                    eprintln!("--workspace is not a directory: {}", ws);
                }
            }

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // File commands
            commands::files::open_file,
            commands::files::open_file_by_path,
            commands::files::save_file,
            commands::files::get_workspace,
            commands::files::open_file_dialog,
            commands::files::open_folder_dialog,
            commands::files::set_workspace_path,
            // Knowledge base commands
            commands::kb::ingest_file,
            commands::kb::ingest_text,
            commands::kb::list_kb_documents,
            commands::kb::search_knowledge_base,
            commands::kb::remove_kb_document,
            // Web commands
            commands::web::fetch_url,
            // AI commands
            commands::ai::ai_draft,
            commands::ai::ai_expand,
            commands::ai::ai_rewrite,
            commands::ai::ai_research,
            commands::ai::ai_summarize,
            commands::ai::ai_cancel_stream,
            commands::ai::save_ai_settings,
            commands::ai::load_ai_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
