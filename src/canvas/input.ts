import { clamp, type Camera } from "./camera";

interface GestureEventLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/**
 * Trackpad and mouse navigation:
 * - two-finger scroll pans, pinch zooms (WebKit gesture events or ctrl+wheel)
 * - Cmd + scroll zooms
 * - drag pans when the hand tool is active, middle button always pans
 */
export function attachNavigation(
  el: HTMLElement,
  camera: Camera,
  isPanMode: () => boolean,
): () => void {
  let gestureActive = false;
  let lastScale = 1;
  let drag: { id: number; x: number; y: number } | null = null;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? camera.height : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // Pinch arrives as gesture events in WebKit; avoid zooming twice.
      if (gestureActive) return;
      const p = local(e);
      const speed = e.ctrlKey ? 0.01 : 0.004;
      camera.zoomAt(p.x, p.y, Math.exp(-clamp(dy, -80, 80) * speed));
      return;
    }
    if (e.shiftKey && dx === 0) camera.panBy(dy, 0);
    else camera.panBy(dx, dy);
  };

  const onGestureStart = (e: Event) => {
    e.preventDefault();
    gestureActive = true;
    lastScale = 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as GestureEventLike;
    if (!g.scale) return;
    const p = local(g);
    camera.zoomAt(p.x, p.y, g.scale / lastScale);
    lastScale = g.scale;
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    gestureActive = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    const pan = e.button === 1 || (e.button === 0 && isPanMode());
    if (!pan) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.classList.add("is-panning");
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    camera.panBy(drag.x - e.clientX, drag.y - e.clientY);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove("is-panning");
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("gesturestart", onGestureStart);
  el.addEventListener("gesturechange", onGestureChange);
  el.addEventListener("gestureend", onGestureEnd);
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);
  return () => {
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("gesturestart", onGestureStart);
    el.removeEventListener("gesturechange", onGestureChange);
    el.removeEventListener("gestureend", onGestureEnd);
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
  };
}
