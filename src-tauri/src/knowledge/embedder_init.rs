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

/// Marks init finished or clears in-flight state when the leader task is cancelled/dropped.
struct FlightCompletionGuard {
    flight: Arc<StdMutex<Option<EmbedderInitFlight>>>,
    notify: Arc<Notify>,
    finished: std::cell::Cell<bool>,
}

impl FlightCompletionGuard {
    fn complete(&self) {
        *self.flight.lock().expect("embedder_init_flight lock") =
            Some(EmbedderInitFlight::Completed);
        self.notify.notify_waiters();
        self.finished.set(true);
    }
}

impl Drop for FlightCompletionGuard {
    fn drop(&mut self) {
        if !self.finished.get() {
            *self.flight.lock().expect("embedder_init_flight lock") = None;
            self.notify.notify_waiters();
        }
    }
}

enum FlightRole {
    Follower,
    Leader(Arc<Notify>),
}

enum FollowOrLead {
    Follow(Arc<Notify>),
    Lead(Arc<Notify>),
    Completed,
}

/// In-flight or last-completed lazy init (not cleared on failure so stragglers do not re-run the loader).
#[derive(Clone)]
pub enum EmbedderInitFlight {
    InProgress(Arc<Notify>),
    Completed,
}

fn embedder_is_loaded_fast(state: &AppState) -> bool {
    match state.embedder.try_lock() {
        Ok(guard) => guard.is_some(),
        // Contention: do not block here — join the in-flight init instead.
        Err(_) => false,
    }
}

async fn wait_for_embedder_init_follower(notify: Arc<Notify>) {
    let mut notified = std::pin::pin!(notify.notified());
    notified.as_mut().enable();
    notified.as_mut().await;
}

/// Register for the current init flight.
async fn join_embedder_init_flight(state: &AppState) -> FlightRole {
    let role = {
        let mut flight = state
            .embedder_init_flight
            .lock()
            .expect("embedder_init_flight lock");

        match flight.as_ref() {
            Some(EmbedderInitFlight::InProgress(notify)) => FollowOrLead::Follow(Arc::clone(notify)),
            Some(EmbedderInitFlight::Completed) => FollowOrLead::Completed,
            None => {
                let notify = Arc::new(Notify::new());
                *flight = Some(EmbedderInitFlight::InProgress(notify.clone()));
                FollowOrLead::Lead(notify)
            }
        }
    };

    match role {
        FollowOrLead::Follow(notify) => {
            wait_for_embedder_init_follower(notify).await;
            FlightRole::Follower
        }
        FollowOrLead::Completed => FlightRole::Follower,
        FollowOrLead::Lead(notify) => FlightRole::Leader(notify),
    }
}

/// Ensure the embedder is loaded when `attempt_init` is true.
///
/// One loader call per in-flight group; concurrent callers wait on the same Notify.
/// Self-test mode never calls the loader.
pub async fn ensure_embedder_loaded(state: &AppState, attempt_init: bool) -> bool {
    if !attempt_init {
        return state.embedder.lock().await.is_some();
    }

    if state.self_test.lock().await.is_some() {
        return false;
    }

    if embedder_is_loaded_fast(state) {
        return true;
    }

    match join_embedder_init_flight(state).await {
        FlightRole::Follower => state.embedder.lock().await.is_some(),
        FlightRole::Leader(notify) => {
            let completion = FlightCompletionGuard {
                flight: Arc::clone(&state.embedder_init_flight),
                notify: notify.clone(),
                finished: std::cell::Cell::new(false),
            };

            if state.embedder.lock().await.is_some() {
                completion.complete();
                return true;
            }

            let loaded = run_embedder_loader(state).await;
            completion.complete();
            loaded
        }
    }
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

    /// Reproduces the pre-fix follower bug: `notify_waiters()` before `Notified` registration.
    #[tokio::test]
    async fn missed_notify_without_enable_times_out() {
        let notify = Arc::new(Notify::new());
        let notify_for_follower = Arc::clone(&notify);
        let notify_for_leader = Arc::clone(&notify);

        let follower = tokio::spawn(async move {
            tokio::task::yield_now().await;
            notify_for_follower.notified().await;
        });

        tokio::task::yield_now().await;
        notify_for_leader.notify_waiters();

        let result = tokio::time::timeout(Duration::from_millis(200), follower).await;
        assert!(
            result.is_err(),
            "awaiting notified() without enable() first must not complete after notify_waiters()"
        );
    }

    #[tokio::test]
    async fn notified_enable_before_notify_waiters_wakes() {
        let notify = Arc::new(Notify::new());
        let notify_for_follower = Arc::clone(&notify);
        let notify_for_leader = Arc::clone(&notify);

        let follower = tokio::spawn(async move {
            let mut notified = std::pin::pin!(notify_for_follower.notified());
            notified.as_mut().enable();
            tokio::task::yield_now().await;
            notified.as_mut().await;
        });

        tokio::task::yield_now().await;
        notify_for_leader.notify_waiters();

        tokio::time::timeout(Duration::from_secs(1), follower)
            .await
            .expect("enabled follower should not miss notify_waiters")
            .expect("follower panicked");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_instant_loader_single_call_no_hang() {
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_in_loader = Arc::clone(&calls);
        let loader: EmbedderLoader = Arc::new(move || {
            calls_in_loader.fetch_add(1, Ordering::SeqCst);
            Err("instant injected failure".into())
        });

        let state = Arc::new(test_state(loader));
        let ready = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();

        for _ in 0..8 {
            let state = Arc::clone(&state);
            let ready = Arc::clone(&ready);
            tasks.push(tokio::spawn(async move {
                ready.fetch_add(1, Ordering::SeqCst);
                while ready.load(Ordering::SeqCst) < 8 {
                    tokio::task::yield_now().await;
                }
                tokio::time::timeout(
                    Duration::from_secs(2),
                    ensure_embedder_loaded(&state, true),
                )
                .await
                .expect("ensure should not hang when notify registration races")
            }));
        }

        for task in tasks {
            assert!(!task.await.unwrap());
        }
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "instant failure must still single-flight all concurrent callers"
        );
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
            matches!(
                state.embedder_init_flight.lock().unwrap().as_ref(),
                Some(EmbedderInitFlight::Completed)
            ),
            "second init should finish and mark the flight completed"
        );
    }
}
