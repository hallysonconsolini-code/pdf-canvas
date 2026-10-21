import { withBBox } from "../canvas/geometry";
import { newId } from "../model/document";
import type { ShapeAnnotation, Vec2 } from "../model/types";
import { placeOnPage } from "./place";
import type { Tool, ToolContext, ToolGesture, ToolPoint } from "./Tool";

/** Arrow, rectangle and ellipse. Shift: square/circle, or 15° steps for arrows. */
export function shapeTool(type: ShapeAnnotation["type"]): Tool {
  return {
    begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
      const { color, width } = ctx.prefs(type);
      const from: Vec2 = { x: start.x, y: start.y };
      let shape: ShapeAnnotation | null = null;

      const build = (p: ToolPoint): ShapeAnnotation =>
        withBBox({
          id: newId(),
          createdAt: Date.now(),
          page: null,
          bbox: { x: 0, y: 0, w: 0, h: 0 },
          type,
          color,
          width,
          from: { ...from },
          to: p.shift ? constrain(type, from, p) : { x: p.x, y: p.y },
        });

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
          ctx.store.add([placeOnPage(ctx, shape)]);
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
  if (type === "arrow") {
    const step = Math.PI / 12;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    const len = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side };
}
