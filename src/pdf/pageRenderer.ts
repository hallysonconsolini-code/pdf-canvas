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

interface Slot {
  box: PageBox;
  el: HTMLDivElement;
  base: HTMLCanvasElement | null;
  baseScale: number;
  baseJob: { scale: number; task: RenderTask } | null;
  detail: HTMLCanvasElement | null;
  detailKey: string;
  detailJob: { key: string; task: RenderTask } | null;
  text: TextLayer | null;
}

interface Job {
  slot: Slot;
  kind: "base" | "detail";
  scale: number;
  rect: Rect | null;
  key: string;
  priority: number;
}

/**
 * Keeps DOM nodes and bitmaps only for pages near the view, renders them at
 * the screen's real resolution once the camera settles, and frees the rest.
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
    private world: HTMLElement,
  ) {}

  /** Call after every camera change (once per frame). */
  update(zoomChanged: boolean): void {
    const now = performance.now();
    this.lastMove = now;
    if (zoomChanged) this.lastZoomChange = now;
    this.syncSlots();
    this.pump();
    window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => this.pump(), SETTLE_MS + 10);
  }

  /** Re-render everything (e.g. after moving to a screen with another DPI). */
  invalidate(): void {
    for (const slot of this.slots.values()) {
      slot.baseScale = 0;
      slot.detailKey = "";
    }
    this.pump();
  }

  destroy(): void {
    this.destroyed = true;
    window.clearTimeout(this.settleTimer);
    for (const index of [...this.slots.keys()]) this.unmount(index);
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
    el.style.left = `${box.x}px`;
    el.style.top = `${box.y}px`;
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    this.world.appendChild(el);

    const slot: Slot = {
      box,
      el,
      base: null,
      baseScale: 0,
      baseJob: null,
      detail: null,
      detailKey: "",
      detailJob: null,
      text: null,
    };
    this.slots.set(index, slot);
    this.mountTextLayer(slot);
  }

  private mountTextLayer(slot: Slot): void {
    const page = this.doc.pages[slot.box.index];
    const container = document.createElement("div");
    container.className = "textLayer";
    // Laid out at scale 1; the world transform scales it with the page.
    container.style.setProperty("--total-scale-factor", "1");
    container.style.setProperty("--scale-round-x", "1px");
    container.style.setProperty("--scale-round-y", "1px");
    slot.el.appendChild(container);
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
    freeCanvas(slot.base);
    freeCanvas(slot.detail);
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
      const wanted = quantize(visible ? full : full * 0.5);

      // Base bitmap: render right away if the page is blank, otherwise wait
      // until the zoom gesture ends so we don't redraw on every frame.
      const blank = !slot.base && !slot.baseJob;
      const off = slot.baseScale < wanted * 0.85 || slot.baseScale > wanted * 2.5;
      if (blank || (off && zoomSettled)) {
        if (slot.baseJob?.scale !== wanted) {
          jobs.push({ slot, kind: "base", scale: wanted, rect: null, key: String(wanted), priority: (visible ? 0 : 1e7) + distance });
        }
      }

      // Detail bitmap for zoom levels above the base cap.
      const needsDetail = visible && target > cap * 1.15;
      if (!needsDetail) {
        if (slot.detail || slot.detailJob) this.dropDetail(slot);
        continue;
      }
      if (!moveSettled) continue;
      const area = intersect(margin, box);
      if (!area) continue;
      const scale = quantize(target);
      const rect = {
        x: Math.floor(area.x - box.x),
        y: Math.floor(area.y - box.y),
        w: Math.ceil(area.w) + 1,
        h: Math.ceil(area.h) + 1,
      };
      const key = `${scale}:${rect.x}:${rect.y}:${rect.w}:${rect.h}`;
      if (slot.detailKey !== key && slot.detailJob?.key !== key) {
        jobs.push({ slot, kind: "detail", scale, rect, key, priority: 5e6 + distance });
      }
    }
    return jobs;
  }

  private start(job: Job): void {
    const { slot } = job;
    const current = job.kind === "base" ? slot.baseJob : slot.detailJob;
    current?.task.cancel();

    const page = this.doc.pages[slot.box.index];
    const rect = job.rect ?? { x: 0, y: 0, w: slot.box.w, h: slot.box.h };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.w * job.scale));
    canvas.height = Math.max(1, Math.round(rect.h * job.scale));
    canvas.className = job.kind === "base" ? "page-base" : "page-detail";

    const task = page.render({
      canvas,
      viewport: page.getViewport({ scale: job.scale }),
      transform: job.rect ? [1, 0, 0, 1, -rect.x * job.scale, -rect.y * job.scale] : undefined,
      background: "#ffffff",
    });
    if (job.kind === "base") slot.baseJob = { scale: job.scale, task };
    else slot.detailJob = { key: job.key, task };
    this.running++;

    task.promise.then(
      () => {
        if (this.destroyed || this.slots.get(slot.box.index) !== slot) {
          freeCanvas(canvas);
          return;
        }
        if (job.kind === "base") {
          slot.baseJob = null;
          freeCanvas(slot.base);
          slot.base?.remove();
          slot.base = canvas;
          slot.baseScale = job.scale;
          slot.el.prepend(canvas);
        } else {
          slot.detailJob = null;
          freeCanvas(slot.detail);
          slot.detail?.remove();
          canvas.style.left = `${rect.x}px`;
          canvas.style.top = `${rect.y}px`;
          canvas.style.width = `${rect.w}px`;
          canvas.style.height = `${rect.h}px`;
          slot.detail = canvas;
          slot.detailKey = job.key;
          if (slot.base) slot.base.after(canvas);
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
    freeCanvas(slot.detail);
    slot.detail?.remove();
    slot.detail = null;
    slot.detailKey = "";
  }
}

/** Snaps a scale to quarter-octave steps so small zoom changes reuse bitmaps. */
function quantize(scale: number): number {
  return Math.pow(2, Math.ceil(Math.log2(scale) * 4) / 4);
}

/** Releases a canvas' backing store right away (WebKit holds it otherwise). */
function freeCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
