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
    let export = MenuItemBuilder::with_id("export", "Exportar PDF anotado…").accelerator("CmdOrCtrl+Shift+E").build(app)?;
    let close = MenuItemBuilder::with_id("close", "Fechar PDF").accelerator("CmdOrCtrl+W").build(app)?;
    let file = SubmenuBuilder::new(app, "Arquivo")
        .item(&open)
        .separator()
        .item(&export)
        .separator()
        .item(&close)
        .build()?;

    // Undo/redo are app actions (annotations), not the web view's text undo.
    let undo = MenuItemBuilder::with_id("undo", "Desfazer").accelerator("CmdOrCtrl+Z").build(app)?;
    let redo = MenuItemBuilder::with_id("redo", "Refazer").accelerator("CmdOrCtrl+Shift+Z").build(app)?;
    let select_all = MenuItemBuilder::with_id("select-all", "Selecionar tudo").accelerator("CmdOrCtrl+A").build(app)?;
    let edit = SubmenuBuilder::new(app, "Editar")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&select_all)
        .build()?;

    let thumbnails = MenuItemBuilder::with_id("thumbnails", "Miniaturas das páginas").accelerator("CmdOrCtrl+B").build(app)?;
    let zoom_in = MenuItemBuilder::with_id("zoom-in", "Aumentar zoom").accelerator("CmdOrCtrl+=").build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom-out", "Diminuir zoom").accelerator("CmdOrCtrl+-").build(app)?;
    let fit = MenuItemBuilder::with_id("fit-width", "Ajustar à largura").accelerator("CmdOrCtrl+0").build(app)?;
    let dark = MenuItemBuilder::with_id("theme-toggle", "Alternar tema claro/escuro").accelerator("Alt+Shift+D").build(app)?;
    let system = MenuItemBuilder::with_id("theme-system", "Usar aparência do sistema").build(app)?;
    let dark_pages = MenuItemBuilder::with_id("dark-pages", "Escurecer páginas no tema escuro").build(app)?;
    let view = SubmenuBuilder::new(app, "Visualizar")
        .item(&dark)
        .item(&system)
        .item(&dark_pages)
        .separator()
        .item(&thumbnails)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&fit)
        .build()?;

    let window = SubmenuBuilder::new(app, "Janela").minimize().fullscreen().build()?;

    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &view, &window]).build()
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
            files::write_file_bytes,
            files::initial_file,
            sidecar::read_sidecar,
            sidecar::write_sidecar,
            sidecar::backup_sidecar,
            quit_now,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| match event {
        // Dock "Quit", logout, etc.
        RunEvent::ExitRequested { api, code: None, .. } => {
            if !QUIT_ALLOWED.load(Ordering::SeqCst) {
                api.prevent_exit();
                request_quit(handle);
            }
        }
        // Finder "Open With" / double-click on a PDF.
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let path = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .find(|p| p.to_lowercase().ends_with(".pdf"));
            if let Some(path) = path {
                if let Ok(mut pending) = files::PENDING_OPEN.lock() {
                    *pending = Some(path.clone());
                }
                let _ = handle.emit("open-file", path);
            }
        }
        _ => {}
    });
}
