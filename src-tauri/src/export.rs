#[tauri::command]
pub fn export_pdf() -> Result<bool, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn export_html(html: String) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
#[allow(unused_variables)]
pub fn export_slides(content: String) -> Result<bool, String> {
    todo!()
}
