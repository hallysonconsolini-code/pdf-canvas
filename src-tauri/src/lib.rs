mod files;
mod sidecar;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

/// Set once the UI has saved pending work and allowed the app to quit.
static QUIT_ALLOWED: AtomicBool = AtomicBool::new(false);
/// How long the UI gets to save before the app quits anyway.
const SAVE_TIMEOUT: Duration = Duration::from_secs(4);

/// Asks the UI to save, then quits (or quits after a timeout).
fn request_quit(app: &AppHandle) {
    let _ = app.emit("quit-requested", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SAVE_TIMEOUT);
        QUIT_ALLOWED.store(true, Ordering::SeqCst);
        handle.exit(0);
    });
}

/// Called by the UI once pending annotations are saved.
#[tauri::command]
fn quit_now(app: AppHandle) {
    QUIT_ALLOWED.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let quit = MenuItemBuilder::with_id("quit", "Encerrar PDF Canvas").accelerator("CmdOrCtrl+Q").build(app)?;
    let app_menu = SubmenuBuilder::new(app, "PDF Canvas")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;

    let open = MenuItemBuilder::with_id("open", "Abrir…").accelerator("CmdOrCtrl+O").build(app)?;
    let file = SubmenuBuilder::new(app, "Arquivo").item(&open).build()?;

    // Undo/redo are app actions (annotations), not the web view's text undo.
    let undo = MenuItemBuilder::with_id("undo", "Desfazer").accelerator("CmdOrCtrl+Z").build(app)?;
    let redo = MenuItemBuilder::with_id("redo", "Refazer").accelerator("CmdOrCtrl+Shift+Z").build(app)?;
    let edit = SubmenuBuilder::new(app, "Editar")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window = SubmenuBuilder::new(app, "Janela").minimize().fullscreen().build()?;

    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &window]).build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == "quit" {
                request_quit(app);
            } else {
                let _ = app.emit("menu", id);
            }
        })
        .on_window_event(|window, event| {
            // Closing the window quits the app; save first.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !QUIT_ALLOWED.load(Ordering::SeqCst) {
                    api.prevent_close();
                    request_quit(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            files::read_file_bytes,
            files::initial_file,
            sidecar::read_sidecar,
            sidecar::write_sidecar,
            sidecar::backup_sidecar,
            quit_now,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Dock "Quit", logout, etc.
        if let RunEvent::ExitRequested { api, code: None, .. } = event {
            if !QUIT_ALLOWED.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_quit(handle);
            }
        }
    });
}
