import { RenderingCancelledException, TextLayer, type RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Camera } from "../canvas/camera";
import type { Rect } from "../model/types";
import { intersect, pagesInRange, type PageBox } from "./layout";
import type { PdfDocument } from "./loader";

/** Largest full-page bitmap (~40 MB). Beyond it, a viewport-sized detail
 *  bitmap covers the visible part of the page at full sharpness. */
const MAX_BASE_PIXELS = 10_000_000;
/** Pages kept mounted (with bitmaps) around the visible ones. */
const PREFETCH_PAGES = 1;
/** Pages further than this from the view are unloaded. */
const KEEP_PAGES = 2;
const MAX_CONCURRENT_RENDERS = 2;
/** Wait for zoom/pan to stop before re-rendering sharper bitmaps. */
const SETTLE_MS = 150;
/** Scale difference tolerated before re-rendering (1%). */
const SCALE_TOLERANCE = 0.01;

/** A bitmap of a page region rendered at a given scale. */
interface Bitmap {
  canvas: HTMLCanvasElement;
  scale: number;
  /** Page-local region in world units (whole page for the base bitmap). */
  rect: Rect;
}

interface Slot {
  box: PageBox;
  el: HTMLDivElement;
  textBox: HTMLDivElement;
  base: Bitmap | null;
  baseJob: { scale: number; task: RenderTask } | null;
  detail: Bitmap | null;
  detailKey: string;
  detailJob: { key: string; task: RenderTask } | null;
  text: TextLayer | null;
}

interface Job {
  slot: Slot;
  kind: "base" | "detail";
  scale: number;
  rect: Rect;
  key: string;
  priority: number;
}

/**
 * Keeps DOM nodes and bitmaps only for pages near the view and renders them
 * at the screen's exact pixel density once the camera settles.
 *
 * Pages are positioned in screen pixels (no CSS scale on an ancestor), and
 * every bitmap is shown at canvas.width / devicePixelRatio CSS pixels, so a
 * settled page maps 1:1 to physical pixels and stays as sharp as vector text.
 */
export class PageRenderer {
  private slots = new Map<number, Slot>();
  private running = 0;
  private lastZoomChange = 0;
  private lastMove = 0;
  private settleTimer = 0;
  private destroyed = false;

  constructor(
    private doc: PdfDocument,
    private camera: Camera,
    private host: HTMLElement,
  ) {}

  /** Call after every camera change (once per frame). */
  update(zoomChanged: boolean): void {
    const now = performance.now();
    this.lastMove = now;
    if (zoomChanged) this.lastZoomChange = now;
    this.syncSlots();
    for (const slot of this.slots.values()) this.position(slot);
    this.pump();
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.pump(), SETTLE_MS + 10);
  }

  /** Re-render everything (e.g. after moving to a screen with another DPI). */
  invalidate(): void {
    for (const slot of this.slots.values()) {
      if (slot.base) slot.base.scale = 0;
      slot.detailKey = "";
    }
    this.update(true);
  }

  destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.settleTimer);
    for (const index of [...this.slots.keys()]) this.unmount(index);
  }

  // ---- placement -------------------------------------------------------

  /** Places a page and its bitmaps in screen pixels, snapped to device pixels. */
  private position(slot: Slot): void {
    const { zoom } = this.camera;
    const dpr = window.devicePixelRatio || 1;
    const { box, el } = slot;
    const left = snap((box.x - this.camera.x) * zoom, dpr);
    const top = snap((box.y - this.camera.y) * zoom, dpr);
    el.style.transform = `translate(${left}px, ${top}px)`;
    el.style.width = `${box.w * zoom}px`;
    el.style.height = `${box.h * zoom}px`;
    // The text layer is transparent, so scaling it with CSS is fine.
    slot.textBox.style.transform = `scale(${zoom})`;
    if (slot.base) placeBitmap(slot.base, zoom);
    if (slot.detail) placeBitmap(slot.detail, zoom);
  }

  // ---- slot management -------------------------------------------------

  private visibleRange(): [number, number] | null {
    const v = this.camera.visibleRect();
    return pagesInRange(this.doc.layout.pages, v.y, v.y + v.h);
  }

  private syncSlots(): void {
    const range = this.visibleRange();
    const pages = this.doc.layout.pages;
    if (!range) {
      for (const index of [...this.slots.keys()]) this.unmount(index);
      return;
    }
    const keepFrom = Math.max(0, range[0] - KEEP_PAGES);
    const keepTo = Math.min(pages.length - 1, range[1] + KEEP_PAGES);
    for (const index of [...this.slots.keys()]) {
      if (index < keepFrom || index > keepTo) this.unmount(index);
    }
    const from = Math.max(0, range[0] - PREFETCH_PAGES);
    const to = Math.min(pages.length - 1, range[1] + PREFETCH_PAGES);
    for (let i = from; i <= to; i++) if (!this.slots.has(i)) this.mount(i);
  }

  private mount(index: number): void {
    const box = this.doc.layout.pages[index];
    const el = document.createElement("div");
    el.className = "page";
    const textBox = document.createElement("div");
    textBox.className = "page-text";
    textBox.style.width = `${box.w}px`;
    textBox.style.height = `${box.h}px`;
    el.appendChild(textBox);
    this.host.appendChild(el);

    const slot: Slot = {
      box,
      el,
      textBox,
      base: null,
      baseJob: null,
      detail: null,
      detailKey: "",
      detailJob: null,
      text: null,
    };
    this.slots.set(index, slot);
    this.position(slot);
    this.mountTextLayer(slot);
  }

  private mountTextLayer(slot: Slot): void {
    const page = this.doc.pages[slot.box.index];
    const container = document.createElement("div");
    container.className = "textLayer";
    // Laid out at scale 1; .page-text scales it to the current zoom.
    container.style.setProperty("--total-scale-factor", "1");
    container.style.setProperty("--scale-round-x", "1px");
    container.style.setProperty("--scale-round-y", "1px");
    slot.textBox.appendChild(container);
    const text = new TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale: 1 }),
    });
    slot.text = text;
    text.render().catch(() => {});
  }

  private unmount(index: number): void {
    const slot = this.slots.get(index);
    if (!slot) return;
    slot.baseJob?.task.cancel();
    slot.detailJob?.task.cancel();
    slot.text?.cancel();
    freeCanvas(slot.base?.canvas);
    freeCanvas(slot.detail?.canvas);
    slot.el.remove();
    this.slots.delete(index);
    // Drops cached drawing operations for this page.
    this.doc.pages[index].cleanup();
  }

  // ---- render scheduling -----------------------------------------------

  private pump(): void {
    if (this.destroyed) return;
    const jobs = this.collectJobs();
    jobs.sort((a, b) => a.priority - b.priority);
    for (const job of jobs) {
      if (this.running >= MAX_CONCURRENT_RENDERS) break;
      this.start(job);
    }
  }

  private collectJobs(): Job[] {
    const jobs: Job[] = [];
    const now = performance.now();
    const zoomSettled = now - this.lastZoomChange >= SETTLE_MS;
    const moveSettled = now - this.lastMove >= SETTLE_MS;
    const dpr = window.devicePixelRatio || 1;
    const target = this.camera.zoom * dpr;
    const view = this.camera.visibleRect();
    const viewCenter = view.y + view.h / 2;
    const margin = { x: view.x - view.w * 0.1, y: view.y - view.h * 0.1, w: view.w * 1.2, h: view.h * 1.2 };

    for (const slot of this.slots.values()) {
      const { box } = slot;
      const visible = intersect(box, view) !== null;
      const distance = Math.abs(box.y + box.h / 2 - viewCenter);
      const cap = Math.sqrt(MAX_BASE_PIXELS / (box.w * box.h));
      const full = Math.min(target, cap);
      const wanted = visible ? full : full * 0.5;

      // Base bitmap: render right away if the page is blank, otherwise wait
      // until the zoom gesture ends so we don't redraw on every frame.
      const blank = !slot.base && !slot.baseJob;
      const current = slot.base?.scale ?? 0;
      const off = visible
        ? Math.abs(current - wanted) > wanted * SCALE_TOLERANCE
        : current < wanted * 0.85 || current > wanted * 2.5;
      if ((blank || (off && zoomSettled)) && !sameScale(slot.baseJob?.scale, wanted)) {
        const rect = { x: 0, y: 0, w: box.w, h: box.h };
        jobs.push({ slot, kind: "base", scale: wanted, rect, key: "", priority: (visible ? 0 : 1e7) + distance });
      }

      // Detail bitmap for zoom levels above the base cap.
      const needsDetail = visible && target > cap * (1 + SCALE_TOLERANCE);
      if (!needsDetail) {
        if (slot.detail || slot.detailJob) this.dropDetail(slot);
        continue;
      }
      if (!moveSettled) continue;
      const area = intersect(margin, box);
      if (!area) continue;
      // Region edges on whole device pixels so the bitmap lines up exactly.
      const x0 = Math.floor((area.x - box.x) * target) / target;
      const y0 = Math.floor((area.y - box.y) * target) / target;
      const x1 = Math.ceil((area.x + area.w - box.x) * target) / target;
      const y1 = Math.ceil((area.y + area.h - box.y) * target) / target;
      const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const key = `${target}:${x0}:${y0}:${x1}:${y1}`;
      if (slot.detailKey !== key && slot.detailJob?.key !== key) {
        jobs.push({ slot, kind: "detail", scale: target, rect, key, priority: 5e6 + distance });
      }
    }
    return jobs;
  }

  private start(job: Job): void {
    const { slot, rect, scale } = job;
    const current = job.kind === "base" ? slot.baseJob : slot.detailJob;
    current?.task.cancel();

    const page = this.doc.pages[slot.box.index];
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.w * scale));
    canvas.height = Math.max(1, Math.round(rect.h * scale));
    canvas.className = job.kind === "base" ? "page-base" : "page-detail";

    const task = page.render({
      canvas,
      viewport: page.getViewport({ scale }),
      transform: rect.x || rect.y ? [1, 0, 0, 1, -rect.x * scale, -rect.y * scale] : undefined,
      background: "#ffffff",
    });
    if (job.kind === "base") slot.baseJob = { scale, task };
    else slot.detailJob = { key: job.key, task };
    this.running++;

    task.promise.then(
      () => {
        if (this.destroyed || this.slots.get(slot.box.index) !== slot) {
          freeCanvas(canvas);
          return;
        }
        const bitmap: Bitmap = { canvas, scale, rect };
        placeBitmap(bitmap, this.camera.zoom);
        if (job.kind === "base") {
          slot.baseJob = null;
          freeCanvas(slot.base?.canvas);
          slot.base?.canvas.remove();
          slot.base = bitmap;
          slot.el.prepend(canvas);
        } else {
          slot.detailJob = null;
          freeCanvas(slot.detail?.canvas);
          slot.detail?.canvas.remove();
          slot.detail = bitmap;
          slot.detailKey = job.key;
          if (slot.base) slot.base.canvas.after(canvas);
          else slot.el.prepend(canvas);
        }
      },
      (err: unknown) => {
        freeCanvas(canvas);
        if (job.kind === "base" && slot.baseJob?.task === task) slot.baseJob = null;
        if (job.kind === "detail" && slot.detailJob?.task === task) slot.detailJob = null;
        if (!(err instanceof RenderingCancelledException)) console.error("render failed", err);
      },
    ).finally(() => {
      this.running--;
      this.pump();
    });
  }

  private dropDetail(slot: Slot): void {
    slot.detailJob?.task.cancel();
    slot.detailJob = null;
    freeCanvas(slot.detail?.canvas);
    slot.detail?.canvas.remove();
    slot.detail = null;
    slot.detailKey = "";
  }
}

/**
 * Sizes a bitmap so that, at the scale it was rendered for, one canvas pixel
 * covers exactly one device pixel. At other zoom levels (mid-gesture) it is
 * stretched until the sharper re-render arrives.
 */
function placeBitmap(bitmap: Bitmap, zoom: number): void {
  const ratio = zoom / bitmap.scale; // CSS px per canvas px
  const s = bitmap.canvas.style;
  s.left = `${bitmap.rect.x * zoom}px`;
  s.top = `${bitmap.rect.y * zoom}px`;
  s.width = `${bitmap.canvas.width * ratio}px`;
  s.height = `${bitmap.canvas.height * ratio}px`;
}

function snap(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

function sameScale(a: number | undefined, b: number): boolean {
  return a !== undefined && Math.abs(a - b) <= b * SCALE_TOLERANCE;
}

/** Releases a canvas' backing store right away (WebKit holds it otherwise). */
function freeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
