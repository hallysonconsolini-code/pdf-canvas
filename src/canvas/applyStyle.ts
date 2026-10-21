import type { Annotation, ItemStyle } from "../model/types";
import { FONT_SIZES, isShape, withBBox } from "./geometry";

/**
 * Returns a copy of `a` with the parts of `patch` that apply to its type, or
 * `a` itself when nothing changes.
 */
export function applyStyle(a: Annotation, patch: Partial<ItemStyle>): Annotation {
  const next: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined && (a as unknown as Record<string, unknown>)[key] !== value) next[key] = value;
  };

  if (a.type !== "highlighter" && a.type !== "text-highlight") {
    set("opacity", patch.opacity);
  }
  if (a.type === "pen" || a.type === "text" || isShape(a)) set("color", patch.color);
  if (a.type === "pen" || isShape(a)) set("width", patch.width);
  if (isShape(a)) {
    set("strokeStyle", patch.strokeStyle);
    set("roughness", patch.roughness);
    if (a.type === "rect" || a.type === "ellipse" || a.type === "diamond") {
      if ("fill" in patch) set("fill", patch.fill);
      set("fillStyle", patch.fillStyle);
    }
    if (a.type === "rect") set("edges", patch.edges);
  }
  if (a.type === "text") {
    set("fontFamily", patch.fontFamily);
    set("textAlign", patch.textAlign);
    if (patch.fontSize) set("fontSize", FONT_SIZES[patch.fontSize]);
  }

  if (!Object.keys(next).length) return a;
  return withBBox({ ...a, ...next } as Annotation);
}
