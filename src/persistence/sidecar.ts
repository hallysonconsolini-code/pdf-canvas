import type { Annotation, CameraState, SidecarFile } from "../model/types";
import type { PdfDocument } from "../pdf/loader";
import { migrate } from "./migrate";
import { backupSidecar, confirm, readSidecar, showError, type SidecarLocation } from "../platform/tauri";

export interface LoadedAnnotations {
  annotations: Annotation[];
  view: SidecarFile["view"] | null;
  /** A sidecar file exists on disk (keep saving it, even when emptied). */
  exists: boolean;
  location: SidecarLocation | null;
}

export function serializeSidecar(doc: PdfDocument, annotations: Annotation[], view: SidecarFile["view"]): string {
  const file: SidecarFile = {
    schemaVersion: 2,
    pdf: { fileName: doc.fileName, fingerprint: doc.fingerprint, pageCount: doc.pages.length },
    view,
    annotations,
    updatedAt: Date.now(),
  };
  return JSON.stringify(file);
}

/** Validates a sidecar, dropping entries it can't understand. */
export function parseSidecar(content: string): SidecarFile {
  const parsed = JSON.parse(content);
  if (!parsed || !Array.isArray(parsed.annotations)) throw new Error("formato de arquivo desconhecido");
  const raw = migrate(parsed);
  const annotations = raw.annotations.filter(
    (a): a is Annotation => !!a && typeof a.id === "string" && typeof a.type === "string" && !!a.bbox,
  );
  return { ...raw, annotations };
}

/**
 * Loads annotations for a PDF. A sidecar that belongs to another version of
 * the PDF, or that can't be read, is moved aside instead of overwritten.
 */
export async function loadAnnotations(doc: PdfDocument): Promise<LoadedAnnotations> {
  const empty: LoadedAnnotations = { annotations: [], view: null, exists: false, location: null };
  const read = await readSidecar(doc.path);
  if (!read) return { ...empty, view: loadLocalView(doc.path) };

  let file: SidecarFile;
  try {
    file = parseSidecar(read.content);
  } catch (err) {
    const backup = await backupSidecar(doc.path);
    showError(
      `O arquivo de anotações deste PDF está danificado (${(err as Error).message}).` +
        (backup ? `\n\nUma cópia foi guardada em:\n${backup}` : ""),
    );
    return empty;
  }

  if (file.pdf?.fingerprint && doc.fingerprint && file.pdf.fingerprint !== doc.fingerprint) {
    const keep = await confirm(
      "As anotações salvas foram feitas em outra versão deste PDF e podem ficar fora do lugar.\n\nCarregar mesmo assim?",
      "Carregar",
      "Começar do zero",
    );
    if (!keep) {
      const backup = await backupSidecar(doc.path);
      if (backup) showError(`As anotações antigas foram guardadas em:\n${backup}`);
      return empty;
    }
  }
  return { annotations: file.annotations, view: file.view ?? null, exists: true, location: read.location };
}

// Reading position for PDFs without annotations lives in local storage, so
// merely opening a PDF never creates a file next to it.

const viewKey = (path: string) => `pdf-canvas.view:${path}`;

export function saveLocalView(path: string, view: SidecarFile["view"]): void {
  try {
    localStorage.setItem(viewKey(path), JSON.stringify(view));
  } catch {
    // Storage full or unavailable: position is a convenience, ignore.
  }
}

function loadLocalView(path: string): SidecarFile["view"] | null {
  try {
    const raw = localStorage.getItem(viewKey(path));
    const view = raw ? (JSON.parse(raw) as SidecarFile["view"]) : null;
    return view && isCamera(view.camera) ? view : null;
  } catch {
    return null;
  }
}

function isCamera(c: CameraState | undefined): c is CameraState {
  return !!c && Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.zoom) && c.zoom > 0;
}
