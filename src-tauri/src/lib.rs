mod commands;
mod export;
mod slides;
mod theme;
mod watcher;

use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::open_file_path,
            commands::save_file,
            commands::save_file_as,
            commands::open_external,
            export::export_pdf,
            export::export_html,
            export::export_slides,
            slides::new_slides,
            slides::open_as_slides,
            theme::load_custom_theme,
            theme::load_theme_css,
            watcher::watch_file,
            watcher::stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
