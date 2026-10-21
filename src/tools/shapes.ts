import { newSeed, withBBox } from "../canvas/geometry";
import { newId } from "../model/document";
import type { ShapeAnnotation, Vec2 } from "../model/types";
import { placeOnPage } from "./place";
import type { Tool, ToolContext, ToolGesture, ToolPoint } from "./Tool";

/**
 * Hand-drawn shapes. Shift: square/circle, or 15° steps for arrows and lines.
 * Alt: draw from the centre.
 */
export function shapeTool(type: ShapeAnnotation["type"]): Tool {
  return {
    begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
      const style = ctx.style();
      const seed = newSeed();
      const id = newId();
      let shape: ShapeAnnotation | null = null;

      const build = (p: ToolPoint): ShapeAnnotation => {
        let from: Vec2 = { x: start.x, y: start.y };
        let to: Vec2 = p.shift ? constrain(type, from, p) : { x: p.x, y: p.y };
        if (p.alt && type !== "arrow" && type !== "line") {
          from = { x: 2 * start.x - to.x, y: 2 * start.y - to.y };
        }
        return withBBox({
          id,
          createdAt: Date.now(),
          page: null,
          bbox: { x: 0, y: 0, w: 0, h: 0 },
          type,
          color: style.color,
          width: style.width,
          from,
          to,
          fill: style.fill,
          fillStyle: style.fillStyle,
          strokeStyle: style.strokeStyle,
          roughness: style.roughness,
          edges: style.edges,
          seed,
          ...(style.opacity !== 100 ? { opacity: style.opacity } : {}),
        });
      };

      return {
        move(points) {
          shape = build(points[points.length - 1]);
          ctx.renderer.setWet(shape);
        },
        end() {
          ctx.renderer.setWet(null);
          if (!shape) return;
          // Ignore clicks without a real drag (under 3 screen pixels).
          const size = Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) * ctx.camera.zoom;
          if (size < 3) return;
          const item = placeOnPage(ctx, shape);
          ctx.store.add([item]);
          ctx.selection.set([item.id]);
          ctx.created(item);
        },
        cancel() {
          ctx.renderer.setWet(null);
        },
      };
    },
  };
}

function constrain(type: ShapeAnnotation["type"], from: Vec2, p: Vec2): Vec2 {
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  if (type === "arrow" || type === "line") {
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
}
