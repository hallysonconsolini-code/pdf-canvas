import type { ToolId } from "../model/types";
import { eraserTool } from "./eraser";
import { freehandTool } from "./freehand";
import { lassoTool } from "./lasso";
import { shapeTool } from "./shapes";
import { editNote, textTool } from "./text";
import type { Tool, ToolContext, ToolGesture, ToolPoint } from "./Tool";

const TOOLS: Partial<Record<ToolId, Tool>> = {
  pen: freehandTool("pen"),
  highlighter: freehandTool("highlighter"),
  eraser: eraserTool,
  text: textTool,
  arrow: shapeTool("arrow"),
  rect: shapeTool("rect"),
  ellipse: shapeTool("ellipse"),
  lasso: lassoTool,
};

/**
 * Routes pointer input to the active annotation tool. Pressure comes from
 * pens (Pointer Events); mouse and trackpad fall back to simulated pressure.
 * A pen's eraser end always erases.
 */
export function attachTools(el: HTMLElement, ctx: ToolContext, activeTool: () => ToolId | null): () => void {
  let gesture: ToolGesture | null = null;
  let pointerId = -1;

  const toPoint = (e: PointerEvent): ToolPoint => {
    const r = el.getBoundingClientRect();
    const w = ctx.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const pressure = e.pointerType === "pen" ? Math.max(0.05, e.pressure) : 0.5;
    return { x: w.x, y: w.y, pressure, shift: e.shiftKey };
  };

  const onDown = (e: PointerEvent) => {
    if (gesture || fromEditor(e)) return;
    const penEraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
    if (e.button !== 0 && !penEraser) return;
    const toolId = penEraser ? "eraser" : activeTool();
    const tool = toolId ? TOOLS[toolId] : undefined;
    if (!tool) return;
    e.preventDefault();
    capture(el, e.pointerId);
    pointerId = e.pointerId;
    gesture = tool.begin(ctx, toPoint(e));
  };

  const onMove = (e: PointerEvent) => {
    if (!gesture || e.pointerId !== pointerId) return;
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    gesture.move((events.length ? events : [e]).map(toPoint));
  };

  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (!gesture || e.pointerId !== pointerId) return;
    const g = gesture;
    gesture = null;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (cancelled) g.cancel();
    else g.end();
  };
  const onUp = (e: PointerEvent) => finish(e, false);
  const onCancel = (e: PointerEvent) => finish(e, true);

  // Double-click a note with the selection tool to edit it.
  const onDoubleClick = (e: MouseEvent) => {
    if (activeTool() !== "lasso" || fromEditor(e)) return;
    const r = el.getBoundingClientRect();
    const p = ctx.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const note = ctx.renderer.hitTest(p.x, p.y, 2 / ctx.camera.zoom, true).find((a) => a.type === "text");
    if (note && note.type === "text") editNote(ctx, note, false);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("dblclick", onDoubleClick);
  return () => {
    gesture?.cancel();
    el.removeEventListener("dblclick", onDoubleClick);
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
  };
}

/** Pointer capture can throw for pointers the browser no longer tracks. */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Keep going without capture.
  }
}

function fromEditor(e: Event): boolean {
  return e.target instanceof Element && e.target.closest(".note-editor") !== null;
}
