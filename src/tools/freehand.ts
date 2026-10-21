import { strokeBBox, strokeSize } from "../canvas/strokes";
import { newId } from "../model/document";
import type { StrokeAnnotation } from "../model/types";
import { pageForRect } from "../pdf/layout";
import type { Tool, ToolContext, ToolGesture, ToolPoint } from "./Tool";

/** Pen and highlighter: smoothed free strokes. Highlighter + Shift = straight line. */
export function freehandTool(type: "pen" | "highlighter"): Tool {
  return {
    begin(ctx: ToolContext, start: ToolPoint): ToolGesture {
      const { color, width } = ctx.prefs(type);
      const points: number[] = [round(start.x), round(start.y), round(start.pressure)];
      // Live copy shown on the wet layer while drawing.
      const stroke: StrokeAnnotation = {
        id: "wet",
        createdAt: 0,
        page: null,
        bbox: { x: 0, y: 0, w: 0, h: 0 },
        type,
        color,
        width,
        points,
      };
      let straight = false;
      // Ignore jitter smaller than a quarter of a screen pixel.
      const minStep = () => 0.25 / ctx.camera.zoom;
      ctx.renderer.setWet(stroke);

      return {
        move(samples) {
          const last = samples[samples.length - 1];
          straight = type === "highlighter" && last.shift;
          if (straight) {
            stroke.points = [points[0], points[1], points[2], round(last.x), round(last.y), round(last.pressure)];
          } else {
            for (const s of samples) {
              const n = points.length;
              if (Math.hypot(s.x - points[n - 3], s.y - points[n - 2]) < minStep()) continue;
              points.push(round(s.x), round(s.y), round(s.pressure));
            }
            stroke.points = points;
          }
          ctx.renderer.setWet(stroke);
        },
        end() {
          ctx.renderer.setWet(null);
          const bbox = strokeBBox(stroke.points, strokeSize(stroke));
          const annotation: StrokeAnnotation = {
            id: newId(),
            createdAt: Date.now(),
            type,
            color,
            width,
            points: stroke.points,
            page: pageForRect(ctx.layout.pages, bbox),
            bbox,
            ...(straight ? { straight: true } : {}),
          };
          ctx.store.add([annotation]);
        },
        cancel() {
          ctx.renderer.setWet(null);
        },
      };
    },
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
