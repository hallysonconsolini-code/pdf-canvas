import { FONT_SIZES, lineHeight, round, withBBox } from "../canvas/geometry";
import { newId } from "../model/document";
import type { TextNoteAnnotation } from "../model/types";
import { placeOnPage } from "./place";
import { noGesture, type Tool, type ToolContext, type ToolGesture, type ToolPoint } from "./Tool";

/** Opens the in-place editor; saves, updates or deletes the text when done. */
export function editNote(ctx: ToolContext, note: TextNoteAnnotation, isNew: boolean): void {
  ctx.selection.clear();
  ctx.renderer.setPreview([], [note.id]);
  ctx.editor.open(note, (content) => {
    ctx.renderer.setPreview([]);
    if (!content.trim()) {
      if (!isNew) ctx.store.remove([note]);
      return;
    }
    if (!isNew && content === note.content) {
      ctx.selection.set([note.id]);
      return;
    }
    const next = placeOnPage(ctx, withBBox({ ...note, content }));
    if (isNew) ctx.store.add([next]);
    else ctx.store.update([note], [next]);
    ctx.selection.set([next.id]);
    if (isNew) ctx.created(next);
  });
}

/** Creates text at a point, with the first line centred on it. */
export function newTextAt(ctx: ToolContext, x: number, y: number): TextNoteAnnotation {
  const style = ctx.style();
  const fontSize = FONT_SIZES[style.fontSize];
  const lh = fontSize * lineHeight(style.fontFamily);
  return {
    id: newId(),
    createdAt: Date.now(),
    type: "text",
    page: null,
    color: style.color,
    content: "",
    fontSize,
    fontFamily: style.fontFamily,
    textAlign: style.textAlign,
    ...(style.opacity !== 100 ? { opacity: style.opacity } : {}),
    bbox: { x: round(x), y: round(y - lh / 2), w: 0, h: lh },
  };
}

/** Click on empty space: new text. Click on text: edit it. */
export const textTool: Tool = {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
    // A click while editing just finishes the current text.
    if (ctx.editor.isOpen) {
      ctx.editor.commit();
      return noGesture;
    }
    const hit = ctx.renderer.hitTest(start.x, start.y, 2 / ctx.camera.zoom, true).find((a) => a.type === "text");
    if (hit && hit.type === "text") editNote(ctx, hit, false);
    else editNote(ctx, newTextAt(ctx, start.x, start.y), true);
    return noGesture;
  },
};
