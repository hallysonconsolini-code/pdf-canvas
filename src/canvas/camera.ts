import type { CameraState, Rect } from "../model/types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

type Listener = (zoomChanged: boolean) => void;

/**
 * World <-> screen mapping. (x, y) is the world point shown at the top-left
 * corner of the viewport: screen = (world - camera) * zoom.
 */
export class Camera implements CameraState {
  x = 0;
  y = 0;
  zoom = 1;
  /** Viewport size in CSS pixels. */
  width = 1;
  height = 1;
  /** Limits where the view centre may go (world coordinates). */
  bounds: Rect | null = null;

  private listeners = new Set<Listener>();

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(x: number, y: number, zoom = this.zoom): void {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    let nx = x;
    let ny = y;
    if (this.bounds) {
      const halfW = this.width / z / 2;
      const halfH = this.height / z / 2;
      const b = this.bounds;
      nx = clamp(nx + halfW, b.x, b.x + b.w) - halfW;
      ny = clamp(ny + halfH, b.y, b.y + b.h) - halfH;
    }
    const zoomChanged = z !== this.zoom;
    if (!zoomChanged && nx === this.x && ny === this.y) return;
    this.x = nx;
    this.y = ny;
    this.zoom = z;
    for (const fn of this.listeners) fn(zoomChanged);
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.set(this.x, this.y, this.zoom);
    for (const fn of this.listeners) fn(false);
  }

  /** Moves the view by a screen-space delta. */
  panBy(dx: number, dy: number): void {
    this.set(this.x + dx / this.zoom, this.y + dy / this.zoom);
  }

  /** Zooms keeping the world point under (sx, sy) fixed on screen. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const wx = this.x + sx / this.zoom;
    const wy = this.y + sy / this.zoom;
    const z = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.set(wx - sx / z, wy - sy / z, z);
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  /** Visible world rectangle. */
  visibleRect(): Rect {
    return { x: this.x, y: this.y, w: this.width / this.zoom, h: this.height / this.zoom };
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
