use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::commands::ThemeResult;

fn themes_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let dir = home.join(".markzy").join("themes");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn load_custom_theme(app: AppHandle) -> Result<Option<ThemeResult>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("CSS", &["css"])
        .blocking_pick_file();

    let file_path = match file_path {
        Some(fp) => fp.into_path().map_err(|e| e.to_string())?,
        None => return Ok(None),
    };

    let file_name = file_path
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    let dest = themes_dir()?.join(&file_name);
    fs::copy(&file_path, &dest).map_err(|e| e.to_string())?;

    let css = fs::read_to_string(&dest).map_err(|e| e.to_string())?;

    Ok(Some(ThemeResult {
        name: file_name,
        css,
    }))
}

#[tauri::command]
pub fn load_theme_css(file_name: String) -> Result<Option<String>, String> {
    let path = themes_dir()?.join(&file_name);
    if !path.exists() {
        return Ok(None);
    }
    let css = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(css))
}

pub fn list_custom_theme_names() -> Vec<String> {
    let dir = match themes_dir() {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };

    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "css") {
                if let Some(stem) = path.file_stem() {
                    names.push(stem.to_string_lossy().to_string());
                }
            }
        }
    }
    names.sort();
    names
}
