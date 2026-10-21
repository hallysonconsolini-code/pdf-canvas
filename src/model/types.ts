/**
 * Annotation data model.
 *
 * All positions are world coordinates: PDF points (1/72 in) at zoom 1.
 * The page column is centred on x = 0 and page 1 starts at y = 0.
 * Anything outside a page box is a free "scratch" area.
 */

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type ColorId = "black" | "red" | "blue" | "green" | "yellow" | "pink";
export type WidthId = "thin" | "medium" | "thick";

interface AnnotationBase {
  id: string;
  createdAt: number;
  /** Page that owns the annotation for export; null = scratch area. */
  page: number | null;
  /** Bounding box in world coordinates (cached for hit-testing). */
  bbox: Rect;
}

export interface StrokeAnnotation extends AnnotationBase {
  type: "pen" | "highlighter";
  color: ColorId;
  width: WidthId;
  /** Flat [x, y, pressure] triples: smaller JSON and faster parsing. */
  points: number[];
  /** Highlighter drawn with Shift held. */
  straight?: boolean;
}

export interface TextHighlightAnnotation extends AnnotationBase {
  type: "text-highlight";
  color: ColorId;
  page: number;
  /** One rectangle per highlighted text line. */
  rects: Rect[];
  text: string;
}

export interface TextNoteAnnotation extends AnnotationBase {
  type: "text";
  color: ColorId;
  content: string;
  fontSize: number;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: "arrow" | "rect" | "ellipse";
  color: ColorId;
  width: WidthId;
  /** Arrow: tail. Rect/ellipse: one corner. */
  from: Vec2;
  /** Arrow: head. Rect/ellipse: opposite corner. */
  to: Vec2;
}

export type Annotation =
  | StrokeAnnotation
  | TextHighlightAnnotation
  | TextNoteAnnotation
  | ShapeAnnotation;

export type ToolId =
  | "pan"
  | "select"
  | "pen"
  | "highlighter"
  | "text-highlight"
  | "eraser"
  | "text"
  | "arrow"
  | "rect"
  | "ellipse"
  | "lasso";

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Sidecar file stored next to the PDF: <file>.pdf.annotations.json */
export interface SidecarFile {
  schemaVersion: 1;
  pdf: {
    fileName: string;
    /** PDF.js fingerprint, used to detect a different PDF with the same name. */
    fingerprint: string;
    pageCount: number;
  };
  view: {
    camera: CameraState;
    lastPage: number;
  };
  annotations: Annotation[];
  updatedAt: number;
}

/** App preferences, stored in the app data folder. */
export interface AppSettings {
  recents: { path: string; fileName: string; openedAt: number }[];
  toolPrefs: Partial<Record<ToolId, { color: ColorId; width: WidthId }>>;
  toolbar: { dock: "top" | "left" | "floating"; x?: number; y?: number };
  showThumbnails: boolean;
}

/** Undo/redo entries are invertible commands, not snapshots. */
export type HistoryEntry =
  | { kind: "add"; items: Annotation[] }
  | { kind: "remove"; items: Annotation[] }
  | { kind: "update"; before: Annotation[]; after: Annotation[] };
