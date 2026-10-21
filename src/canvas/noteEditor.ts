import type { TextNoteAnnotation } from "../model/types";
import type { Camera } from "./camera";
import { NOTE_FONT, NOTE_LINE_HEIGHT, NOTE_PADDING } from "./geometry";
import { PEN_COLORS } from "./strokes";

/**
 * In-place editor for a text note: a textarea laid over the canvas with the
 * same font, size and width as the drawn note, following pan and zoom.
 */
export class NoteEditor {
  private el: HTMLTextAreaElement | null = null;
  private note: TextNoteAnnotation | null = null;
  private onDone: ((content: string) => void) | null = null;

  constructor(
    private host: HTMLElement,
    private camera: Camera,
  ) {}

  get editingId(): string | null {
    return this.note?.id ?? null;
  }

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(note: TextNoteAnnotation, onDone: (content: string) => void): void {
    this.commit();
    const el = document.createElement("textarea");
    el.className = "note-editor";
    el.value = note.content;
    el.spellcheck = true;
    el.setAttribute("aria-label", "Nota de texto");
    el.addEventListener("input", () => this.autosize());
    el.addEventListener("blur", () => this.commit());
    el.addEventListener("keydown", (e) => {
      // Esc or ⌘↩ finishes editing; keep other keys away from shortcuts.
      if (e.key === "Escape" || (e.key === "Enter" && e.metaKey)) {
        e.preventDefault();
        el.blur();
      }
      e.stopPropagation();
    });
    this.el = el;
    this.note = note;
    this.onDone = onDone;
    this.host.appendChild(el);
    this.position();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  /** Follows the camera; call every frame while open. */
  position(): void {
    const { el, note } = this;
    if (!el || !note) return;
    const z = this.camera.zoom;
    el.style.left = `${(note.bbox.x - this.camera.x) * z}px`;
    el.style.top = `${(note.bbox.y - this.camera.y) * z}px`;
    el.style.width = `${note.bbox.w * z}px`;
    el.style.fontSize = `${note.fontSize * z}px`;
    el.style.lineHeight = String(NOTE_LINE_HEIGHT);
    el.style.padding = `${NOTE_PADDING * z}px`;
    el.style.fontFamily = NOTE_FONT;
    el.style.color = PEN_COLORS[note.color];
    this.autosize();
  }

  /** Ends editing and reports the text. */
  commit(): void {
    const { el, onDone } = this;
    if (!el) return;
    this.el = null;
    this.note = null;
    this.onDone = null;
    const content = el.value.replace(/\s+$/, "");
    el.remove();
    onDone?.(content);
  }

  private autosize(): void {
    const el = this.el;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
}
