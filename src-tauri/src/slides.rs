use std::net::SocketAddr;
use std::path::PathBuf;

use axum::Router;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tower_http::services::ServeDir;

const SLIDES_TEMPLATE_MD: &str = include_str!("../../src/themes-assets/slides/slides-template.md");
const SLIDES_TEMPLATE_HTML: &str = include_str!("../../src/themes-assets/slides/template.html");

fn get_current_file_path(state: &crate::watcher::WatcherState) -> Option<String> {
    state.file_path.lock().ok()?.as_ref().cloned()
}

#[tauri::command]
pub fn new_slides(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("new-slides-content", SLIDES_TEMPLATE_MD);
    }
    Ok(true)
}

#[tauri::command]
pub async fn open_as_slides(
    content: String,
    app: AppHandle,
    state: tauri::State<'_, crate::watcher::WatcherState>,
) -> Result<bool, String> {
    let current_path = get_current_file_path(&state);

    let file_path = match current_path {
        Some(p) => PathBuf::from(p),
        None => {
            let result = app
                .dialog()
                .file()
                .set_title("Create New Slides")
                .set_file_name("slides.md")
                .add_filter("Markdown", &["md"])
                .blocking_save_file();

            let path = match result {
                Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
                None => return Ok(false),
            };

            std::fs::write(&path, SLIDES_TEMPLATE_MD).map_err(|e| e.to_string())?;

            let path_str = path.to_string_lossy().to_string();
            if let Ok(mut guard) = state.file_path.lock() {
                *guard = Some(path_str.clone());
            }
            if let Some(window) = app.get_webview_window("main") {
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Untitled".to_string());
                let _ = window.set_title(&format!("{} \u{2014} Markzy", file_name));
            }

            crate::watcher::start_watcher(&app, &state, &path.to_string_lossy());
            path
        }
    };

    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    let dir = file_path
        .parent()
        .ok_or("Cannot determine file directory")?
        .to_path_buf();

    let md_name = file_path
        .file_name()
        .ok_or("Cannot determine file name")?
        .to_string_lossy()
        .to_string();

    let template_dest = dir.join("template.html");
    let mut html = SLIDES_TEMPLATE_HTML.to_string();

    if md_name != "slides.md" {
        html = html.replace("fetch('slides.md')", &format!("fetch('{}')", md_name));
    }

    std::fs::write(&template_dest, &html).map_err(|e| e.to_string())?;

    let serve_dir = ServeDir::new(dir);
    let router = Router::new().nest_service("/", serve_dir);

    let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;

    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });

    let url = format!("http://127.0.0.1:{}/template.html", actual_port);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())?;

    Ok(true)
}
