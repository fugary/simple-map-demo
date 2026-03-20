#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::menu::{Menu, PredefinedMenuItem, Submenu, AboutMetadata};
            let handle = app.handle();
            let mut menu = Menu::default(handle)?;
            
            let about_metadata = AboutMetadata {
                version: Some(app.package_info().version.to_string()),
                authors: Some(vec!["gary.fu".to_string()]),
                comments: Some(app.package_info().description.to_string()),
                ..Default::default()
            };
            let about_menu = PredefinedMenuItem::about(handle, None, Some(about_metadata))?;
            let help_submenu = Submenu::with_items(handle, "关于 (About)", true, &[&about_menu])?;
            
            menu.append(&help_submenu)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
