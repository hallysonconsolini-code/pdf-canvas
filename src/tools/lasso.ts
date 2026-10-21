import { HANDLE_PX } from "../canvas/annotationRenderer";
import { pointInPolygon, samplePoints, transformAnnotation, union, type PointMap } from "../canvas/geometry";
import type { Annotation, Rect, Vec2 } from "../model/types";
import { placeOnPage } from "./place";
import { noGesture, type Tool, type ToolContext, type ToolGesture, type ToolPoint } from "./Tool";

/** Selection box padding drawn around the items, in screen pixels. */
const BOX_PAD_PX = 4;
/** Share of an item's sample points that must fall inside the lasso. */
const LASSO_COVERAGE = 0.5;

/**
 * Selection tool:
 * - click an annotation to select it (Shift adds/removes), then drag to move
 * - drag on empty space to draw a lasso
 * - drag a corner handle to resize, drag inside the box to move
 */
export const lassoTool: Tool = {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
    const items = selectedItems(ctx);
    if (items.length && !start.shift) {
      const box = union(items.map((a) => a.bbox));
      const corner = cornerAt(ctx, box, start);
      if (corner) return resizeGesture(ctx, items, box, corner);
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

function moveGesture(ctx: ToolContext, items: Annotation[], start: Vec2): ToolGesture {
  let moved: Annotation[] = [];
  return {
    move(points) {
      const p = points[points.length - 1];
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      moved = apply(items, (q) => ({ x: q.x + dx, y: q.y + dy }));
      show(ctx, moved);
    },
    end() {
      commit(ctx, items, moved);
    },
    cancel() {
      reset(ctx);
    },
  };
}

function resizeGesture(ctx: ToolContext, items: Annotation[], box: Rect, corner: Vec2): ToolGesture {
  // Scale around the opposite corner.
  const anchor = {
    x: corner.x === box.x ? box.x + box.w : box.x,
    y: corner.y === box.y ? box.y + box.h : box.y,
  };
  let moved: Annotation[] = [];
  return {
    move(points) {
      const p = points[points.length - 1];
      let sx = safeScale((p.x - anchor.x) / (corner.x - anchor.x || 1));
      let sy = safeScale((p.y - anchor.y) / (corner.y - anchor.y || 1));
      if (p.shift) {
        const s = Math.max(Math.abs(sx), Math.abs(sy));
        sx = Math.sign(sx) * s;
        sy = Math.sign(sy) * s;
      }
      moved = apply(items, (q) => ({ x: anchor.x + (q.x - anchor.x) * sx, y: anchor.y + (q.y - anchor.y) * sy }));
      show(ctx, moved);
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

function show(ctx: ToolContext, moved: Annotation[]): void {
  ctx.renderer.setPreview(moved);
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

/** Corner handle under the pointer, if any (handles are drawn in screen pixels). */
function cornerAt(ctx: ToolContext, box: Rect, p: Vec2): Vec2 | null {
  const pad = BOX_PAD_PX / ctx.camera.zoom;
  const reach = HANDLE_PX / ctx.camera.zoom;
  for (const c of [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ]) {
    const hx = c.x + (c.x === box.x ? -pad : pad);
    const hy = c.y + (c.y === box.y ? -pad : pad);
    if (Math.abs(p.x - hx) <= reach && Math.abs(p.y - hy) <= reach) return c;
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
