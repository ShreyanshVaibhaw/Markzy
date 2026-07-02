mod commands;
mod export;
mod slides;
mod theme;
mod watcher;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use watcher::WatcherState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Platform {
    Mac,
    Other,
}

#[cfg(target_os = "macos")]
const PLATFORM: Platform = Platform::Mac;
#[cfg(not(target_os = "macos"))]
const PLATFORM: Platform = Platform::Other;

fn emit_to_main<R: Runtime>(app: &AppHandle<R>, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, ());
    }
}

fn emit_to_main_with_payload<R: Runtime, S: serde::Serialize + Clone>(
    app: &AppHandle<R>,
    event: &str,
    payload: S,
) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, payload);
    }
}

fn build_theme_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "Theme", true)?;

    let theme_names = [
        ("theme-light", "Light"),
        ("theme-dark", "Dark"),
        ("theme-elegant", "Elegant"),
        ("theme-newsprint", "Newsprint"),
        ("theme-cappuccino", "Cappuccino"),
        ("theme-nord", "Nord"),
        ("theme-solarized-light", "Solarized Light"),
        ("theme-solarized-dark", "Solarized Dark"),
        ("theme-dracula", "Dracula"),
        ("theme-github-dark", "GitHub Dark"),
        ("theme-tokyo-night", "Tokyo Night"),
        ("theme-gruvbox", "Gruvbox"),
        ("theme-catppuccin-mocha", "Catppuccin Mocha"),
        ("theme-one-dark", "One Dark"),
    ];

    let mut items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for (id, label) in theme_names {
        let item = MenuItem::with_id(app, id, label, true, None::<&str>)?;
        items.push(Box::new(item));
    }

    let custom_names = theme::list_custom_theme_names();
    if !custom_names.is_empty() {
        let sep2 = PredefinedMenuItem::separator(app)?;
        items.push(Box::new(sep2));
        for name in &custom_names {
            let id = format!("theme-custom:{}", name);
            let item = MenuItem::with_id(app, &id, name, true, None::<&str>)?;
            items.push(Box::new(item));
        }
    }

    let sep1 = PredefinedMenuItem::separator(app)?;
    let import_theme = MenuItem::with_id(
        app,
        "menu-import-theme",
        "Import Theme...",
        true,
        None::<&str>,
    )?;
    items.push(Box::new(sep1));
    items.push(Box::new(import_theme));

    let refs: Vec<&dyn IsMenuItem<R>> = items.iter().map(|b| b.as_ref()).collect();
    submenu.append_items(&refs)?;

    Ok(submenu)
}

fn build_file_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "File", true)?;

    let new = MenuItem::with_id(app, "menu-new", "New", true, Some("CommandOrCtrl+N"))?;
    let new_slides = MenuItem::with_id(
        app,
        "menu-new-slides",
        "New Slides...",
        true,
        Some("CommandOrCtrl+Shift+N"),
    )?;
    let open = MenuItem::with_id(app, "menu-open", "Open...", true, Some("CommandOrCtrl+O"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let save = MenuItem::with_id(app, "menu-save", "Save", true, Some("CommandOrCtrl+S"))?;
    let save_as = MenuItem::with_id(
        app,
        "menu-save-as",
        "Save As...",
        true,
        Some("CommandOrCtrl+Shift+S"),
    )?;
    let close_tab = MenuItem::with_id(
        app,
        "menu-close-tab",
        "Close Tab",
        true,
        Some("CommandOrCtrl+W"),
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let export_pdf =
        MenuItem::with_id(app, "menu-export-pdf", "Export PDF...", true, None::<&str>)?;
    let export_html = MenuItem::with_id(
        app,
        "menu-export-html",
        "Export HTML...",
        true,
        None::<&str>,
    )?;
    let export_slides = MenuItem::with_id(
        app,
        "menu-export-slides",
        "Export Slides...",
        true,
        None::<&str>,
    )?;
    let open_as_slides = MenuItem::with_id(
        app,
        "menu-open-as-slides",
        "Open as Slides",
        true,
        Some("CommandOrCtrl+Shift+P"),
    )?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let close_label = if PLATFORM == Platform::Mac {
        "Close Window"
    } else {
        "Quit"
    };
    let close_accel: Option<&str> = if PLATFORM == Platform::Mac {
        None
    } else {
        Some("CommandOrCtrl+Q")
    };
    let close_item = MenuItem::with_id(app, "menu-close", close_label, true, close_accel)?;

    let items: Vec<&dyn IsMenuItem<R>> = vec![
        &new,
        &new_slides,
        &open,
        &sep1,
        &save,
        &save_as,
        &close_tab,
        &sep2,
        &export_pdf,
        &export_html,
        &export_slides,
        &open_as_slides,
        &sep3,
        &close_item,
    ];
    submenu.append_items(&items)?;

    Ok(submenu)
}

fn build_edit_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "Edit", true)?;

    let undo = PredefinedMenuItem::undo(app, None)?;
    let redo = PredefinedMenuItem::redo(app, None)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    let items: Vec<&dyn IsMenuItem<R>> = vec![&undo, &redo, &sep, &cut, &copy, &paste, &select_all];
    submenu.append_items(&items)?;

    Ok(submenu)
}

fn build_view_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "View", true)?;

    let zoom_in = MenuItem::with_id(
        app,
        "menu-zoom-in",
        "Zoom In",
        true,
        Some("CommandOrCtrl+="),
    )?;
    let zoom_out = MenuItem::with_id(
        app,
        "menu-zoom-out",
        "Zoom Out",
        true,
        Some("CommandOrCtrl+-"),
    )?;
    let reset_zoom = MenuItem::with_id(
        app,
        "menu-reset-zoom",
        "Actual Size",
        true,
        Some("CommandOrCtrl+0"),
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let fullscreen = MenuItem::with_id(
        app,
        "menu-fullscreen",
        "Toggle Fullscreen",
        true,
        Some("F11"),
    )?;

    let items: Vec<&dyn IsMenuItem<R>> = vec![&zoom_in, &zoom_out, &reset_zoom, &sep, &fullscreen];
    submenu.append_items(&items)?;

    Ok(submenu)
}

fn build_help_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "Help", true)?;
    let about = MenuItem::with_id(app, "menu-about", "About Markzy", true, None::<&str>)?;
    submenu.append(&about)?;
    Ok(submenu)
}

fn build_app_menu_mac<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, "Markzy", true)?;

    let about = PredefinedMenuItem::about(app, None, None)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all = PredefinedMenuItem::show_all(app, None)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let items: Vec<&dyn IsMenuItem<R>> =
        vec![&about, &sep1, &hide, &hide_others, &show_all, &sep2, &quit];
    submenu.append_items(&items)?;

    Ok(submenu)
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file_menu = build_file_menu(app)?;
    let edit_menu = build_edit_menu(app)?;
    let view_menu = build_view_menu(app)?;
    let theme_menu = build_theme_menu(app)?;
    let help_menu = build_help_menu(app)?;

    if PLATFORM == Platform::Mac {
        let app_menu = build_app_menu_mac(app)?;
        let items: Vec<&dyn IsMenuItem<R>> = vec![
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &theme_menu,
            &help_menu,
        ];
        Menu::with_items(app, &items)
    } else {
        let items: Vec<&dyn IsMenuItem<R>> =
            vec![&file_menu, &edit_menu, &view_menu, &theme_menu, &help_menu];
        Menu::with_items(app, &items)
    }
}

fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if let Some(rest) = id.strip_prefix("theme-custom:") {
        let file_name = format!("{}.css", rest);
        if let Some(home) = dirs::home_dir() {
            let css_path = home.join(".markzy").join("themes").join(&file_name);
            if let Ok(css) = std::fs::read_to_string(&css_path) {
                emit_to_main_with_payload(app, "set-theme", format!("custom:{}", file_name));
                emit_to_main_with_payload(app, "set-custom-css", css);
            }
        }
        return;
    }

    match id {
        id if id.starts_with("theme-") => {
            let theme = id.strip_prefix("theme-").unwrap_or("light");
            emit_to_main_with_payload(app, "set-theme", theme.to_string());
        }
        "menu-import-theme" => emit_to_main(app, "menu-import-theme"),
        "menu-new" => emit_to_main(app, "new-file"),
        "menu-open" => emit_to_main(app, "menu-open"),
        "menu-save" => emit_to_main(app, "menu-save"),
        "menu-save-as" => emit_to_main(app, "menu-save-as"),
        "menu-close-tab" => emit_to_main(app, "menu-close-tab"),
        "menu-new-slides" => emit_to_main(app, "menu-new-slides"),
        "menu-open-as-slides" => emit_to_main(app, "menu-open-as-slides"),
        "menu-export-pdf" => emit_to_main(app, "menu-export-pdf"),
        "menu-export-html" => emit_to_main(app, "menu-export-html"),
        "menu-export-slides" => emit_to_main(app, "menu-export-slides"),
        "menu-close" => {
            if PLATFORM == Platform::Mac {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                }
            } else {
                app.exit(0);
            }
        }
        "menu-about" => {
            let _ = app
                .opener()
                .open_url("https://github.com/ShreyanshVaibhaw/Markzy", None::<&str>);
        }
        "menu-zoom-in" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("document.body.style.zoom = (parseFloat(document.body.style.zoom||'1')*1.1).toString()");
            }
        }
        "menu-zoom-out" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("document.body.style.zoom = (parseFloat(document.body.style.zoom||'1')*0.9).toString()");
            }
        }
        "menu-reset-zoom" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("document.body.style.zoom='1'");
            }
        }
        "menu-fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(is_fs) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!is_fs);
                }
            }
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::new())
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
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
