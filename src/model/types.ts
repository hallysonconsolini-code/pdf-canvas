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
/** Stroke width: thin, bold, extra bold (Excalidraw's 1 / 2 / 4). */
export type WidthId = "thin" | "medium" | "thick";
export type FillStyle = "hachure" | "cross-hatch" | "solid";
export type StrokeStyle = "solid" | "dashed" | "dotted";
/** Hand-drawn wobble: 0 architect, 1 artist, 2 cartoonist. */
export type Sloppiness = 0 | 1 | 2;
export type Edges = "sharp" | "round";
export type FontFamily = "hand" | "normal" | "code";
export type FontSizeId = "s" | "m" | "l" | "xl";
export type TextAlign = "left" | "center" | "right";

interface AnnotationBase {
  id: string;
  createdAt: number;
  /** Page that owns the annotation for export; null = scratch area. */
  page: number | null;
  /** Bounding box in world coordinates (cached for hit-testing). */
  bbox: Rect;
  /** 0–100, default 100. */
  opacity?: number;
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

/** Free text, Excalidraw style: no box, grows with its content. Its size is
 *  measured from the text and kept in `bbox`. */
export interface TextNoteAnnotation extends AnnotationBase {
  type: "text";
  color: ColorId;
  content: string;
  /** World units (points). */
  fontSize: number;
  fontFamily: FontFamily;
  textAlign: TextAlign;
}

export interface ShapeAnnotation extends AnnotationBase {
  type: "arrow" | "line" | "rect" | "ellipse" | "diamond";
  color: ColorId;
  width: WidthId;
  /** Arrow/line: start. Others: one corner. */
  from: Vec2;
  /** Arrow/line: end. Others: opposite corner. */
  to: Vec2;
  /** Background color; null = transparent. */
  fill: ColorId | null;
  fillStyle: FillStyle;
  strokeStyle: StrokeStyle;
  roughness: Sloppiness;
  edges: Edges;
  /** Keeps the hand-drawn wobble identical every time it is drawn. */
  seed: number;
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
  | "line"
  | "rect"
  | "ellipse"
  | "diamond"
  | "lasso";

/** Style for new items, and what the properties panel edits (Excalidraw's
 *  "current item" style, shared by all tools). */
export interface ItemStyle {
  color: ColorId;
  fill: ColorId | null;
  fillStyle: FillStyle;
  width: WidthId;
  strokeStyle: StrokeStyle;
  roughness: Sloppiness;
  edges: Edges;
  opacity: number;
  fontFamily: FontFamily;
  fontSize: FontSizeId;
  textAlign: TextAlign;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

/** Sidecar file stored next to the PDF: <file>.pdf.annotations.json */
export interface SidecarFile {
  /** 2 since the hand-drawn redesign; version 1 files are migrated on load. */
  schemaVersion: 2;
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
  style: ItemStyle;
  highlighter: { color: ColorId; width: WidthId };
  toolbar: { dock: "top" | "left" | "floating"; x?: number; y?: number };
  showThumbnails: boolean;
}

/** Undo/redo entries are invertible commands, not snapshots. */
export type HistoryEntry =
  | { kind: "add"; items: Annotation[] }
  | { kind: "remove"; items: Annotation[] }
  | { kind: "update"; before: Annotation[]; after: Annotation[] };
