import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ask, message, open } from "@tauri-apps/plugin-dialog";

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

export type MenuAction = "open" | "undo" | "redo" | "select-all";

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
