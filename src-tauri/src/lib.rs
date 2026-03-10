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
    pub embedder: Arc<Mutex<Option<Embedder>>>,
    pub workspace_path: Arc<Mutex<Option<String>>>,
    pub cancel_stream: Arc<AtomicBool>,
    pub self_test: Arc<Mutex<Option<String>>>,
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
fn parse_self_test_arg() -> Option<String> {
    // Accept: --self-test <name> or --self-test=<name>
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--self-test" {
            if let Some(v) = args.next() {
                return Some(v);
            }
        } else if let Some(rest) = arg.strip_prefix("--self-test=") {
            if !rest.is_empty() {
                return Some(rest.to_string());
            }
        }
    }
    None
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    run_with_context(tauri::generate_context!());
}

pub fn run_with_context(context: tauri::Context) {
    env_logger::init();

    let is_self_test = parse_self_test_arg();

    // Watchdog: kill process after 60s in selftest mode (fail fast, but allow UI boot)
    if is_self_test.is_some() {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(60));
            eprintln!("[selftest] FATAL: watchdog timeout (60s)");
            std::process::exit(2);
        });
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build());

    // NOTE: In self-test mode, avoid initializing the HTTP plugin. In CI / headless
    // contexts it may fail with "Operation not permitted" and prevent tests from running.
    if is_self_test.is_some() {
        eprintln!("[selftest] setup: skipping tauri_plugin_http (selftest mode)");
    } else {
        builder = builder.plugin(tauri_plugin_http::init());
    }

    builder
        .setup(move |app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| {
                    let msg = format!("Failed to get app data dir: {}", e);
                    log::error!("{}", msg);
                    Box::<dyn std::error::Error>::from(msg)
                })?;
            std::fs::create_dir_all(&app_data_dir).map_err(|e| {
                let msg = format!("Failed to create app data dir: {}", e);
                log::error!("{}", msg);
                Box::<dyn std::error::Error>::from(msg)
            })?;

            let db_path = app_data_dir.join("knowledge.db");
            eprintln!("[selftest] setup: initializing database...");
            let db = Database::new(&db_path).map_err(|e| {
                let msg = format!("Failed to initialize database: {}", e);
                log::error!("{}", msg);
                Box::<dyn std::error::Error>::from(msg)
            })?;
            eprintln!("[selftest] setup: database ready");

            let embedder = if is_self_test.is_some() {
                eprintln!("[selftest] setup: skipping embedder (selftest mode)");
                None
            } else {
                eprintln!("[selftest] setup: initializing embedder...");
                match Embedder::new() {
                    Ok(e) => {
                        eprintln!("[selftest] setup: embedder ready");
                        Some(e)
                    }
                    Err(e) => {
                        log::error!("Failed to initialize embedder: {}. Knowledge base features will be unavailable.", e);
                        eprintln!("Warning: embedder init failed ({}), KB features disabled", e);
                        None
                    }
                }
            };

            let state = AppState {
                db: Arc::new(Mutex::new(db)),
                embedder: Arc::new(Mutex::new(embedder)),
                workspace_path: Arc::new(Mutex::new(None)),
                cancel_stream: Arc::new(AtomicBool::new(false)),
                self_test: Arc::new(Mutex::new(is_self_test.clone())),
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
            eprintln!("[selftest] setup: CLI args parsed");

            app.manage(state);

            // Diagnostics: after startup, report whether a window/webview exists and attempt
            // to invoke a Tauri command from JS via eval.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                let labels: Vec<String> = handle
                    .webview_windows()
                    .keys()
                    .cloned()
                    .collect();
                eprintln!("[selftest] diag: webview_windows labels={:?}", labels);

                if let Some(w) = handle.get_webview_window("main") {
                    let js = r#"
                      (function(){
                        const run = async () => {
                          try {
                            if (window.__TAURI__?.core?.invoke) {
                              await window.__TAURI__.core.invoke('selftest_ping', { message: 'eval invoke ok' });
                            } else {
                              // leave a breadcrumb
                              document.documentElement.setAttribute('data-selftest-tauri', 'missing');
                            }
                          } catch (e) {
                            document.documentElement.setAttribute('data-selftest-tauri', 'threw');
                          }
                        };
                        if (document.readyState === 'complete') run();
                        else window.addEventListener('load', () => run(), { once: true });
                      })();
                    "#;
                    if let Err(e) = w.eval(js) {
                        eprintln!("[selftest] diag: window.eval failed: {}", e);
                    } else {
                        eprintln!("[selftest] diag: window.eval submitted");
                    }
                } else {
                    eprintln!("[selftest] diag: could not find webview window 'main'");
                }
            });

            eprintln!("[selftest] setup: app state managed, startup complete");
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
            // Snapshot commands
            commands::snapshots::create_snapshot,
            commands::snapshots::list_snapshots,
            commands::snapshots::get_snapshot_content,
            commands::snapshots::delete_snapshot,
            // Utility (testing / startup)
            commands::util::get_startup_params,
            commands::util::exit_app,
            commands::util::selftest_ping,
        ])
        .run(context)
        .unwrap_or_else(|e| {
            log::error!("Tauri application error: {}", e);
            eprintln!("Fatal: failed to run application: {}", e);
        });
}
