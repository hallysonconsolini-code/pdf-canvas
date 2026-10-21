import rough from "roughjs";
import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import type {
  Annotation,
  ColorId,
  FontFamily,
  FontSizeId,
  Rect,
  ShapeAnnotation,
  TextHighlightAnnotation,
  TextNoteAnnotation,
  Vec2,
} from "../model/types";
import {
  BACKGROUND_COLORS,
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

// ---- text -------------------------------------------------------------------

export const FONT_SIZES: Record<FontSizeId, number> = { s: 16, m: 20, l: 28, xl: 36 };

const FONT_STACKS: Record<FontFamily, string> = {
  hand: '"Excalifont", "Segoe Print", "Bradley Hand", cursive',
  normal: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
  code: 'ui-monospace, "SF Mono", Menlo, monospace',
};

const LINE_HEIGHTS: Record<FontFamily, number> = { hand: 1.25, normal: 1.3, code: 1.2 };

export function fontCss(fontSize: number, family: FontFamily): string {
  return `${fontSize}px ${FONT_STACKS[family]}`;
}

export function fontStack(family: FontFamily): string {
  return FONT_STACKS[family];
}

export function lineHeight(family: FontFamily): number {
  return LINE_HEIGHTS[family];
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Lines and size of a text item. Text never wraps (Excalidraw style):
 *  it grows with its content and Enter starts a new line. */
export function measureText(a: Pick<TextNoteAnnotation, "content" | "fontSize" | "fontFamily">): {
  lines: { text: string; width: number }[];
  w: number;
  h: number;
} {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = fontCss(a.fontSize, a.fontFamily);
  const lines = a.content.split("\n").map((text) => ({ text, width: measureCtx!.measureText(text).width }));
  const w = Math.max(a.fontSize * 0.5, ...lines.map((l) => l.width));
  const h = lines.length * a.fontSize * lineHeight(a.fontFamily);
  return { lines, w, h };
}

// ---- hand-drawn shapes (rough.js) -------------------------------------------

let generator: RoughGenerator | null = null;
const drawables = new WeakMap<Annotation, Drawable[]>();

export function strokeWidthOf(a: Pick<ShapeAnnotation, "width">): number {
  return WIDTHS.pen[a.width];
}

/** Smaller shapes wobble less, like Excalidraw. */
function adjustedRoughness(a: ShapeAnnotation): number {
  const w = Math.abs(a.to.x - a.from.x);
  const h = Math.abs(a.to.y - a.from.y);
  const max = Math.max(w, h);
  const min = Math.min(w, h);
  if ((min >= 20 && max >= 50) || min >= 15 || a.type === "line" || a.type === "arrow") return a.roughness;
  return Math.min(a.roughness / (max < 10 ? 3 : 2), 2.5);
}

/** rough.js options matching Excalidraw's. */
function roughOptions(a: ShapeAnnotation): Options {
  const sw = strokeWidthOf(a);
  const dashed = a.strokeStyle === "dashed";
  const dotted = a.strokeStyle === "dotted";
  const options: Options = {
    seed: a.seed,
    roughness: adjustedRoughness(a),
    stroke: PEN_COLORS[a.color],
    strokeWidth: dashed || dotted ? sw + 0.5 : sw,
    fillWeight: sw / 2,
    hachureGap: sw * 4,
    disableMultiStroke: dashed || dotted,
    preserveVertices: a.roughness < 2,
  };
  if (dashed) options.strokeLineDash = [8, 8 + sw];
  if (dotted) options.strokeLineDash = [1.5, 6 + sw];
  const filled = a.fill && (a.type === "rect" || a.type === "ellipse" || a.type === "diamond");
  if (filled) {
    options.fill = BACKGROUND_COLORS[a.fill!];
    options.fillStyle = a.fillStyle;
  }
  return options;
}

export function arrowHeadLength(a: Pick<ShapeAnnotation, "from" | "to" | "width">): number {
  const len = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
  return Math.min(14 + strokeWidthOf(a) * 2, len * 0.4);
}

function shapeDrawables(a: ShapeAnnotation): Drawable[] {
  generator ??= rough.generator();
  const g = generator;
  const o = roughOptions(a);
  const { from, to } = a;
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const w = Math.abs(to.x - from.x);
  const h = Math.abs(to.y - from.y);

  switch (a.type) {
    case "rect": {
      if (a.edges === "sharp") return [g.rectangle(x, y, w, h, o)];
      // Excalidraw's adaptive corner radius.
      const r = Math.min(w, h) <= 128 ? Math.min(w, h) * 0.25 : 32;
      const d =
        `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y}, ${x + w} ${y + r} ` +
        `L ${x + w} ${y + h - r} Q ${x + w} ${y + h}, ${x + w - r} ${y + h} ` +
        `L ${x + r} ${y + h} Q ${x} ${y + h}, ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y}, ${x + r} ${y}`;
      return [g.path(d, o)];
    }
    case "ellipse":
      return [g.ellipse(x + w / 2, y + h / 2, w, h, { ...o, curveFitting: 1 })];
    case "diamond":
      return [
        g.polygon(
          [
            [x + w / 2, y],
            [x + w, y + h / 2],
            [x + w / 2, y + h],
            [x, y + h / 2],
          ],
          o,
        ),
      ];
    case "line":
      return [g.line(from.x, from.y, to.x, to.y, o)];
    case "arrow": {
      const head = arrowHeadLength(a);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const spread = Math.PI / 7;
      const p1 = { x: to.x - head * Math.cos(angle - spread), y: to.y - head * Math.sin(angle - spread) };
      const p2 = { x: to.x - head * Math.cos(angle + spread), y: to.y - head * Math.sin(angle + spread) };
      const solidHead = { ...o, strokeLineDash: undefined };
      return [
        g.line(from.x, from.y, to.x, to.y, o),
        g.line(to.x, to.y, p1.x, p1.y, solidHead),
        g.line(to.x, to.y, p2.x, p2.y, solidHead),
      ];
    }
  }
}

// ---- drawing ----------------------------------------------------------------

export function isHighlightLayer(a: Pick<Annotation, "type">): boolean {
  return a.type === "highlighter" || a.type === "text-highlight";
}

export function isShape(a: Pick<Annotation, "type">): a is ShapeAnnotation {
  return a.type === "arrow" || a.type === "line" || a.type === "rect" || a.type === "ellipse" || a.type === "diamond";
}

export function colorOf(type: Annotation["type"], color: ColorId): string {
  return type === "highlighter" || type === "text-highlight" ? HIGHLIGHT_COLORS[color] : PEN_COLORS[color];
}

const roughCanvases = new WeakMap<HTMLCanvasElement, ReturnType<typeof rough.canvas>>();

/**
 * Draws an annotation in world coordinates. Paths and hand-drawn shapes are
 * cached per annotation; live previews (`live`) are not cached.
 */
export function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation, cache?: WeakMap<Annotation, Path2D>, live = false): void {
  const alpha = (a.opacity ?? 100) / 100;
  ctx.globalAlpha = alpha;
  try {
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
      case "text": {
        const { lines, w } = measureText(a);
        const lh = a.fontSize * lineHeight(a.fontFamily);
        ctx.font = fontCss(a.fontSize, a.fontFamily);
        ctx.fillStyle = PEN_COLORS[a.color];
        ctx.textBaseline = "middle";
        lines.forEach((line, i) => {
          const dx = a.textAlign === "center" ? (w - line.width) / 2 : a.textAlign === "right" ? w - line.width : 0;
          ctx.fillText(line.text, a.bbox.x + dx, a.bbox.y + lh * i + lh / 2);
        });
        return;
      }
      default: {
        let list = live ? undefined : drawables.get(a);
        if (!list) {
          list = shapeDrawables(a);
          if (!live) drawables.set(a, list);
        }
        let rc = roughCanvases.get(ctx.canvas);
        if (!rc) {
          rc = rough.canvas(ctx.canvas);
          roughCanvases.set(ctx.canvas, rc);
        }
        for (const d of list) rc.draw(d);
      }
    }
  } finally {
    ctx.globalAlpha = 1;
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
    case "text": {
      const { w, h } = measureText(a);
      return { x: a.bbox.x, y: a.bbox.y, w, h };
    }
    default: {
      // Room for the wobble and the stroke.
      const pad = strokeWidthOf(a) * 2 + a.roughness * 2 + 1;
      const x = Math.min(a.from.x, a.to.x) - pad;
      const y = Math.min(a.from.y, a.to.y) - pad;
      return { x, y, w: Math.abs(a.to.x - a.from.x) + pad * 2, h: Math.abs(a.to.y - a.from.y) + pad * 2 };
    }
  }
}

/**
 * Distance from a world point to an annotation (≤ 0 = touching).
 * With `solid`, the inside of filled shapes counts as touching (clicking to
 * select); transparent shapes are only picked by their outline, as in
 * Excalidraw. The eraser passes `solid = false`.
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
    case "arrow":
    case "line":
      return segmentDistance(x, y, a.from.x, a.from.y, a.to.x, a.to.y) - strokeWidthOf(a) / 2;
    case "rect": {
      const r = normRect(a.from, a.to);
      const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      if (solid && inside && a.fill) return -1;
      const edge = inside ? Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y) : rectDistance(r, x, y);
      return edge - strokeWidthOf(a) / 2;
    }
    case "diamond": {
      const r = normRect(a.from, a.to);
      const pts = [
        { x: r.x + r.w / 2, y: r.y },
        { x: r.x + r.w, y: r.y + r.h / 2 },
        { x: r.x + r.w / 2, y: r.y + r.h },
        { x: r.x, y: r.y + r.h / 2 },
      ];
      if (solid && a.fill && pointInPolygon({ x, y }, pts)) return -1;
      let best = Infinity;
      for (let i = 0; i < 4; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % 4];
        best = Math.min(best, segmentDistance(x, y, p.x, p.y, q.x, q.y));
      }
      return best - strokeWidthOf(a) / 2;
    }
    case "ellipse": {
      const cx = (a.from.x + a.to.x) / 2;
      const cy = (a.from.y + a.to.y) / 2;
      const rx = Math.max(Math.abs(a.to.x - a.from.x) / 2, 0.01);
      const ry = Math.max(Math.abs(a.to.y - a.from.y) / 2, 0.01);
      const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (solid && a.fill && k <= 1) return -1;
      return Math.abs(k - 1) * Math.min(rx, ry) - strokeWidthOf(a) / 2;
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
    case "text-highlight":
    case "text":
      return [{ x: a.bbox.x + a.bbox.w / 2, y: a.bbox.y + a.bbox.h / 2 }];
    default:
      return [a.from, a.to, { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 }];
  }
}

export type PointMap = (p: Vec2) => Vec2;

/**
 * Returns a moved/scaled copy (same id). Strokes keep their thickness; text
 * scales its font size with the height, like Excalidraw.
 */
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
    case "text-highlight": {
      const rects = a.rects.map((r) => roundRect(normRect(map({ x: r.x, y: r.y }), map({ x: r.x + r.w, y: r.y + r.h }))));
      return withBBox({ ...a, rects } as TextHighlightAnnotation);
    }
    case "text": {
      const r = normRect(map({ x: a.bbox.x, y: a.bbox.y }), map({ x: a.bbox.x + a.bbox.w, y: a.bbox.y + a.bbox.h }));
      const scale = a.bbox.h ? r.h / a.bbox.h : 1;
      const fontSize = Math.max(4, round(a.fontSize * scale));
      return withBBox({ ...a, fontSize, bbox: { x: round(r.x), y: round(r.y), w: 0, h: 0 } } as TextNoteAnnotation);
    }
    default:
      return withBBox({ ...a, from: roundPoint(map(a.from)), to: roundPoint(map(a.to)) });
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

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
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
