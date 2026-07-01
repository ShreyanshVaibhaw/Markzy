use serde::Serialize;

#[derive(Serialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct ThemeResult {
    pub name: String,
    pub css: String,
}

#[tauri::command]
pub fn open_file() -> Result<Option<FileContent>, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn open_file_path(path: String) -> Result<Option<FileContent>, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn save_file(content: String) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn save_file_as(content: String) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn open_external(url: String) -> Result<(), String> {
    todo!()
}
