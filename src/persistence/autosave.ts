import type { AnnotationStore } from "../model/document";
import type { SidecarFile } from "../model/types";
import type { PdfDocument } from "../pdf/loader";
import { writeSidecar, type SidecarLocation } from "../platform/tauri";
import { saveLocalView, serializeSidecar } from "./sidecar";

export type SaveState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saved"; location: SidecarLocation }
  | { kind: "error"; message: string };

const ANNOTATION_DELAY = 1000;
const VIEW_DELAY = 4000;
const RETRY_DELAY = 5000;

/**
 * Saves the sidecar 1 s after the last annotation change. Writes never
 * overlap; changes made during a write trigger another one.
 */
export class Autosave {
  private timer = 0;
  private viewTimer = 0;
  private dirty = false;
  private writing: Promise<void> | null = null;
  private unsubscribe: () => void;
  private disposed = false;

  constructor(
    private doc: PdfDocument,
    private store: AnnotationStore,
    private getView: () => SidecarFile["view"],
    /** True when a sidecar already exists (keep it up to date). */
    private exists: boolean,
    private onState: (state: SaveState) => void,
  ) {
    this.unsubscribe = store.subscribe(() => this.schedule(ANNOTATION_DELAY));
  }

  /** Reading position changed. */
  viewChanged(): void {
    window.clearTimeout(this.viewTimer);
    this.viewTimer = window.setTimeout(() => saveLocalView(this.doc.path, this.getView()), 400);
    if (this.exists && !this.dirty) this.schedule(VIEW_DELAY, false);
  }

  /** Writes pending changes now (before quitting or switching files). */
  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.viewTimer);
    saveLocalView(this.doc.path, this.getView());
    if (this.writing) await this.writing;
    if (this.dirty) await this.write();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    window.clearTimeout(this.timer);
    window.clearTimeout(this.viewTimer);
  }

  private schedule(delay: number, notify = true): void {
    this.dirty = true;
    if (notify) this.onState({ kind: "pending" });
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.write().catch(() => {});
    }, delay);
  }

  private async write(): Promise<void> {
    if (this.writing) {
      await this.writing;
      if (!this.dirty) return;
    }
    this.dirty = false;
    // Opening a PDF without annotating it never creates a file.
    if (!this.exists && this.store.size === 0) {
      if (!this.disposed) this.onState({ kind: "idle" });
      return;
    }
    const content = serializeSidecar(this.doc, this.store.all(), this.getView());
    this.writing = writeSidecar(this.doc.path, content)
      .then((location) => {
        this.exists = true;
        if (!this.disposed && !this.dirty) this.onState({ kind: "saved", location });
      })
      .catch((err: unknown) => {
        this.dirty = true;
        if (this.disposed) return;
        this.onState({ kind: "error", message: String(err) });
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.write().catch(() => {}), RETRY_DELAY);
      })
      .finally(() => {
        this.writing = null;
      });
    await this.writing;
  }
}
