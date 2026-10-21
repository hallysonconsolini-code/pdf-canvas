//! Annotation sidecar files: `<file>.pdf.annotations.json` next to the PDF.
//! When the PDF's folder is not writable, the file goes to the app data
//! folder instead (keyed by a stable hash of the PDF path).

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct SidecarRead {
    content: String,
    /// "pdf" (next to the PDF) or "app-data" (fallback folder)
    location: &'static str,
}

fn beside_pdf(pdf: &str) -> PathBuf {
    PathBuf::from(format!("{pdf}.annotations.json"))
}

fn fallback(app: &AppHandle, pdf: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("annotations").join(format!("{:016x}.json", fnv1a(pdf))))
}

/// FNV-1a: stable across Rust versions, unlike `DefaultHasher`.
fn fnv1a(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Writes to a temp file, flushes it to disk, then renames over the target,
/// so a crash mid-write never leaves a truncated file.
fn write_atomic(path: &Path, content: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[tauri::command]
pub async fn read_sidecar(app: AppHandle, pdf_path: String) -> Result<Option<SidecarRead>, String> {
    let beside = beside_pdf(&pdf_path);
    if beside.exists() {
        let content = fs::read_to_string(&beside).map_err(|e| e.to_string())?;
        return Ok(Some(SidecarRead { content, location: "pdf" }));
    }
    let alt = fallback(&app, &pdf_path)?;
    if alt.exists() {
        let content = fs::read_to_string(&alt).map_err(|e| e.to_string())?;
        return Ok(Some(SidecarRead { content, location: "app-data" }));
    }
    Ok(None)
}

/// Returns where the file was written: "pdf" or "app-data".
#[tauri::command]
pub async fn write_sidecar(app: AppHandle, pdf_path: String, content: String) -> Result<&'static str, String> {
    let alt = fallback(&app, &pdf_path)?;
    match write_atomic(&beside_pdf(&pdf_path), &content) {
        Ok(()) => {
            // A newer copy now sits next to the PDF; drop the stale fallback.
            let _ = fs::remove_file(&alt);
            Ok("pdf")
        }
        Err(_) => write_atomic(&alt, &content)
            .map(|()| "app-data")
            .map_err(|e| format!("Não foi possível salvar as anotações: {e}")),
    }
}

/// Moves an existing sidecar aside (e.g. it belongs to another version of
/// the PDF) so it is never overwritten. Returns the backup path.
#[tauri::command]
pub async fn backup_sidecar(app: AppHandle, pdf_path: String) -> Result<Option<String>, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    for path in [beside_pdf(&pdf_path), fallback(&app, &pdf_path)?] {
        if path.exists() {
            let backup = path.with_extension(format!("backup-{stamp}.json"));
            fs::rename(&path, &backup).map_err(|e| e.to_string())?;
            return Ok(Some(backup.to_string_lossy().into_owned()));
        }
    }
    Ok(None)
}
