import { round, union } from "../canvas/geometry";
import { newId } from "../model/document";
import type { Rect, TextHighlightAnnotation } from "../model/types";
import { intersect, pageForRect } from "../pdf/layout";
import type { ToolContext } from "./Tool";

/**
 * Highlight on the PDF's text layer: the user selects text natively, and on
 * release the selected lines become highlight rectangles that fit the text
 * exactly. One annotation per page.
 */
export function attachTextHighlight(root: HTMLElement, ctx: ToolContext, active: () => boolean): () => void {
  const onUp = () => {
    if (!active()) return;
    // Let the browser finish updating the selection first.
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const created = highlightsFromSelection(root, ctx, selection);
      selection.removeAllRanges();
      if (created.length) ctx.store.add(created);
    });
  };
  window.addEventListener("pointerup", onUp);
  return () => window.removeEventListener("pointerup", onUp);
}

function highlightsFromSelection(root: HTMLElement, ctx: ToolContext, selection: globalThis.Selection): TextHighlightAnnotation[] {
  const origin = root.getBoundingClientRect();
  const byPage = new Map<number, Rect[]>();
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (!root.contains(range.commonAncestorContainer)) continue;
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const a = ctx.camera.screenToWorld(r.left - origin.left, r.top - origin.top);
      const b = ctx.camera.screenToWorld(r.right - origin.left, r.bottom - origin.top);
      const world = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      const page = pageForRect(ctx.layout.pages, world);
      if (page === null) continue;
      const clipped = intersect(world, ctx.layout.pages[page]);
      if (!clipped) continue;
      const list = byPage.get(page) ?? [];
      list.push(clipped);
      byPage.set(page, list);
    }
  }

  const { color } = ctx.highlighter();
  const text = selection.toString().trim();
  return [...byPage.entries()].map(([page, rects]) => {
    const lines = mergeLines(rects).map((r) => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
    return {
      id: newId(),
      createdAt: Date.now(),
      type: "text-highlight",
      color,
      page,
      rects: lines,
      text,
      bbox: union(lines),
    };
  });
}

/** Joins the per-span rectangles of each text line into one rectangle. */
function mergeLines(rects: Rect[]): Rect[] {
  const sorted = [...rects].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: Rect[] = [];
  for (const r of sorted) {
    const cy = r.y + r.h / 2;
    const line = lines.find((l) => Math.abs(l.y + l.h / 2 - cy) < Math.min(l.h, r.h) * 0.5);
    if (line) Object.assign(line, union([line, r]));
    else lines.push({ ...r });
  }
  return lines;
}
