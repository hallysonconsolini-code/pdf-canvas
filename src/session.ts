import { AnnotationStore } from "./model/document";
import type { SidecarFile } from "./model/types";
import { Autosave, type SaveState } from "./persistence/autosave";
import { loadAnnotations } from "./persistence/sidecar";
import type { PdfDocument } from "./pdf/loader";

/** An open PDF with its annotations and autosave. */
export interface Session {
  doc: PdfDocument;
  store: AnnotationStore;
  autosave: Autosave;
  initialView: SidecarFile["view"] | null;
  /** Set by the document view; returns the current reading position. */
  readView: () => SidecarFile["view"];
}

export async function openSession(doc: PdfDocument, onSave: (state: SaveState) => void): Promise<Session> {
  // Text is measured with the hand-drawn font: load it before anything.
  await Promise.all([document.fonts.load('16px "Excalifont"'), document.fonts.load('16px "Excalifont"', "ãçé")]).catch(() => {});
  const loaded = await loadAnnotations(doc);
  const store = new AnnotationStore(loaded.annotations);
  const session: Session = {
    doc,
    store,
    initialView: loaded.view,
    readView: () => loaded.view ?? { camera: { x: 0, y: 0, zoom: 1 }, lastPage: 0 },
    autosave: null as unknown as Autosave,
  };
  session.autosave = new Autosave(doc, store, () => session.readView(), loaded.exists, onSave);
  return session;
}

/** Saves pending work and releases the PDF. */
export async function closeSession(session: Session): Promise<void> {
  try {
    await session.autosave.flush();
  } finally {
    session.autosave.dispose();
    await session.doc.destroy();
  }
}
