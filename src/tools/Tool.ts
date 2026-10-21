import type { AnnotationRenderer } from "../canvas/annotationRenderer";
import type { Camera } from "../canvas/camera";
import type { NoteEditor } from "../canvas/noteEditor";
import type { AnnotationStore } from "../model/document";
import type { Selection } from "../model/selection";
import type { Annotation, ItemStyle } from "../model/types";
import type { DocumentLayout } from "../pdf/layout";
import type { HighlighterStyle } from "../ui/useItemStyle";

export interface ToolContext {
  camera: Camera;
  store: AnnotationStore;
  renderer: AnnotationRenderer;
  layout: DocumentLayout;
  selection: Selection;
  editor: NoteEditor;
  /** Style for new items. */
  style(): ItemStyle;
  highlighter(): HighlighterStyle;
  /** A shape or text was just created (the app may switch back to Selection). */
  created(item: Annotation): void;
}

/** World-space pointer sample. */
export interface ToolPoint {
  x: number;
  y: number;
  pressure: number;
  shift: boolean;
  alt: boolean;
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
