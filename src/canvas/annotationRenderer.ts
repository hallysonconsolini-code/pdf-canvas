import type { AnnotationStore, StoreChange } from "../model/document";
import type { Annotation, StrokeAnnotation } from "../model/types";
import type { Camera } from "./camera";
import { overlaps, SpatialIndex } from "./spatialIndex";
import { distanceToStroke, outlinePath, strokeColor, strokeOutline } from "./strokes";

/** A stroke being drawn right now (not yet in the store). */
export type WetStroke = Pick<StrokeAnnotation, "type" | "color" | "width" | "points">;

/**
 * Draws annotations on screen-sized canvases (crisp at any zoom):
 * - highlight: highlighter strokes, multiplied over the page so text shows through
 * - ink: everything else
 * - wet: only the stroke in progress, so drawing never repaints old strokes
 */
export class AnnotationRenderer {
  private highlight: HTMLCanvasElement;
  private ink: HTMLCanvasElement;
  private wet: HTMLCanvasElement;
  private index = new SpatialIndex<Annotation>();
  private paths = new WeakMap<Annotation, Path2D>();
  private hidden = new Set<string>();
  private wetStroke: WetStroke | null = null;
  private wetFrame = 0;
  private unsubscribe: () => void;

  constructor(
    host: HTMLElement,
    private camera: Camera,
    private store: AnnotationStore,
  ) {
    this.highlight = makeCanvas("annotations annotations-highlight");
    this.ink = makeCanvas("annotations");
    this.wet = makeCanvas("annotations annotations-wet");
    host.append(this.highlight, this.ink, this.wet);
    for (const a of store.all()) this.index.insert(a);
    this.unsubscribe = store.subscribe((change) => this.onChange(change));
  }

  destroy(): void {
    this.unsubscribe();
    cancelAnimationFrame(this.wetFrame);
    this.highlight.remove();
    this.ink.remove();
    this.wet.remove();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    for (const c of [this.highlight, this.ink, this.wet]) {
      c.width = Math.round(this.camera.width * dpr);
      c.height = Math.round(this.camera.height * dpr);
    }
    this.redraw();
    this.drawWet();
  }

  /** Repaints all visible annotations (after camera moves or deletions). */
  redraw(): void {
    const hl = this.prepare(this.highlight);
    const ink = this.prepare(this.ink);
    const visible = this.store.sorted(this.index.query(this.camera.visibleRect()));
    for (const a of visible) {
      if (this.hidden.has(a.id)) continue;
      this.drawItem(a.type === "highlighter" ? hl : ink, a);
    }
    this.drawWet();
  }

  setWet(stroke: WetStroke | null): void {
    this.wetStroke = stroke;
    this.wet.classList.toggle("is-highlighter", stroke?.type === "highlighter");
    if (!this.wetFrame) {
      this.wetFrame = requestAnimationFrame(() => {
        this.wetFrame = 0;
        this.drawWet();
      });
    }
  }

  /** Temporarily hides annotations (eraser preview). */
  setHidden(ids: Iterable<string>): void {
    this.hidden = new Set(ids);
    this.redraw();
  }

  /** Strokes within `radius` world units of a point, topmost first. */
  hitTest(x: number, y: number, radius: number): Annotation[] {
    const near = this.index.query({ x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
    const hits = near.filter((a) => {
      if (a.type === "pen" || a.type === "highlighter") return distanceToStroke(a, x, y) <= radius;
      return false;
    });
    return this.store.sorted(hits).reverse();
  }

  private onChange({ added, removed }: StoreChange): void {
    for (const a of removed) {
      this.index.remove(a);
      this.paths.delete(a);
    }
    for (const a of added) this.index.insert(a);
    if (removed.length) {
      this.redraw();
      return;
    }
    // Pure additions go on top: draw just those.
    const view = this.camera.visibleRect();
    const hl = this.context(this.highlight);
    const ink = this.context(this.ink);
    for (const a of added) {
      if (!overlaps(a.bbox, view)) continue;
      this.drawItem(a.type === "highlighter" ? hl : ink, a);
    }
  }

  private drawWet(): void {
    const ctx = this.prepare(this.wet);
    const s = this.wetStroke;
    if (!s || !s.points.length) return;
    ctx.fillStyle = strokeColor(s);
    ctx.fill(outlinePath(strokeOutline(s, false)));
  }

  private drawItem(ctx: CanvasRenderingContext2D, a: Annotation): void {
    if (a.type !== "pen" && a.type !== "highlighter") return;
    let path = this.paths.get(a);
    if (!path) {
      path = outlinePath(strokeOutline(a));
      this.paths.set(a, path);
    }
    ctx.fillStyle = strokeColor(a);
    ctx.fill(path);
  }

  /** Clears a canvas and sets the world -> device pixel transform. */
  private prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return this.context(canvas);
  }

  private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d")!;
    const s = this.camera.zoom * (window.devicePixelRatio || 1);
    ctx.setTransform(s, 0, 0, s, -this.camera.x * s, -this.camera.y * s);
    return ctx;
  }
}

function makeCanvas(className: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = className;
  return c;
}

