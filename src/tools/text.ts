import { NOTE_DEFAULT_WIDTH, NOTE_FONT_SIZES, NOTE_PADDING, noteHeight, withBBox } from "../canvas/geometry";
import { newId } from "../model/document";
import type { TextNoteAnnotation } from "../model/types";
import { placeOnPage } from "./place";
import { noGesture, type Tool, type ToolContext, type ToolGesture, type ToolPoint } from "./Tool";

/** Opens the in-place editor; saves, updates or deletes the note when done. */
export function editNote(ctx: ToolContext, note: TextNoteAnnotation, isNew: boolean): void {
  ctx.selection.clear();
  ctx.renderer.setPreview([], [note.id]);
  ctx.editor.open(note, (content) => {
    ctx.renderer.setPreview([]);
    if (!content.trim()) {
      if (!isNew) ctx.store.remove([note]);
      return;
    }
    if (!isNew && content === note.content) return;
    const next = placeOnPage(ctx, withBBox({ ...note, content }));
    if (isNew) ctx.store.add([next]);
    else ctx.store.update([note], [next]);
  });
}

/** Click on empty space: new note. Click on a note: edit it. */
export const textTool: Tool = {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
    // A click while editing just finishes the current note.
    if (ctx.editor.isOpen) {
      ctx.editor.commit();
      return noGesture;
    }
    const hit = ctx.renderer.hitTest(start.x, start.y, 2 / ctx.camera.zoom, true).find((a) => a.type === "text");
    if (hit && hit.type === "text") {
      editNote(ctx, hit, false);
      return noGesture;
    }
    const { color, width } = ctx.prefs("text");
    const fontSize = NOTE_FONT_SIZES[width];
    // Put the first line's text where the user clicked.
    const x = start.x - NOTE_PADDING;
    const y = start.y - NOTE_PADDING - fontSize * 0.65;
    const note: TextNoteAnnotation = {
      id: newId(),
      createdAt: Date.now(),
      type: "text",
      page: null,
      color,
      content: "",
      fontSize,
      bbox: { x, y, w: NOTE_DEFAULT_WIDTH, h: noteHeight("", NOTE_DEFAULT_WIDTH, fontSize) },
    };
    editNote(ctx, note, true);
    return noGesture;
  },
};
