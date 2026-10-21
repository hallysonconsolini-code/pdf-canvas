import type { AnnotationRenderer } from "../canvas/annotationRenderer";
import type { Camera } from "../canvas/camera";
import type { AnnotationStore } from "../model/document";
import type { ColorId, ToolId, WidthId } from "../model/types";
import type { DocumentLayout } from "../pdf/layout";

export interface ToolPrefs {
  color: ColorId;
  width: WidthId;
}

export interface ToolContext {
  camera: Camera;
  store: AnnotationStore;
  renderer: AnnotationRenderer;
  layout: DocumentLayout;
  prefs(tool: ToolId): ToolPrefs;
}

/** World-space pointer sample. */
export interface ToolPoint {
  x: number;
  y: number;
  pressure: number;
  shift: boolean;
}

/** One pointer gesture (down -> moves -> up). */
export interface ToolGesture {
  move(points: ToolPoint[]): void;
  end(): void;
  cancel(): void;
}

export interface Tool {
  begin(ctx: ToolContext, start: ToolPoint): ToolGesture;
}
