use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};

/// PDF opened from Finder before the UI was ready to receive it.
pub static PENDING_OPEN: Mutex<Option<String>> = Mutex::new(None);

/// Reads a file and returns its raw bytes. `Response` skips JSON encoding,
/// so a large PDF crosses the IPC bridge as a binary buffer.
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || fs::read(&path))
        .await
        .map_err(|e| e.to_string())?
        .map(Response::new)
        .map_err(|e| format!("Não foi possível ler o arquivo: {e}"))
}

/// Writes raw bytes (the request body) to the path in the `path` header
/// (percent-encoded). Writes to a temp file first, then renames.
#[tauri::command]
pub async fn write_file_bytes(request: Request<'_>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Conteúdo inválido".into());
    };
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Caminho ausente")?;
    let path = percent_decode(encoded)?;
    let target = Path::new(&path);
    let tmp = target.with_extension(format!("tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&tmp, target)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Não foi possível salvar o arquivo: {e}"));
    }
    Ok(())
}

/// PDF to open at launch: from the command line, or from Finder ("Abrir com").
#[tauri::command]
pub fn initial_file() -> Option<String> {
    if let Some(path) = PENDING_OPEN.lock().ok().and_then(|mut p| p.take()) {
        return Some(path);
    }
    std::env::args().skip(1).find(|arg| arg.to_lowercase().ends_with(".pdf"))
}

fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|e| e.to_string())?;
            out.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|e| e.to_string())
}
