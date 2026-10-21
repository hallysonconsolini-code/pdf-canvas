import type { AnnotationStore, StoreChange } from "../model/document";
import type { Annotation, Rect, Vec2 } from "../model/types";
import type { Camera } from "./camera";
import { distanceTo, drawAnnotation, isHighlightLayer } from "./geometry";
import { overlaps, SpatialIndex } from "./spatialIndex";

/** Screen size of the selection handles, in CSS pixels. */
export const HANDLE_PX = 8;
/** Selection box padding around the items, in CSS pixels. */
export const BOX_PAD_PX = 4;
/** Handle positions as fractions of the box: corners and edge midpoints. */
export const HANDLES: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
];

/**
 * Draws annotations on screen-sized canvases (crisp at any zoom):
 * - highlight: highlighter strokes and text highlights, multiplied over the
 *   page so text shows through
 * - ink: everything else
 * - live: the item being drawn (so drawing never repaints old strokes),
 *   plus the selection box, handles and lasso
 *
 * Each canvas is as big as the window at Retina density (~18 MB), so a layer
 * only gets pixels while it has something to show.
 */
export class AnnotationRenderer {
  private highlight: HTMLCanvasElement;
  private ink: HTMLCanvasElement;
  private live: HTMLCanvasElement;
  private index = new SpatialIndex<Annotation>();
  private paths = new WeakMap<Annotation, Path2D>();
  private hidden = new Set<string>();
  private preview: Annotation[] = [];
  private wetItem: Annotation | null = null;
  private liveFrame = 0;
  private redrawFrame = 0;
  private selectionBox: Rect | null = null;
  private lasso: Vec2[] | null = null;
  private highlightCount = 0;
  private inkCount = 0;
  private unsubscribe: () => void;

  constructor(
    host: HTMLElement,
    private camera: Camera,
    private store: AnnotationStore,
  ) {
    this.highlight = makeCanvas("annotations annotations-highlight");
    this.ink = makeCanvas("annotations");
    this.live = makeCanvas("annotations annotations-wet");
    host.append(this.highlight, this.ink, this.live);
    for (const a of store.all()) this.track(a, 1);
    this.unsubscribe = store.subscribe((change) => this.onChange(change));
  }

  destroy(): void {
    this.unsubscribe();
    cancelAnimationFrame(this.liveFrame);
    cancelAnimationFrame(this.redrawFrame);
    for (const c of [this.highlight, this.ink, this.live]) {
      c.width = c.height = 0;
      c.remove();
    }
  }

  resize(): void {
    this.redraw();
  }

  /** Repaints everything visible (after camera moves or deletions). */
  redraw(): void {
    cancelAnimationFrame(this.redrawFrame);
    this.redrawFrame = 0;
    const previewHl = this.preview.some(isHighlightLayer);
    const previewInk = this.preview.some((a) => !isHighlightLayer(a));
    const hl = this.prepare(this.highlight, this.highlightCount > 0 || previewHl);
    const ink = this.prepare(this.ink, this.inkCount > 0 || previewInk);
    const view = this.camera.visibleRect();
    const visible = this.store.sorted(this.index.query(view));
    for (const a of visible) {
      if (this.hidden.has(a.id)) continue;
      const ctx = isHighlightLayer(a) ? hl : ink;
      if (ctx) drawAnnotation(ctx, a, this.paths);
    }
    for (const a of this.preview) {
      const ctx = isHighlightLayer(a) ? hl : ink;
      if (ctx && overlaps(a.bbox, view)) drawAnnotation(ctx, a);
    }
    this.drawLive();
  }

  /** The item being drawn right now (not yet in the store). */
  setWet(item: Annotation | null): void {
    this.wetItem = item;
    this.live.classList.toggle("is-highlighter", !!item && isHighlightLayer(item));
    this.scheduleLive();
  }

  /**
   * Shows modified copies in place of the originals (same ids) while moving
   * or resizing, and hides extra ids (eraser preview, text being edited).
   */
  setPreview(items: Annotation[], hiddenIds: Iterable<string> = []): void {
    this.preview = items;
    this.hidden = new Set(hiddenIds);
    for (const a of items) this.hidden.add(a.id);
    this.scheduleRedraw();
  }

  setSelectionBox(box: Rect | null): void {
    this.selectionBox = box;
    this.drawLive();
  }

  setLasso(points: Vec2[] | null): void {
    this.lasso = points;
    this.scheduleLive();
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

  private track(a: Annotation, delta: 1 | -1): void {
    if (delta === 1) this.index.insert(a);
    else this.index.remove(a);
    if (isHighlightLayer(a)) this.highlightCount += delta;
    else this.inkCount += delta;
  }

  private scheduleRedraw(): void {
    if (!this.redrawFrame) this.redrawFrame = requestAnimationFrame(() => this.redraw());
  }

  private scheduleLive(): void {
    if (!this.liveFrame) {
      this.liveFrame = requestAnimationFrame(() => {
        this.liveFrame = 0;
        this.drawLive();
      });
    }
  }

  private onChange({ added, removed }: StoreChange): void {
    for (const a of removed) {
      this.track(a, -1);
      this.paths.delete(a);
    }
    for (const a of added) this.track(a, 1);
    const needsNewLayer = added.some((a) => (isHighlightLayer(a) ? this.highlight : this.ink).width === 0);
    if (removed.length || this.preview.length || needsNewLayer) {
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

  /** Item being drawn (world space) and selection UI (screen space). */
  private drawLive(): void {
    const hasLasso = !!this.lasso && this.lasso.length > 1;
    const ctx = this.prepare(this.live, !!this.wetItem || !!this.selectionBox || hasLasso);
    if (!ctx) return;
    if (this.wetItem) drawAnnotation(ctx, this.wetItem, undefined, true);

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const accent = getComputedStyle(this.live).getPropertyValue("--accent").trim() || "#0a66d8";
    const toScreen = (p: Vec2): Vec2 => ({
      x: (p.x - this.camera.x) * this.camera.zoom,
      y: (p.y - this.camera.y) * this.camera.zoom,
    });

    if (hasLasso) {
      ctx.beginPath();
      this.lasso!.forEach((p, i) => {
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
      const pad = BOX_PAD_PX;
      const x = Math.round(a.x - pad) + 0.5;
      const y = Math.round(a.y - pad) + 0.5;
      const w = Math.round(b.x - a.x + pad * 2);
      const h = Math.round(b.y - a.y + pad * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#ffffff";
      for (const [fx, fy] of HANDLES) {
        const hx = x + w * fx;
        const hy = y + h * fy;
        ctx.fillRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
        ctx.strokeRect(hx - HANDLE_PX / 2, hy - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
      }
    }
  }

  /**
   * Sizes a layer (or frees it when unused), clears it and sets the
   * world -> device pixel transform. Returns null for an unused layer.
   */
  private prepare(canvas: HTMLCanvasElement, used: boolean): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1;
    const w = used ? Math.round(this.camera.width * dpr) : 0;
    const h = used ? Math.round(this.camera.height * dpr) : 0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (!used) return null;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
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

