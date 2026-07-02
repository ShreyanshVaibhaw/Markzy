use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::commands::resolve_image_paths;

pub struct WatcherState {
    pub file_path: Arc<Mutex<Option<String>>>,
    pub is_internal_save: Arc<AtomicBool>,
    pub     task_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            file_path: Arc::new(Mutex::new(None)),
            is_internal_save: Arc::new(AtomicBool::new(false)),
            task_handle: Mutex::new(None),
        }
    }
}

impl Default for WatcherState {
    fn default() -> Self {
        Self::new()
    }
}

fn stop_watcher_internal(state: &WatcherState) {
    if let Ok(mut guard) = state.task_handle.lock() {
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }
}

pub fn start_watcher(app: &AppHandle, state: &WatcherState, path: &str) {
    stop_watcher_internal(state);

    if let Ok(mut guard) = state.file_path.lock() {
        *guard = Some(path.to_string());
    }

    let app_handle = app.clone();
    let file_path_arc = Arc::clone(&state.file_path);
    let is_internal_save = Arc::clone(&state.is_internal_save);

    let handle = tauri::async_runtime::spawn(async move {
        let target = match file_path_arc.lock().unwrap().as_ref() {
            Some(p) => PathBuf::from(p),
            None => return,
        };

        let target_for_closure = target.clone();
        let (tx, mut rx) = mpsc::channel::<()>(100);

        let mut debouncer = match new_debouncer(
            Duration::from_millis(100),
            move |res: DebounceEventResult| {
                if let Ok(events) = res {
                    for event in events {
                        if event.path == target_for_closure {
                            let _ = tx.try_send(());
                        }
                    }
                }
            },
        ) {
            Ok(d) => d,
            Err(_) => return,
        };

        let watch_dir = target.parent().unwrap_or(&target);
        if debouncer
            .watcher()
            .watch(watch_dir, notify::RecursiveMode::NonRecursive)
            .is_err()
        {
            return;
        }

        let mut timer_handle: Option<tauri::async_runtime::JoinHandle<()>> = None;
        let is_active = Arc::new(AtomicBool::new(false));

        while rx.recv().await.is_some() {
            if is_internal_save.load(Ordering::Relaxed) {
                continue;
            }

            let content = match std::fs::read_to_string(&target) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let resolved = resolve_image_paths(&content, &target);
            let _ = app_handle.emit("file-changed", &resolved);

            if !is_active.load(Ordering::Relaxed) {
                is_active.store(true, Ordering::Relaxed);
                let _ = app_handle.emit("agent-activity", "active");
            }

            if let Some(h) = timer_handle.take() {
                h.abort();
            }

            let app_clone = app_handle.clone();
            let active_clone = Arc::clone(&is_active);
            timer_handle = Some(tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(3)).await;
                let _ = app_clone.emit("agent-activity", "cooldown");
                tokio::time::sleep(Duration::from_secs(2)).await;
                let _ = app_clone.emit("agent-activity", "idle");
                active_clone.store(false, Ordering::Relaxed);
            }));
        }

        if let Some(h) = timer_handle {
            h.abort();
        }
    });

    if let Ok(mut guard) = state.task_handle.lock() {
        *guard = Some(handle);
    }
}

pub fn stop_watcher(state: &WatcherState) {
    stop_watcher_internal(state);
    if let Ok(mut guard) = state.file_path.lock() {
        *guard = None;
    }
}

#[tauri::command]
pub fn watch_file(
    path: String,
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    start_watcher(&app, &state, &path);
    Ok(())
}

#[tauri::command]
pub fn stop_watch(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    stop_watcher(&state);
    Ok(())
}
