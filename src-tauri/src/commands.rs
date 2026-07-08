use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::watcher::{start_watcher, stop_watcher, WatcherState};
use crate::StartupFiles;

#[derive(Serialize, Clone)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
pub struct ThemeResult {
    pub name: String,
    pub css: String,
}

fn is_markdown_ext(path: &Path) -> bool {
    let ext = match path.extension().and_then(|e| e.to_str()) {
        Some(e) => e.to_ascii_lowercase(),
        None => return false,
    };
    matches!(ext.as_str(), "md" | "markdown" | "mdown" | "mkd")
}

pub fn resolve_image_paths(content: &str, file_path: &Path) -> String {
    let dir = match file_path.parent() {
        Some(d) => d,
        None => return content.to_string(),
    };

    let re = match Regex::new(r"!\[([^\]]*)\]\(([^)]+)\)") {
        Ok(r) => r,
        Err(_) => return content.to_string(),
    };

    re.replace_all(content, |caps: &regex::Captures| {
        let alt = &caps[1];
        let raw_src = &caps[2];

        let (url, title) = match raw_src.rsplit_once(' ') {
            Some((u, t)) if t.starts_with('\"') && t.ends_with('\"') && t.len() >= 2 => {
                (u.trim(), Some(t))
            }
            _ => (raw_src.trim(), None),
        };

        let url = url
            .strip_prefix('<')
            .and_then(|s| s.strip_suffix('>'))
            .unwrap_or(url);

        if url.starts_with("http://")
            || url.starts_with("https://")
            || url.starts_with("file://")
            || url.starts_with("data:")
        {
            match title {
                Some(t) => format!("![{}]({} {})", alt, url, t),
                None => format!("![{}]({})", alt, url),
            }
        } else {
            let abs = dir.join(url);
            let abs_str = abs.to_string_lossy().replace('\\', "/");
            let prefix = if abs_str.starts_with('/') { "" } else { "/" };
            match title {
                Some(t) => format!("![{}](file://{}{} {})", alt, prefix, abs_str, t),
                None => format!("![{}](file://{}{})", alt, prefix, abs_str),
            }
        }
    })
    .to_string()
}

fn suggest_file_name(content: &str, current_path: Option<&str>) -> Option<String> {
    if let Some(path) = current_path {
        if let Some(stem) = Path::new(path).file_stem() {
            return Some(stem.to_string_lossy().to_string());
        }
    }

    for line in content.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix('#') {
            if rest.chars().next().is_some_and(|c| c.is_whitespace()) {
                let name = rest.trim();
                if !name.is_empty() {
                    return clean_filename(name);
                }
            }
        }
    }

    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            return clean_filename(trimmed);
        }
    }

    None
}

fn clean_filename(s: &str) -> Option<String> {
    let cleaned: String = s.chars().filter(|c| !"/\\:*?\"<>|".contains(*c)).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return None;
    }
    let truncated: String = trimmed.chars().take(60).collect();
    if truncated.is_empty() {
        None
    } else {
        Some(truncated)
    }
}

fn update_title(app: &AppHandle, path: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let filename = path
            .map(|p| {
                Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Untitled".to_string())
            })
            .unwrap_or_else(|| "Untitled".to_string());
        let _ = window.set_title(&format!("{} \u{2014} Markzy", filename));
    }
}

#[tauri::command]
pub fn open_file(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<Option<FileContent>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd"])
        .add_filter("Text", &["txt"])
        .add_filter("All Files", &["*"])
        .blocking_pick_file();

    let file_path = match file_path {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(None),
    };

    let path_str = file_path.to_string_lossy().to_string();
    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let resolved = resolve_image_paths(&content, &file_path);

    stop_watcher(&state);
    start_watcher(&app, &state, &path_str);
    update_title(&app, Some(&path_str));

    Ok(Some(FileContent {
        path: path_str,
        content: resolved,
    }))
}

#[tauri::command]
pub fn open_file_path(
    path: String,
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<Option<FileContent>, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() || !is_markdown_ext(file_path) {
        return Ok(None);
    }

    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let resolved = resolve_image_paths(&content, file_path);

    stop_watcher(&state);
    start_watcher(&app, &state, &path);
    update_title(&app, Some(&path));

    Ok(Some(FileContent {
        path,
        content: resolved,
    }))
}

#[tauri::command]
pub fn save_file(
    content: String,
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<bool, String> {
    let current_path = state
        .file_path
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .cloned();

    let save_path = match current_path {
        Some(p) => p,
        None => {
            let suggested = suggest_file_name(&content, None);
            let file_path = app
                .dialog()
                .file()
                .set_file_name(suggested.unwrap_or_else(|| "untitled".to_string()))
                .add_filter("Markdown", &["md"])
                .add_filter("All Files", &["*"])
                .blocking_save_file();

            match file_path {
                Some(fp) => fp
                    .into_path()
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .to_string(),
                None => return Ok(false),
            }
        }
    };

    state.is_internal_save.store(true, Ordering::Relaxed);

    std::fs::write(&save_path, &content).map_err(|e| {
        state.is_internal_save.store(false, Ordering::Relaxed);
        e.to_string()
    })?;

    stop_watcher(&state);
    start_watcher(&app, &state, &save_path);
    update_title(&app, Some(&save_path));

    let flag = Arc::clone(&state.is_internal_save);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        flag.store(false, Ordering::Relaxed);
    });

    Ok(true)
}

#[tauri::command]
pub fn save_file_as(
    content: String,
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<bool, String> {
    let current_path = state
        .file_path
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .cloned();

    let suggested = suggest_file_name(&content, current_path.as_deref());
    let file_path = app
        .dialog()
        .file()
        .set_file_name(suggested.unwrap_or_else(|| "untitled".to_string()))
        .add_filter("Markdown", &["md"])
        .add_filter("All Files", &["*"])
        .blocking_save_file();

    let save_path = match file_path {
        Some(fp) => fp
            .into_path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string(),
        None => return Ok(false),
    };

    state.is_internal_save.store(true, Ordering::Relaxed);

    std::fs::write(&save_path, &content).map_err(|e| {
        state.is_internal_save.store(false, Ordering::Relaxed);
        e.to_string()
    })?;

    stop_watcher(&state);
    start_watcher(&app, &state, &save_path);
    update_title(&app, Some(&save_path));

    let flag = Arc::clone(&state.is_internal_save);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        flag.store(false, Ordering::Relaxed);
    });

    Ok(true)
}

#[tauri::command]
pub fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http(s) URLs are allowed".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_startup_files(state: tauri::State<'_, StartupFiles>) -> Vec<String> {
    state
        .paths
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
        .unwrap_or_default()
}
