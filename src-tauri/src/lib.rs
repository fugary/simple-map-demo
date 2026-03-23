#[tauri::command]
fn update_menu_language(app: tauri::AppHandle, lang: String) {
    if let Ok(menu) = build_menu(&app, &lang) {
        let _ = app.set_menu(menu);
    }
}

fn build_menu(app: &tauri::AppHandle, lang: &str) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, Submenu, PredefinedMenuItem, AboutMetadata};
    
    let is_zh = lang.starts_with("zh");
    
    let about_metadata = AboutMetadata {
        version: Some(app.package_info().version.to_string()),
        authors: Some(vec!["gary.fu".to_string()]),
        comments: Some(app.package_info().description.to_string()),
        ..Default::default()
    };
    
    let menu = Menu::new(app)?;
    
    // MacOS App Menu
    #[cfg(target_os = "macos")]
    {
        let pkg_name = &app.package_info().name;
        let app_menu = Submenu::new(app, pkg_name, true)?;
        app_menu.append(&PredefinedMenuItem::about(app, None, Some(about_metadata.clone()))?)?;
        app_menu.append(&PredefinedMenuItem::separator(app)?)?;
        app_menu.append(&PredefinedMenuItem::quit(app, None)?)?;
        menu.append(&app_menu)?;
    }

    // File
    let file_text = if is_zh { "文件" } else { "File" };
    let file_menu = Submenu::new(app, file_text, true)?;
    file_menu.append(&PredefinedMenuItem::close_window(app, if is_zh { Some("关闭窗口") } else { Some("Close Window") })?)?;
    #[cfg(not(target_os = "macos"))]
    file_menu.append(&PredefinedMenuItem::quit(app, if is_zh { Some("退出") } else { Some("Quit") })?)?;
    menu.append(&file_menu)?;

    // Edit
    let edit_text = if is_zh { "编辑" } else { "Edit" };
    let edit_menu = Submenu::new(app, edit_text, true)?;
    edit_menu.append(&PredefinedMenuItem::undo(app, if is_zh { Some("撤销") } else { Some("Undo") })?)?;
    edit_menu.append(&PredefinedMenuItem::redo(app, if is_zh { Some("重做") } else { Some("Redo") })?)?;
    edit_menu.append(&PredefinedMenuItem::separator(app)?)?;
    edit_menu.append(&PredefinedMenuItem::cut(app, if is_zh { Some("剪切") } else { Some("Cut") })?)?;
    edit_menu.append(&PredefinedMenuItem::copy(app, if is_zh { Some("复制") } else { Some("Copy") })?)?;
    edit_menu.append(&PredefinedMenuItem::paste(app, if is_zh { Some("粘贴") } else { Some("Paste") })?)?;
    edit_menu.append(&PredefinedMenuItem::select_all(app, if is_zh { Some("全选") } else { Some("Select All") })?)?;
    menu.append(&edit_menu)?;

    // View
    let view_text = if is_zh { "视图" } else { "View" };
    let view_menu = Submenu::new(app, view_text, true)?;
    view_menu.append(&PredefinedMenuItem::fullscreen(app, if is_zh { Some("全屏") } else { Some("Fullscreen") })?)?;
    menu.append(&view_menu)?;

    // Window
    let window_text = if is_zh { "窗口" } else { "Window" };
    let window_menu = Submenu::new(app, window_text, true)?;
    window_menu.append(&PredefinedMenuItem::minimize(app, if is_zh { Some("最小化") } else { Some("Minimize") })?)?;
    menu.append(&window_menu)?;

    // Help
    let help_text = if is_zh { "帮助" } else { "Help" };
    let help_menu = Submenu::new(app, help_text, true)?;
    #[cfg(not(target_os = "macos"))]
    {
        let about_text = if is_zh { "关于" } else { "About" };
        let about_item = PredefinedMenuItem::about(app, Some(about_text), Some(about_metadata))?;
        help_menu.append(&about_item)?;
    }
    menu.append(&help_menu)?;

    Ok(menu)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![update_menu_language])
        .setup(|app| {
            let handle = app.handle();
            // Default to Chinese or get from localstorage if possible, but we'll let frontend call update_menu_language soon after load.
            if let Ok(menu) = build_menu(handle, "zh-CN") {
                let _ = app.set_menu(menu);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
