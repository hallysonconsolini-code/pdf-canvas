import { BOX_PAD_PX, HANDLE_PX, HANDLES } from "../canvas/annotationRenderer";
import { pointInPolygon, samplePoints, transformAnnotation, union, type PointMap } from "../canvas/geometry";
import { newId } from "../model/document";
import type { Annotation, Rect, Vec2 } from "../model/types";
import { placeOnPage } from "./place";
import { noGesture, type Tool, type ToolContext, type ToolGesture, type ToolPoint } from "./Tool";

/** Share of an item's sample points that must fall inside the lasso. */
const LASSO_COVERAGE = 0.5;

/**
 * Selection tool (Excalidraw style):
 * - click an item to select it (Shift adds/removes), drag to move
 * - Alt + drag duplicates
 * - drag on empty space to draw a lasso
 * - drag a handle to resize (corners: both axes, edges: one axis)
 */
export const lassoTool: Tool = {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
    const items = selectedItems(ctx);
    if (items.length && !start.shift) {
      const box = union(items.map((a) => a.bbox));
      const handle = handleAt(ctx, box, start);
      if (handle) return resizeGesture(ctx, items, box, handle);
      if (insideBox(ctx, box, start)) return moveGesture(ctx, items, start);
    }

    const hit = ctx.renderer.hitTest(start.x, start.y, 4 / ctx.camera.zoom, true)[0];
    if (hit) {
      if (start.shift) {
        const ids = new Set(ctx.selection.values());
        if (ids.has(hit.id)) ids.delete(hit.id);
        else ids.add(hit.id);
        ctx.selection.set(ids);
        return noGesture;
      }
      ctx.selection.set([hit.id]);
      return moveGesture(ctx, [hit], start);
    }
    return lassoGesture(ctx, start);
  },
};

export function selectedItems(ctx: Pick<ToolContext, "selection" | "store">): Annotation[] {
  return ctx.selection.values().flatMap((id) => {
    const a = ctx.store.get(id);
    return a ? [a] : [];
  });
}

/** Copies with new ids, shifted by (dx, dy). */
export function duplicate(items: Annotation[], dx: number, dy: number): Annotation[] {
  return items.map((a) => ({
    ...transformAnnotation(a, (q) => ({ x: q.x + dx, y: q.y + dy })),
    id: newId(),
    createdAt: Date.now(),
  }));
}

function moveGesture(ctx: ToolContext, items: Annotation[], start: ToolPoint): ToolGesture {
  let moved: Annotation[] = [];
  // Alt + drag: originals stay, copies (with temporary ids) follow the pointer.
  const copy = start.alt;
  return {
    move(points) {
      const p = points[points.length - 1];
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      moved = apply(items, (q) => ({ x: q.x + dx, y: q.y + dy }));
      if (copy) moved = moved.map((a) => ({ ...a, id: `copy:${a.id}` }));
      ctx.renderer.setPreview(moved);
      ctx.renderer.setSelectionBox(union(moved.map((a) => a.bbox)));
    },
    end() {
      if (!copy) {
        commit(ctx, items, moved);
        return;
      }
      ctx.renderer.setPreview([]);
      if (!moved.length) return;
      const copies = moved.map((a) => placeOnPage(ctx, { ...a, id: newId(), createdAt: Date.now() }));
      ctx.store.add(copies);
      ctx.selection.set(copies.map((a) => a.id));
    },
    cancel() {
      reset(ctx);
    },
  };
}

function resizeGesture(ctx: ToolContext, items: Annotation[], box: Rect, handle: [number, number]): ToolGesture {
  const [fx, fy] = handle;
  // Scale around the opposite side; edge handles scale one axis only.
  const anchor = { x: box.x + box.w * (1 - fx), y: box.y + box.h * (1 - fy) };
  const corner = { x: box.x + box.w * fx, y: box.y + box.h * fy };
  const onlyText = items.every((a) => a.type === "text");
  let moved: Annotation[] = [];
  return {
    move(points) {
      const p = points[points.length - 1];
      let sx = fx === 0.5 ? 1 : safeScale((p.x - anchor.x) / (corner.x - anchor.x || 1));
      let sy = fy === 0.5 ? 1 : safeScale((p.y - anchor.y) / (corner.y - anchor.y || 1));
      // Text keeps its proportions, as in Excalidraw.
      if (p.shift || onlyText) {
        const s = fx === 0.5 ? Math.abs(sy) : fy === 0.5 ? Math.abs(sx) : Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx) * s;
        sy = Math.sign(sy) * s;
      }
      moved = apply(items, (q) => ({ x: anchor.x + (q.x - anchor.x) * sx, y: anchor.y + (q.y - anchor.y) * sy }));
      ctx.renderer.setPreview(moved);
      showBox(ctx, moved);
    },
    end() {
      commit(ctx, items, moved);
    },
    cancel() {
      reset(ctx);
    },
  };
}

function lassoGesture(ctx: ToolContext, start: ToolPoint): ToolGesture {
  const path: Vec2[] = [{ x: start.x, y: start.y }];
  return {
    move(points) {
      for (const p of points) path.push({ x: p.x, y: p.y });
      ctx.renderer.setLasso(path);
    },
    end() {
      ctx.renderer.setLasso(null);
      const area = union(path.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })));
      // A click on empty space clears the selection.
      if ((area.w + area.h) * ctx.camera.zoom < 4) {
        if (!start.shift) ctx.selection.clear();
        return;
      }
      const picked = ctx.renderer.query(area).filter((a) => {
        const samples = samplePoints(a);
        const inside = samples.filter((p) => pointInPolygon(p, path)).length;
        return inside > 0 && inside >= samples.length * LASSO_COVERAGE;
      });
      const ids = new Set(start.shift ? ctx.selection.values() : []);
      for (const a of picked) ids.add(a.id);
      ctx.selection.set(ids);
    },
    cancel() {
      ctx.renderer.setLasso(null);
    },
  };
}

function apply(items: Annotation[], map: PointMap): Annotation[] {
  return items.map((a) => transformAnnotation(a, map));
}

function showBox(ctx: ToolContext, moved: Annotation[]): void {
  ctx.renderer.setSelectionBox(union(moved.map((a) => a.bbox)));
}

function commit(ctx: ToolContext, items: Annotation[], moved: Annotation[]): void {
  ctx.renderer.setPreview([]);
  if (!moved.length) return;
  ctx.store.update(items, moved.map((a) => placeOnPage(ctx, a)));
  ctx.renderer.setSelectionBox(union(moved.map((a) => a.bbox)));
}

function reset(ctx: ToolContext): void {
  ctx.renderer.setPreview([]);
  const items = selectedItems(ctx);
  ctx.renderer.setSelectionBox(items.length ? union(items.map((a) => a.bbox)) : null);
}

/** Handle under the pointer, if any (handles are drawn in screen pixels). */
function handleAt(ctx: ToolContext, box: Rect, p: Vec2): [number, number] | null {
  const pad = BOX_PAD_PX / ctx.camera.zoom;
  const reach = HANDLE_PX / ctx.camera.zoom;
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.w + pad * 2;
  const h = box.h + pad * 2;
  for (const handle of HANDLES) {
    const hx = x + w * handle[0];
    const hy = y + h * handle[1];
    if (Math.abs(p.x - hx) <= reach && Math.abs(p.y - hy) <= reach) return handle;
  }
  return null;
}

function insideBox(ctx: ToolContext, box: Rect, p: Vec2): boolean {
  const pad = BOX_PAD_PX / ctx.camera.zoom;
  return p.x >= box.x - pad && p.x <= box.x + box.w + pad && p.y >= box.y - pad && p.y <= box.y + box.h + pad;
}

/** Keeps a scale factor away from zero so items never collapse. */
function safeScale(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.abs(s) < 0.02 ? Math.sign(s || 1) * 0.02 : s;
}
