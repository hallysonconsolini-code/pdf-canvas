import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PdfDocument } from "../pdf/loader";

interface Props {
  doc: PdfDocument;
  current: number;
  onGoTo(index: number): void;
}

const THUMB_WIDTH = 112;
const GAP = 20;
const LABEL = 16;
/** Thumbnails kept in memory (small: ~112×145 px each at 2×). */
const CACHE_SIZE = 80;

/**
 * Page thumbnails (⌘B). Only rows in view are mounted, and bitmaps are
 * rendered on demand, one at a time, so a 300-page PDF stays light.
 */
export function Thumbnails({ doc, current, onGoTo }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 800 });
  const cache = useRef(new ThumbCache(doc)).current;
  useEffect(() => () => cache.destroy(), [cache]);

  // Row positions from each page's aspect ratio.
  const rows = useMemo(() => {
    let y = GAP / 2;
    return doc.layout.pages.map((p) => {
      const h = Math.round((THUMB_WIDTH * p.h) / p.w);
      const row = { y, h };
      y += h + LABEL + GAP;
      return row;
    });
  }, [doc]);
  const total = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h + LABEL + GAP : 0;

  useEffect(() => {
    const el = scroller.current!;
    const update = () => setScroll({ top: el.scrollTop, height: el.clientHeight });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // Keep the current page in view.
  useEffect(() => {
    const el = scroller.current;
    const row = rows[current];
    if (!el || !row) return;
    if (row.y < el.scrollTop || row.y + row.h + LABEL > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: row.y - el.clientHeight / 3, behavior: "smooth" });
    }
  }, [current, rows]);

  const buffer = 400;
  const visible = rows
    .map((row, index) => ({ ...row, index }))
    .filter((r) => r.y + r.h + LABEL > scroll.top - buffer && r.y < scroll.top + scroll.height + buffer);

  return (
    <nav className="thumbnails" aria-label="Miniaturas das páginas">
      <div className="thumbnails-scroll" ref={scroller}>
        <div style={{ height: total, position: "relative" }}>
          {visible.map((r) => (
            <button
              key={r.index}
              className="thumb"
              aria-current={r.index === current ? "page" : undefined}
              aria-label={`Página ${r.index + 1}`}
              style={{ top: r.y, height: r.h + LABEL }}
              onClick={() => onGoTo(r.index)}
            >
              <ThumbImage cache={cache} index={r.index} height={r.h} />
              <span className="thumb-label">{r.index + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function ThumbImage({ cache, index, height }: { cache: ThumbCache; index: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    cache.get(index).then((canvas) => {
      if (alive && canvas && box.current) box.current.replaceChildren(canvas);
    });
    return () => {
      alive = false;
      cache.cancel(index);
    };
  }, [cache, index]);
  return <div className="thumb-image" ref={box} style={{ width: THUMB_WIDTH, height }} />;
}

/** Renders thumbnails one at a time and keeps the most recent ones. */
class ThumbCache {
  private done = new Map<number, HTMLCanvasElement>();
  private waiting = new Map<number, (c: HTMLCanvasElement | null) => void>();
  private queue: number[] = [];
  private task: RenderTask | null = null;
  private destroyed = false;

  constructor(private doc: PdfDocument) {}

  get(index: number): Promise<HTMLCanvasElement | null> {
    const hit = this.done.get(index);
    if (hit) {
      // Refresh its place in the cache.
      this.done.delete(index);
      this.done.set(index, hit);
      return Promise.resolve(hit);
    }
    return new Promise((resolve) => {
      this.waiting.get(index)?.(null);
      this.waiting.set(index, resolve);
      if (!this.queue.includes(index)) this.queue.push(index);
      this.next();
    });
  }

  cancel(index: number): void {
    this.queue = this.queue.filter((i) => i !== index);
    this.waiting.delete(index);
  }

  destroy(): void {
    this.destroyed = true;
    this.task?.cancel();
    this.queue = [];
    for (const c of this.done.values()) c.width = c.height = 0;
    this.done.clear();
  }

  private async next(): Promise<void> {
    if (this.task || this.destroyed) return;
    const index = this.queue.shift();
    if (index === undefined) return;
    const page = this.doc.pages[index];
    const base = page.getViewport({ scale: 1 });
    const scale = (THUMB_WIDTH * (window.devicePixelRatio || 1)) / base.width;
    const canvas = document.createElement("canvas");
    const viewport = page.getViewport({ scale });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    this.task = page.render({ canvas, viewport, background: "#ffffff" });
    try {
      await this.task.promise;
      this.done.set(index, canvas);
      if (this.done.size > CACHE_SIZE) {
        const oldest = this.done.keys().next().value!;
        const c = this.done.get(oldest)!;
        c.width = c.height = 0;
        this.done.delete(oldest);
      }
      this.waiting.get(index)?.(canvas);
    } catch {
      this.waiting.get(index)?.(null);
    } finally {
      this.waiting.delete(index);
      this.task = null;
      this.next();
    }
  }
}
