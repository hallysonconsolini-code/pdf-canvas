import type { Rect } from "../model/types";

const CELL = 256; // world units (points)

/** Uniform grid over world space: fast "what is near here" lookups. */
export class SpatialIndex<T extends { id: string; bbox: Rect }> {
  private cells = new Map<string, Set<T>>();

  insert(item: T): void {
    this.forCells(item.bbox, (key) => {
      let set = this.cells.get(key);
      if (!set) this.cells.set(key, (set = new Set()));
      set.add(item);
    });
  }

  remove(item: T): void {
    this.forCells(item.bbox, (key) => {
      const set = this.cells.get(key);
      if (!set) return;
      set.delete(item);
      if (!set.size) this.cells.delete(key);
    });
  }

  /** Items whose bounding box intersects the rectangle. */
  query(rect: Rect): T[] {
    const found = new Set<T>();
    this.forCells(rect, (key) => {
      const set = this.cells.get(key);
      if (!set) return;
      for (const item of set) if (overlaps(item.bbox, rect)) found.add(item);
    });
    return [...found];
  }

  private forCells(rect: Rect, fn: (key: string) => void): void {
    const x0 = Math.floor(rect.x / CELL);
    const y0 = Math.floor(rect.y / CELL);
    const x1 = Math.floor((rect.x + rect.w) / CELL);
    const y1 = Math.floor((rect.y + rect.h) / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(`${x},${y}`);
  }
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}
