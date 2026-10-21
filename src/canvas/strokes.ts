import { getStroke } from "perfect-freehand";
import type { ColorId, Rect, StrokeAnnotation, WidthId } from "../model/types";

/** Stroke diameters in world units (PDF points). */
export const WIDTHS: Record<"pen" | "highlighter", Record<WidthId, number>> = {
  pen: { thin: 1.5, medium: 2.75, thick: 5 },
  highlighter: { thin: 9, medium: 15, thick: 24 },
};

export const PEN_COLORS: Record<ColorId, string> = {
  black: "#1d1d1f",
  red: "#e0352b",
  blue: "#1f6feb",
  green: "#1a9b48",
  yellow: "#e8a900",
  pink: "#e0457f",
};

/** Opaque light tints: the highlight layer is multiplied over the page, so
 *  text stays black and overlapping strokes don't get darker. */
export const HIGHLIGHT_COLORS: Record<ColorId, string> = {
  black: "#d2d2d6",
  red: "#ffb8ad",
  blue: "#a9d5ff",
  green: "#b4efa6",
  yellow: "#ffe55c",
  pink: "#ffb3d6",
};

export const COLOR_IDS: ColorId[] = ["black", "red", "blue", "green", "yellow", "pink"];
export const WIDTH_IDS: WidthId[] = ["thin", "medium", "thick"];

export function strokeColor(a: Pick<StrokeAnnotation, "type" | "color">): string {
  return a.type === "highlighter" ? HIGHLIGHT_COLORS[a.color] : PEN_COLORS[a.color];
}

export function strokeSize(a: Pick<StrokeAnnotation, "type" | "width">): number {
  return WIDTHS[a.type][a.width];
}

/** Mouse and trackpad report a constant 0.5; then pressure is simulated
 *  from speed. Pens report real values. */
export function hasRealPressure(points: number[]): boolean {
  for (let i = 2; i < points.length; i += 3) if (points[i] !== 0.5) return true;
  return false;
}

/** Outline polygon of a stroke, from perfect-freehand. */
export function strokeOutline(a: Pick<StrokeAnnotation, "type" | "width" | "points">, last = true): number[][] {
  const input: number[][] = [];
  for (let i = 0; i < a.points.length; i += 3) input.push([a.points[i], a.points[i + 1], a.points[i + 2]]);
  const size = strokeSize(a);
  if (a.type === "highlighter") {
    return getStroke(input, { size, thinning: 0, smoothing: 0.5, streamline: 0.4, simulatePressure: false, last });
  }
  return getStroke(input, {
    size,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: !hasRealPressure(a.points),
    last,
  });
}

/** Smooth closed path through the outline points (midpoint quadratics). */
export function outlinePath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (n < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

export function strokeBBox(points: number[], size: number): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const r = size / 2 + 1;
  return { x: minX - r, y: minY - r, w: maxX - minX + r * 2, h: maxY - minY + r * 2 };
}

/** Distance from a point to the stroke's edge (≤ 0 means inside). */
export function distanceToStroke(a: StrokeAnnotation, x: number, y: number): number {
  const p = a.points;
  let best = Infinity;
  if (p.length < 6) {
    best = Math.hypot(x - p[0], y - p[1]);
  } else {
    for (let i = 0; i + 5 < p.length; i += 3) {
      const d = segmentDistance(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]);
      if (d < best) best = d;
    }
  }
  return best - strokeSize(a) / 2;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
