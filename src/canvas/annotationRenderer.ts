import type { AnnotationStore, StoreChange } from "../model/document";
import type { Annotation, Rect, Vec2 } from "../model/types";
import type { Camera } from "./camera";
import { distanceTo, drawAnnotation, isHighlightLayer } from "./geometry";
import { overlaps, SpatialIndex } from "./spatialIndex";

/** Screen size of the selection corner handles, in CSS pixels. */
export const HANDLE_PX = 8;

/**
 * Draws annotations on screen-sized canvases (crisp at any zoom):
 * - highlight: highlighter strokes and text highlights, multiplied over the
 *   page so text shows through
 * - ink: everything else
 * - wet: only the item being drawn, so drawing never repaints old strokes
 * - overlay: selection box, handles and lasso
 */
export class AnnotationRenderer {
  private highlight: HTMLCanvasElement;
  private ink: HTMLCanvasElement;
  private wet: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private index = new SpatialIndex<Annotation>();
  private paths = new WeakMap<Annotation, Path2D>();
  private hidden = new Set<string>();
  private preview: Annotation[] = [];
  private wetItem: Annotation | null = null;
  private wetFrame = 0;
  private redrawFrame = 0;
  private selectionBox: Rect | null = null;
  private lasso: Vec2[] | null = null;
  private unsubscribe: () => void;

  constructor(
    host: HTMLElement,
    private camera: Camera,
    private store: AnnotationStore,
  ) {
    this.highlight = makeCanvas("annotations annotations-highlight");
    this.ink = makeCanvas("annotations");
    this.wet = makeCanvas("annotations annotations-wet");
    this.overlay = makeCanvas("annotations annotations-overlay");
    host.append(this.highlight, this.ink, this.wet, this.overlay);
    for (const a of store.all()) this.index.insert(a);
    this.unsubscribe = store.subscribe((change) => this.onChange(change));
  }

  destroy(): void {
    this.unsubscribe();
    cancelAnimationFrame(this.wetFrame);
    cancelAnimationFrame(this.redrawFrame);
    for (const c of this.canvases()) c.remove();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    for (const c of this.canvases()) {
      c.width = Math.round(this.camera.width * dpr);
      c.height = Math.round(this.camera.height * dpr);
    }
    this.redraw();
  }

  /** Repaints everything visible (after camera moves or deletions). */
  redraw(): void {
    cancelAnimationFrame(this.redrawFrame);
    this.redrawFrame = 0;
    const hl = this.prepare(this.highlight);
    const ink = this.prepare(this.ink);
    const view = this.camera.visibleRect();
    const visible = this.store.sorted(this.index.query(view));
    for (const a of visible) {
      if (this.hidden.has(a.id)) continue;
      drawAnnotation(isHighlightLayer(a) ? hl : ink, a, this.paths);
    }
    for (const a of this.preview) {
      if (overlaps(a.bbox, view)) drawAnnotation(isHighlightLayer(a) ? hl : ink, a);
    }
    this.drawWet();
    this.drawOverlay();
  }

  /** The item being drawn right now (not yet in the store). */
  setWet(item: Annotation | null): void {
    this.wetItem = item;
    this.wet.classList.toggle("is-highlighter", !!item && isHighlightLayer(item));
    if (!this.wetFrame) {
      this.wetFrame = requestAnimationFrame(() => {
        this.wetFrame = 0;
        this.drawWet();
      });
    }
  }

  /**
   * Shows modified copies in place of the originals (same ids) while moving
   * or resizing, and hides extra ids (eraser preview, note being edited).
   */
  setPreview(items: Annotation[], hiddenIds: Iterable<string> = []): void {
    this.preview = items;
    this.hidden = new Set(hiddenIds);
    for (const a of items) this.hidden.add(a.id);
    this.scheduleRedraw();
  }

  setSelectionBox(box: Rect | null): void {
    this.selectionBox = box;
    this.drawOverlay();
  }

  setLasso(points: Vec2[] | null): void {
    this.lasso = points;
    this.drawOverlay();
  }

  /** Annotations touching a point (topmost first). See `distanceTo`. */
  hitTest(x: number, y: number, radius: number, solid = false): Annotation[] {
    const near = this.index.query({ x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
    const hits = near.filter((a) => !this.hidden.has(a.id) && distanceTo(a, x, y, solid) <= radius);
    return this.store.sorted(hits).reverse();
  }

  query(rect: Rect): Annotation[] {
    return this.index.query(rect);
  }

  private canvases(): HTMLCanvasElement[] {
    return [this.highlight, this.ink, this.wet, this.overlay];
  }

  private scheduleRedraw(): void {
    if (!this.redrawFrame) this.redrawFrame = requestAnimationFrame(() => this.redraw());
  }

  private onChange({ added, removed }: StoreChange): void {
    for (const a of removed) {
      this.index.remove(a);
      this.paths.delete(a);
    }
    for (const a of added) this.index.insert(a);
    if (removed.length || this.preview.length) {
      this.redraw();
      return;
    }
    // Pure additions go on top: draw just those.
    const view = this.camera.visibleRect();
    const hl = this.context(this.highlight);
    const ink = this.context(this.ink);
    for (const a of added) {
      if (overlaps(a.bbox, view) && !this.hidden.has(a.id)) drawAnnotation(isHighlightLayer(a) ? hl : ink, a, this.paths);
    }
  }

  private drawWet(): void {
    const ctx = this.prepare(this.wet);
    if (this.wetItem) drawAnnotation(ctx, this.wetItem, undefined, true);
  }

  private drawOverlay(): void {
    const ctx = this.overlay.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const accent = getComputedStyle(this.overlay).getPropertyValue("--accent").trim() || "#0a66d8";
    const toScreen = (p: Vec2): Vec2 => ({
      x: (p.x - this.camera.x) * this.camera.zoom,
      y: (p.y - this.camera.y) * this.camera.zoom,
    });

    if (this.lasso && this.lasso.length > 1) {
      ctx.beginPath();
      this.lasso.forEach((p, i) => {
        const s = toScreen(p);
        if (i) ctx.lineTo(s.x, s.y);
        else ctx.moveTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.06;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const box = this.selectionBox;
    if (box) {
      const a = toScreen({ x: box.x, y: box.y });
      const b = toScreen({ x: box.x + box.w, y: box.y + box.h });
      const pad = 4;
      const x = Math.round(a.x - pad) + 0.5;
      const y = Math.round(a.y - pad) + 0.5;
      const w = Math.round(b.x - a.x + pad * 2);
      const h = Math.round(b.y - a.y + pad * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#ffffff";
      for (const [hx, hy] of [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ]) {
        ctx.fillRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
        ctx.strokeRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
      }
    }
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

