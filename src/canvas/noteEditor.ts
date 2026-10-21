import type { TextNoteAnnotation } from "../model/types";
import type { Camera } from "./camera";
import { fontStack, lineHeight, measureText } from "./geometry";
import { PEN_COLORS } from "./strokes";

/**
 * In-place text editor (Excalidraw style): a borderless textarea laid over
 * the canvas with the same font as the drawn text. It grows with what is
 * typed, never wraps, and follows pan and zoom.
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
    el.wrap = "off";
    el.spellcheck = true;
    el.setAttribute("aria-label", "Texto");
    el.addEventListener("input", () => this.position());
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

  /** Follows the camera and the typed text; call every frame while open. */
  position(): void {
    const { el, note } = this;
    if (!el || !note) return;
    const z = this.camera.zoom;
    const size = measureText({ content: el.value || " ", fontSize: note.fontSize, fontFamily: note.fontFamily });
    const s = el.style;
    s.left = `${(note.bbox.x - this.camera.x) * z}px`;
    s.top = `${(note.bbox.y - this.camera.y) * z}px`;
    // Room for the caret at the end of the longest line.
    s.width = `${(size.w + note.fontSize) * z}px`;
    s.height = `${size.h * z}px`;
    s.fontSize = `${note.fontSize * z}px`;
    s.lineHeight = String(lineHeight(note.fontFamily));
    s.fontFamily = fontStack(note.fontFamily);
    s.color = PEN_COLORS[note.color];
    s.opacity = String((note.opacity ?? 100) / 100);
    s.textAlign = note.textAlign;
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
}
