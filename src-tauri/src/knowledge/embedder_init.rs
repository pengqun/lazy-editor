use crate::knowledge::embedder::Embedder;
use crate::AppState;
use std::sync::Arc;
use tokio::sync::Notify;

/// Pluggable embedder construction (production loads fastembed; tests inject stubs).
pub type EmbedderLoader = Arc<dyn Fn() -> Result<Embedder, String> + Send + Sync>;

pub struct EmbedderInitFlight {
    pub notify: Arc<Notify>,
    pub started: bool,
}

pub fn default_embedder_loader() -> EmbedderLoader {
    Arc::new(|| Embedder::initialize())
}

/// Synchronous startup init (Tauri `setup` hook).
pub fn initialize_embedder_at_startup(loader: &EmbedderLoader) -> (Option<Embedder>, Option<String>) {
    match loader() {
        Ok(embedder) => (Some(embedder), None),
        Err(msg) => (None, Some(msg)),
    }
}

async fn run_embedder_loader(state: &AppState) -> bool {
    let loader = Arc::clone(&state.embedder_loader);
    let init_result = tokio::task::spawn_blocking(move || loader())
        .await
        .map_err(|e| format!("Embedder init task panicked: {}", e));

    match init_result {
        Ok(Ok(embedder)) => {
            *state.embedder.lock().await = Some(embedder);
            *state.embedder_init_error.lock().await = None;
            true
        }
        Ok(Err(msg)) => {
            *state.embedder_init_error.lock().await = Some(msg);
            false
        }
        Err(msg) => {
            *state.embedder_init_error.lock().await = Some(msg.clone());
            false
        }
    }
}

/// Ensure the embedder is loaded when `attempt_init` is true.
///
/// Concurrent callers share a single in-flight initialization attempt.
/// Self-test mode never calls the loader.
pub async fn ensure_embedder_loaded(state: &AppState, attempt_init: bool) -> bool {
    if state.embedder.lock().await.is_some() {
        return true;
    }

    if !attempt_init {
        return false;
    }

    if state.self_test.lock().await.is_some() {
        return false;
    }

    let notify = {
        let mut flight = state.embedder_init_flight.lock().await;
        if flight.is_none() {
            *flight = Some(EmbedderInitFlight {
                notify: Arc::new(Notify::new()),
                started: false,
            });
        }
        flight.as_ref().unwrap().notify.clone()
    };

    let run_as_leader = {
        let mut flight = state.embedder_init_flight.lock().await;
        let slot = flight.as_mut().expect("flight slot");
        if !slot.started {
            slot.started = true;
            true
        } else {
            false
        }
    };

    if run_as_leader {
        let loaded = if state.embedder.lock().await.is_some() {
            true
        } else {
            run_embedder_loader(state).await
        };
        *state.embedder_init_flight.lock().await = None;
        notify.notify_waiters();
        return loaded;
    }

    notify.notified().await;
    state.embedder.lock().await.is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::db::Database;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::time::Duration;
    use tokio::sync::Mutex;

    fn test_state(loader: EmbedderLoader) -> AppState {
        let db = Database::new(&PathBuf::from(":memory:")).unwrap();
        AppState {
            db: Arc::new(Mutex::new(db)),
            embedder: Arc::new(Mutex::new(None)),
            embedder_init_error: Arc::new(Mutex::new(None)),
            embedder_loader: loader,
            embedder_init_flight: Arc::new(Mutex::new(None)),
            workspace_path: Arc::new(Mutex::new(None)),
            cancel_stream: Arc::new(AtomicBool::new(false)),
            self_test: Arc::new(Mutex::new(None)),
        }
    }

    #[tokio::test]
    async fn concurrent_ensure_runs_loader_once() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_loader = Arc::clone(&calls);
        let loader: EmbedderLoader = Arc::new(move || {
            calls_in_loader.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(80));
            Err("injected init failure".into())
        });

        let state = Arc::new(test_state(loader));
        let mut tasks = Vec::new();
        for _ in 0..6 {
            let state = Arc::clone(&state);
            tasks.push(tokio::spawn(async move {
                ensure_embedder_loaded(&state, true).await
            }));
        }
        for task in tasks {
            assert!(!task.await.unwrap());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn self_test_never_invokes_loader() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_loader = Arc::clone(&calls);
        let loader: EmbedderLoader = Arc::new(move || {
            calls_in_loader.fetch_add(1, Ordering::SeqCst);
            Err("should not run".into())
        });
        let state = test_state(loader);
        *state.self_test.lock().await = Some("editor-basic".into());

        assert!(!ensure_embedder_loaded(&state, true).await);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }
}
