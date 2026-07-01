use crate::commands::ThemeResult;

#[tauri::command]
pub fn load_custom_theme() -> Result<Option<ThemeResult>, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn load_theme_css(file_name: String) -> Result<Option<String>, String> {
    todo!()
}
