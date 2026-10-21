import type {
  Annotation,
  ColorId,
  Rect,
  ShapeAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
  Vec2,
  WidthId,
} from "../model/types";
import {
  distanceToStroke,
  HIGHLIGHT_COLORS,
  outlinePath,
  PEN_COLORS,
  strokeBBox,
  strokeColor,
  strokeOutline,
  strokeSize,
  WIDTHS,
} from "./strokes";

// ---- text notes -------------------------------------------------------------

export const NOTE_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';
export const NOTE_FONT_SIZES: Record<WidthId, number> = { thin: 11, medium: 14, thick: 20 };
export const NOTE_PADDING = 4;
export const NOTE_LINE_HEIGHT = 1.3;
export const NOTE_DEFAULT_WIDTH = 220;
export const NOTE_MIN_WIDTH = 40;

let measureCtx: CanvasRenderingContext2D | null = null;

/** Word-wraps note text to its width. Shared by canvas drawing, height
 *  calculation and (later) PDF export so they all agree. */
export function wrapNoteText(content: string, width: number, fontSize: number): string[] {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  const ctx = measureCtx;
  ctx.font = `${fontSize}px ${NOTE_FONT}`;
  const max = Math.max(1, width - NOTE_PADDING * 2);
  const lines: string[] = [];
  for (const paragraph of content.split("\n")) {
    const words = paragraph.split(/(\s+)/);
    let line = "";
    for (const word of words) {
      const next = line + word;
      if (line && ctx.measureText(next.trimEnd()).width > max) {
        lines.push(line.trimEnd());
        line = word.trimStart();
        // A single word longer than the box: break it by characters.
        while (ctx.measureText(line).width > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > max) cut--;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        line = next;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function noteHeight(content: string, width: number, fontSize: number): number {
  const lines = wrapNoteText(content, width, fontSize).length;
  return lines * fontSize * NOTE_LINE_HEIGHT + NOTE_PADDING * 2;
}

// ---- shapes -----------------------------------------------------------------

export function shapeWidth(a: Pick<ShapeAnnotation, "width">): number {
  return WIDTHS.pen[a.width] * 1.1;
}

function arrowHead(a: Pick<ShapeAnnotation, "width">): number {
  return Math.max(8, shapeWidth(a) * 4);
}

export function shapePath(a: Pick<ShapeAnnotation, "type" | "from" | "to" | "width">): { stroke: Path2D; fill?: Path2D } {
  const { from, to } = a;
  const stroke = new Path2D();
  if (a.type === "rect") {
    stroke.rect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return { stroke };
  }
  if (a.type === "ellipse") {
    const rx = Math.abs(to.x - from.x) / 2;
    const ry = Math.abs(to.y - from.y) / 2;
    stroke.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
    return { stroke };
  }
  // Arrow: shaft stops at the head's base so the tip stays sharp.
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const head = Math.min(arrowHead(a), len * 0.6);
  const ux = len ? (to.x - from.x) / len : 1;
  const uy = len ? (to.y - from.y) / len : 0;
  const bx = to.x - ux * head;
  const by = to.y - uy * head;
  stroke.moveTo(from.x, from.y);
  stroke.lineTo(bx + ux * head * 0.2, by + uy * head * 0.2);
  const fill = new Path2D();
  const half = head * 0.45;
  fill.moveTo(to.x, to.y);
  fill.lineTo(bx - uy * half, by + ux * half);
  fill.lineTo(bx + uy * half, by - ux * half);
  fill.closePath();
  return { stroke, fill };
}

// ---- drawing ----------------------------------------------------------------

export function isHighlightLayer(a: Pick<Annotation, "type">): boolean {
  return a.type === "highlighter" || a.type === "text-highlight";
}

export function colorOf(type: Annotation["type"], color: ColorId): string {
  return type === "highlighter" || type === "text-highlight" ? HIGHLIGHT_COLORS[color] : PEN_COLORS[color];
}

/**
 * Draws an annotation in world coordinates. `cache` keeps computed paths for
 * finished annotations; live previews pass none.
 */
export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, cache?: WeakMap<Annotation, Path2D>, live = false): void {
  switch (a.type) {
    case "pen":
    case "highlighter": {
      let path = cache?.get(a);
      if (!path) {
        path = outlinePath(strokeOutline(a, !live));
        cache?.set(a, path);
      }
      ctx.fillStyle = strokeColor(a);
      ctx.fill(path);
      return;
    }
    case "text-highlight": {
      ctx.fillStyle = HIGHLIGHT_COLORS[a.color];
      for (const r of a.rects) ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    case "arrow":
    case "rect":
    case "ellipse": {
      const { stroke, fill } = shapePath(a);
      ctx.strokeStyle = ctx.fillStyle = PEN_COLORS[a.color];
      ctx.lineWidth = shapeWidth(a);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(stroke);
      if (fill) ctx.fill(fill);
      return;
    }
    case "text": {
      // Soft paper behind the text keeps notes readable over page content.
      const { x, y, w, h } = a.bbox;
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.14)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = PEN_COLORS[a.color];
      ctx.font = `${a.fontSize}px ${NOTE_FONT}`;
      ctx.textBaseline = "top";
      const lh = a.fontSize * NOTE_LINE_HEIGHT;
      const top = a.bbox.y + NOTE_PADDING + (lh - a.fontSize) / 2;
      wrapNoteText(a.content, a.bbox.w, a.fontSize).forEach((line, i) => {
        ctx.fillText(line, a.bbox.x + NOTE_PADDING, top + i * lh);
      });
      return;
    }
  }
}

// ---- bounds, hit-testing, transforms ----------------------------------------

export function computeBBox(a: Annotation): Rect {
  switch (a.type) {
    case "pen":
    case "highlighter":
      return strokeBBox(a.points, strokeSize(a));
    case "text-highlight":
      return union(a.rects);
    case "text":
      return { ...a.bbox, h: noteHeight(a.content, a.bbox.w, a.fontSize) };
    default: {
      const pad = (a.type === "arrow" ? arrowHead(a) / 2 : 0) + shapeWidth(a) / 2 + 1;
      const x = Math.min(a.from.x, a.to.x) - pad;
      const y = Math.min(a.from.y, a.to.y) - pad;
      return { x, y, w: Math.abs(a.to.x - a.from.x) + pad * 2, h: Math.abs(a.to.y - a.from.y) + pad * 2 };
    }
  }
}

/**
 * Distance from a world point to an annotation (≤ 0 = touching).
 * With `solid`, the inside of rectangles and ellipses counts as touching
 * (for clicking to select); without it only their outline does (eraser).
 */
export function distanceTo(a: Annotation, x: number, y: number, solid: boolean): number {
  switch (a.type) {
    case "pen":
    case "highlighter":
      return distanceToStroke(a, x, y);
    case "text":
      return rectDistance(a.bbox, x, y);
    case "text-highlight":
      return Math.min(...a.rects.map((r) => rectDistance(r, x, y)));
    case "arrow": {
      const d = segmentDistance(x, y, a.from.x, a.from.y, a.to.x, a.to.y);
      return d - Math.max(shapeWidth(a) / 2, arrowHead(a) * 0.3);
    }
    case "rect": {
      const r = normRect(a.from, a.to);
      const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (solid && inside) return -1;
      const edge = inside
        ? Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y)
        : rectDistance(r, x, y);
      return edge - shapeWidth(a) / 2;
    }
    case "ellipse": {
      const cx = (a.from.x + a.to.x) / 2;
      const cy = (a.from.y + a.to.y) / 2;
      const rx = Math.max(Math.abs(a.to.x - a.from.x) / 2, 0.01);
      const ry = Math.max(Math.abs(a.to.y - a.from.y) / 2, 0.01);
      const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (solid && k <= 1) return -1;
      return Math.abs(k - 1) * Math.min(rx, ry) - shapeWidth(a) / 2;
    }
  }
}

/** Point sample used for lasso selection: is the annotation inside? */
export function samplePoints(a: Annotation): Vec2[] {
  switch (a.type) {
    case "pen":
    case "highlighter": {
      const out: Vec2[] = [];
      const step = Math.max(3, Math.floor(a.points.length / 3 / 24) * 3);
      for (let i = 0; i < a.points.length; i += step) out.push({ x: a.points[i], y: a.points[i + 1] });
      return out;
    }
    case "arrow":
    case "rect":
    case "ellipse":
      return [a.from, a.to, { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 }];
    default:
      return [{ x: a.bbox.x + a.bbox.w / 2, y: a.bbox.y + a.bbox.h / 2 }];
  }
}

export type PointMap = (p: Vec2) => Vec2;

/** Returns a moved/scaled copy (same id). Strokes keep their thickness and
 *  notes keep their font size; only geometry changes. */
export function transformAnnotation(a: Annotation, map: PointMap): Annotation {
  switch (a.type) {
    case "pen":
    case "highlighter": {
      const points = a.points.slice();
      for (let i = 0; i < points.length; i += 3) {
        const p = map({ x: points[i], y: points[i + 1] });
        points[i] = round(p.x);
        points[i + 1] = round(p.y);
      }
      return withBBox({ ...a, points });
    }
    case "arrow":
    case "rect":
    case "ellipse":
      return withBBox({ ...a, from: roundPoint(map(a.from)), to: roundPoint(map(a.to)) });
    case "text-highlight": {
      const rects = a.rects.map((r) => {
        const p = map({ x: r.x, y: r.y });
        const q = map({ x: r.x + r.w, y: r.y + r.h });
        return roundRect(normRect(p, q));
      });
      return withBBox({ ...a, rects } as TextHighlightAnnotation);
    }
    case "text": {
      const p = map({ x: a.bbox.x, y: a.bbox.y });
      const q = map({ x: a.bbox.x + a.bbox.w, y: a.bbox.y + a.bbox.h });
      const r = normRect(p, q);
      const w = Math.max(NOTE_MIN_WIDTH, r.w);
      return withBBox({ ...a, bbox: { x: round(r.x), y: round(r.y), w: round(w), h: a.bbox.h } } as TextNoteAnnotation);
    }
  }
}

export function withBBox<T extends Annotation>(a: T): T {
  a.bbox = roundRect(computeBBox(a));
  return a;
}

export function union(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function normRect(a: Vec2, b: Vec2): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function rectDistance(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy);
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function roundPoint(p: Vec2): Vec2 {
  return { x: round(p.x), y: round(p.y) };
}

function roundRect(r: Rect): Rect {
  return { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) };
}
