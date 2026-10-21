use tauri::ipc::Response;

/// Reads a file and returns its raw bytes. `Response` skips JSON encoding,
/// so a large PDF crosses the IPC bridge as a binary buffer.
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Response, String> {
    read_blocking(&path).await.map(Response::new)
}

async fn read_blocking(path: &str) -> Result<Vec<u8>, String> {
    let path = path.to_owned();
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Não foi possível ler o arquivo: {e}"))
}

/// PDF path passed on the command line (`PDF Canvas.app --args file.pdf`).
#[tauri::command]
pub fn initial_file() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|arg| arg.to_lowercase().ends_with(".pdf"))
}
