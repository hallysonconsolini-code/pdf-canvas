import type { AnnotationRenderer } from "../canvas/annotationRenderer";
import type { NoteEditor } from "../canvas/noteEditor";
import type { Camera } from "../canvas/camera";
import type { AnnotationStore } from "../model/document";
import type { Selection } from "../model/selection";
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
  selection: Selection;
  editor: NoteEditor;
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

/** Gesture that does nothing (e.g. a click fully handled on pointer down). */
export const noGesture: ToolGesture = { move() {}, end() {}, cancel() {} };
