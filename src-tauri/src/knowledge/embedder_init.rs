use crate::knowledge::embedder::Embedder;
use crate::AppState;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Notify;

/// Pluggable embedder construction (production loads fastembed; tests inject stubs).
pub type EmbedderLoader = Arc<dyn Fn() -> Result<Embedder, String> + Send + Sync>;

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

async fn apply_embedder_init_failure(state: &AppState, msg: String) {
    *state.embedder.lock().await = None;
    *state.embedder_init_error.lock().await = Some(msg);
}

async fn apply_embedder_init_success(state: &AppState, embedder: Embedder) {
    *state.embedder.lock().await = Some(embedder);
    *state.embedder_init_error.lock().await = None;
}

async fn run_embedder_loader(state: &AppState) -> bool {
    let loader = Arc::clone(&state.embedder_loader);
    let init_result = tokio::task::spawn_blocking(move || loader())
        .await
        .map_err(|e| format!("Embedder init task panicked: {}", e));

    match init_result {
        Ok(Ok(embedder)) => {
            apply_embedder_init_success(state, embedder).await;
            true
        }
        Ok(Err(msg)) => {
            apply_embedder_init_failure(state, msg).await;
            false
        }
        Err(msg) => {
            apply_embedder_init_failure(state, msg).await;
            false
        }
    }
}

/// Clears in-flight state and wakes waiters when the leader task is cancelled/dropped.
struct FlightCompletionGuard {
    flight: Arc<StdMutex<Option<Arc<Notify>>>>,
    notify: Arc<Notify>,
}

impl Drop for FlightCompletionGuard {
    fn drop(&mut self) {
        *self.flight.lock().expect("embedder_init_flight lock") = None;
        self.notify.notify_waiters();
    }
}

/// Ensure the embedder is loaded when `attempt_init` is true.
///
/// One loader call per in-flight group; concurrent callers wait on the same Notify.
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

    let waiter = {
        let mut flight = state
            .embedder_init_flight
            .lock()
            .expect("embedder_init_flight lock");
        if let Some(notify) = flight.as_ref() {
            Some(notify.clone())
        } else {
            let notify = Arc::new(Notify::new());
            *flight = Some(notify.clone());
            None
        }
    };

    if let Some(notify) = waiter {
        notify.notified().await;
        return state.embedder.lock().await.is_some();
    }

    let notify = state
        .embedder_init_flight
        .lock()
        .expect("embedder_init_flight lock")
        .clone()
        .expect("leader flight notify");

    let _completion = FlightCompletionGuard {
        flight: Arc::clone(&state.embedder_init_flight),
        notify: notify.clone(),
    };

    if state.embedder.lock().await.is_some() {
        return true;
    }

    run_embedder_loader(state).await
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
            embedder_init_flight: Arc::new(StdMutex::new(None)),
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

    #[tokio::test]
    async fn init_failure_clears_stale_embedder_and_sets_error() {
        let loader: EmbedderLoader = Arc::new(|| Err("loader failed".into()));
        let state = test_state(loader);
        *state.embedder_init_error.lock().await = Some("stale error".into());
        // Simulate inconsistent prior state: loaded handle without cleared error.
        *state.embedder.lock().await = None;

        assert!(!ensure_embedder_loaded(&state, true).await);
        assert!(state.embedder.lock().await.is_none());
        assert_eq!(
            state.embedder_init_error.lock().await.as_deref(),
            Some("loader failed")
        );
    }

    #[tokio::test]
    async fn cancelled_leader_releases_flight_for_next_request() {
        let release_loader = Arc::new(AtomicBool::new(false));
        let release_loader_in_fn = Arc::clone(&release_loader);
        let loader: EmbedderLoader = Arc::new(move || {
            while !release_loader_in_fn.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(5));
            }
            Err("blocked loader finished".into())
        });

        let state = Arc::new(test_state(loader));
        let state_for_leader = Arc::clone(&state);
        let leader = tokio::spawn(async move {
            ensure_embedder_loaded(&state_for_leader, true).await
        });

        tokio::time::sleep(Duration::from_millis(40)).await;
        leader.abort();
        let _ = leader.await;

        release_loader.store(true, Ordering::SeqCst);

        let second = tokio::time::timeout(
            Duration::from_secs(2),
            ensure_embedder_loaded(&state, true),
        )
        .await
        .expect("second init should not hang after leader cancel");

        assert!(!second);
        assert!(
            state.embedder_init_flight.lock().unwrap().is_none(),
            "flight slot must be cleared"
        );
    }
}
