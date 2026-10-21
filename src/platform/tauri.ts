import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ask, message, open, save } from "@tauri-apps/plugin-dialog";

/** False when the UI runs in a plain browser (vite dev without Tauri). */
export const isTauri = "__TAURI_INTERNALS__" in window;

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const buffer = await invoke<ArrayBuffer>("read_file_bytes", { path });
  return new Uint8Array(buffer);
}

/** PDF passed on the command line at launch, if any. */
export async function initialFile(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("initial_file");
}

/** Reads a PDF from disk (or, in the browser dev mode, from the dev server). */
export async function readPdfBytes(path: string): Promise<Uint8Array> {
  if (isTauri) return readFileBytes(path);
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function pickPdf(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof result === "string" ? result : null;
}

export function setWindowTitle(title: string): void {
  if (!isTauri) {
    document.title = title;
    return;
  }
  getCurrentWindow().setTitle(title).catch(() => {});
}

export function showError(text: string): void {
  if (!isTauri) {
    console.error(text);
    return;
  }
  message(text, { title: "PDF Canvas", kind: "error" }).catch(() => {});
}

/** Listens for files dragged onto the window. Returns an unsubscribe function. */
export function onPdfDrop(handlers: { hover(active: boolean): void; drop(path: string): void }): () => void {
  if (!isTauri) return () => {};
  const pending = getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "over") handlers.hover(true);
    else if (payload.type === "leave") handlers.hover(false);
    else if (payload.type === "drop") {
      handlers.hover(false);
      const pdf = payload.paths.find((p) => p.toLowerCase().endsWith(".pdf"));
      if (pdf) handlers.drop(pdf);
    }
  });
  return () => {
    pending.then((unlisten) => unlisten()).catch(() => {});
  };
}

export function confirm(text: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  if (!isTauri) return Promise.resolve(window.confirm(text));
  return ask(text, { title: "PDF Canvas", kind: "warning", okLabel, cancelLabel });
}

// ---- annotation sidecar ---------------------------------------------------

export type SidecarLocation = "pdf" | "app-data";

const devKey = (pdfPath: string) => `pdf-canvas.dev-sidecar:${pdfPath}`;

export async function readSidecar(pdfPath: string): Promise<{ content: string; location: SidecarLocation } | null> {
  if (!isTauri) {
    const content = localStorage.getItem(devKey(pdfPath));
    return content ? { content, location: "app-data" } : null;
  }
  return invoke("read_sidecar", { pdfPath });
}

export async function writeSidecar(pdfPath: string, content: string): Promise<SidecarLocation> {
  if (!isTauri) {
    localStorage.setItem(devKey(pdfPath), content);
    return "app-data";
  }
  return invoke("write_sidecar", { pdfPath, content });
}

export async function backupSidecar(pdfPath: string): Promise<string | null> {
  if (!isTauri) {
    localStorage.removeItem(devKey(pdfPath));
    return null;
  }
  return invoke("backup_sidecar", { pdfPath });
}

// ---- app menu and quitting -------------------------------------------------

export type MenuAction =
  | "open"
  | "export"
  | "close"
  | "undo"
  | "redo"
  | "select-all"
  | "thumbnails"
  | "zoom-in"
  | "zoom-out"
  | "fit-width";

export function onMenu(handler: (action: MenuAction) => void): () => void {
  if (!isTauri) return () => {};
  const pending = listen<MenuAction>("menu", (e) => handler(e.payload));
  return () => {
    pending.then((unlisten) => unlisten()).catch(() => {});
  };
}

/** Runs `save` when the app is about to quit, then lets it quit. */
export function onQuitRequested(save: () => Promise<void>): () => void {
  if (!isTauri) return () => {};
  const pending = listen("quit-requested", async () => {
    try {
      await save();
    } finally {
      await invoke("quit_now");
    }
  });
  return () => {
    pending.then((unlisten) => unlisten()).catch(() => {});
  };
}

/** Asks where to save a PDF. */
export async function pickSavePath(defaultPath: string): Promise<string | null> {
  if (!isTauri) return defaultPath;
  return save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] });
}

/** Writes bytes to a file (raw IPC body, no JSON encoding). In the browser
 *  dev mode the file is downloaded instead. */
export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  if (!isTauri) {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "export.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await invoke("write_file_bytes", bytes, { headers: { path: encodeURIComponent(path) } });
}

/** PDFs opened from Finder ("Abrir com", double-click) while running. */
export function onOpenFile(handler: (path: string) => void): () => void {
  if (!isTauri) return () => {};
  const pending = listen<string>("open-file", (e) => {
    // Consume it so a later startup check doesn't open it twice.
    invoke("initial_file").catch(() => {});
    handler(e.payload);
  });
  return () => {
    pending.then((unlisten) => unlisten()).catch(() => {});
  };
}
