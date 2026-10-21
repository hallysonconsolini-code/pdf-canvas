import type { Rect } from "../model/types";

export const PAGE_GAP = 24;

export interface PageBox extends Rect {
  index: number;
}

export interface DocumentLayout {
  pages: PageBox[];
  /** Box around all pages. */
  bounds: Rect;
  maxPageWidth: number;
}

/** Stacks pages vertically, centred on x = 0. Sizes are in PDF points. */
export function layoutPages(sizes: { width: number; height: number }[]): DocumentLayout {
  const pages: PageBox[] = [];
  let y = 0;
  let maxW = 0;
  sizes.forEach((s, index) => {
    pages.push({ index, x: -s.width / 2, y, w: s.width, h: s.height });
    y += s.height + PAGE_GAP;
    maxW = Math.max(maxW, s.width);
  });
  const height = Math.max(0, y - PAGE_GAP);
  return { pages, bounds: { x: -maxW / 2, y: 0, w: maxW, h: height }, maxPageWidth: maxW };
}

/** Index of the first page whose bottom edge is below worldY. */
function firstPageEndingAfter(pages: PageBox[], worldY: number): number {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pages[mid].y + pages[mid].h < worldY) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Inclusive range of pages overlapping [top, bottom], or null. */
export function pagesInRange(pages: PageBox[], top: number, bottom: number): [number, number] | null {
  if (!pages.length) return null;
  const first = firstPageEndingAfter(pages, top);
  if (pages[first].y > bottom) return null;
  let last = first;
  while (last + 1 < pages.length && pages[last + 1].y <= bottom) last++;
  return [first, last];
}

/** Page nearest to a world y coordinate. */
export function pageAtY(pages: PageBox[], worldY: number): number {
  if (!pages.length) return 0;
  const i = firstPageEndingAfter(pages, worldY);
  return Math.min(i, pages.length - 1);
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  return r > x && bt > y ? { x, y, w: r - x, h: bt - y } : null;
}
