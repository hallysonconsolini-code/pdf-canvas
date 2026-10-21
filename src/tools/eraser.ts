import type { Annotation } from "../model/types";
import type { Tool, ToolContext, ToolGesture, ToolPoint } from "./Tool";

/** Eraser hit radius in screen pixels. */
const RADIUS_PX = 8;

/** Removes whole annotations it touches. One drag = one undo step. */
export const eraserTool: Tool = {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
    const erased = new Map<string, Annotation>();
    let prev = start;

    const touch = (p: ToolPoint) => {
      const r = RADIUS_PX / ctx.camera.zoom;
      // Sample along fast moves so thin strokes are not skipped.
      const steps = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / r));
      let changed = false;
      for (let i = 1; i <= steps; i++) {
        const x = prev.x + ((p.x - prev.x) * i) / steps;
        const y = prev.y + ((p.y - prev.y) * i) / steps;
        for (const a of ctx.renderer.hitTest(x, y, r)) {
          if (!erased.has(a.id)) {
            erased.set(a.id, a);
            changed = true;
          }
        }
      }
      prev = p;
      if (changed) ctx.renderer.setPreview([], erased.keys());
    };

    touch(start);
    return {
      move(points) {
        for (const p of points) touch(p);
      },
      end() {
        ctx.store.remove([...erased.values()]);
        ctx.renderer.setPreview([]);
      },
      cancel() {
        ctx.renderer.setPreview([]);
      },
    };
  },
};
