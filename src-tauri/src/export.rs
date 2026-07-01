use std::path::PathBuf;

use base64::Engine;
use regex::Regex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::watcher::WatcherState;

fn get_current_file_path(state: &WatcherState) -> Option<String> {
    state.file_path.lock().ok()?.as_ref().cloned()
}

fn image_mime(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

#[tauri::command]
pub fn export_html(html: String, app: AppHandle) -> Result<bool, String> {
    let result = app
        .dialog()
        .file()
        .set_title("Export HTML")
        .set_file_name("export.html")
        .add_filter("HTML", &["html"])
        .blocking_save_file();

    let path = match result {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(false),
    };

    std::fs::write(&path, &html).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn export_pdf(app: AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    window.print().map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn export_slides(
    content: String,
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<bool, String> {
    let current_path = get_current_file_path(&state).ok_or("No file open")?;
    let file_path = PathBuf::from(&current_path);
    let src_dir = file_path
        .parent()
        .ok_or("Cannot determine source directory")?
        .to_path_buf();

    let video_re =
        Regex::new(r"<!--\s*type:\s*video[^>]*src:\s*([^\s,>]+)").map_err(|e| e.to_string())?;
    let video_refs: Vec<String> = video_re
        .captures_iter(&content)
        .map(|c| c[1].trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let has_video = !video_refs.is_empty();

    let (dest_dir, dest_html) = if has_video {
        let result = app
            .dialog()
            .file()
            .set_title("Export Slides Folder")
            .set_file_name("slides-export")
            .blocking_save_file();

        let path = match result {
            Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
            None => return Ok(false),
        };

        let dest_dir = path;
        let dest_html = dest_dir.join("index.html");
        std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
        (dest_dir, dest_html)
    } else {
        let result = app
            .dialog()
            .file()
            .set_title("Export Slides")
            .set_file_name("slides.html")
            .add_filter("HTML", &["html"])
            .blocking_save_file();

        let path = match result {
            Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
            None => return Ok(false),
        };

        let dest_dir = path
            .parent()
            .ok_or("Cannot determine destination directory")?
            .to_path_buf();
        (dest_dir, path)
    };

    let template_path = src_dir.join("template.html");
    let mut html = std::fs::read_to_string(&template_path)
        .map_err(|e| format!("Cannot read template.html: {}", e))?;

    let escaped = content.replace('`', "\\`").replace('$', "\\$");
    let fetch_re = Regex::new(r"fetch\('[^']+'\)\s*\n?\s*\.then\(r => r\.text\(\)\)")
        .map_err(|e| e.to_string())?;
    html = fetch_re
        .replace_all(&html, format!("Promise.resolve(`{}`)", escaped))
        .to_string();

    let img_re = Regex::new(r"!\[[^\]]*\]\(([^)]+)\)").map_err(|e| e.to_string())?;

    let mut inlined: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for caps in img_re.captures_iter(&content) {
        let img_path = caps[1].trim().to_string();
        if inlined.contains_key(&img_path) {
            continue;
        }
        if img_path.starts_with("http://")
            || img_path.starts_with("https://")
            || img_path.starts_with("data:")
        {
            continue;
        }
        let abs = src_dir.join(&img_path);
        if let Ok(data) = std::fs::read(&abs) {
            let ext = std::path::Path::new(&img_path)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_else(|| "png".to_string());
            let mime = image_mime(&ext);
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            inlined.insert(img_path.clone(), format!("data:{};base64,{}", mime, b64));
        }
    }

    for (src, data_url) in &inlined {
        html = html
            .replace(
                &format!("src=\"{}\"", src),
                &format!("src=\"{}\"", data_url),
            )
            .replace(&format!("src='{}'", src), &format!("src='{}'", data_url));
    }

    if has_video {
        for video_src in &video_refs {
            let src_path = src_dir.join(video_src);
            let dest_path = dest_dir.join(video_src);
            let _ = std::fs::copy(&src_path, &dest_path);
        }
    }

    std::fs::write(&dest_html, &html).map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("export-complete", ());
    }

    Ok(true)
}
