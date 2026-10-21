import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { AnnotationStore } from "../model/document";
import { Selection } from "../model/selection";
import type { SidecarFile, ToolId } from "../model/types";
import { PAGE_GAP, pageAtY } from "../pdf/layout";
import type { PdfDocument } from "../pdf/loader";
import { PageRenderer } from "../pdf/pageRenderer";
import { attachTools } from "../tools/controller";
import { selectedItems } from "../tools/lasso";
import { attachTextHighlight } from "../tools/textHighlight";
import type { ToolPrefs } from "../tools/Tool";
import { AnnotationRenderer } from "./annotationRenderer";
import { Camera } from "./camera";
import { union } from "./geometry";
import { NoteEditor } from "./noteEditor";
import { attachNavigation } from "./input";

export interface ViewStatus {
  page: number;
  zoom: number;
}

export interface ViewportHandle {
  zoomBy(factor: number): void;
  fitWidth(): void;
  goToPage(index: number): void;
  scrollBy(dx: number, dy: number): void;
  /** Current reading position, for saving. */
  view(): SidecarFile["view"];
  /** Deletes the selected annotations. Returns false if nothing was selected. */
  deleteSelection(): boolean;
  /** Clears the selection. Returns false if nothing was selected. */
  clearSelection(): boolean;
}

interface Props {
  doc: PdfDocument;
  store: AnnotationStore;
  /** Active tool; "pan" while Space is held. */
  tool: ToolId;
  prefs(tool: ToolId): ToolPrefs;
  /** Reading position to restore on open. */
  initialView: SidecarFile["view"] | null;
  onStatus(status: ViewStatus): void;
  onViewChange(): void;
  onSelectionChange(count: number): void;
  ref?: Ref<ViewportHandle>;
}

/** Widest a page gets when fitting to the window, in CSS pixels. */
const FIT_MAX_WIDTH = 960;
const FIT_PADDING = 48;

export function Viewport({ doc, store, tool, prefs, initialView, onStatus, onViewChange, onSelectionChange, ref }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const selection = useRef(new Selection()).current;
  // Latest props for long-lived event handlers.
  const live = useRef({ tool, prefs, onStatus, onViewChange, onSelectionChange });
  live.current = { tool, prefs, onStatus, onViewChange, onSelectionChange };

  // Switching tools drops the selection and finishes any note being edited.
  useEffect(() => {
    if (tool !== "lasso") selection.clear();
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.classList.contains("note-editor")) active.blur();
  }, [tool, selection]);

  useImperativeHandle(ref, () => {
    const cam = () => cameraRef.current!;
    const pages = doc.layout.pages;
    return {
      zoomBy(factor) {
        const c = cam();
        c.zoomAt(c.width / 2, c.height / 2, factor);
      },
      fitWidth() {
        const c = cam();
        const top = pages[pageAtY(pages, c.y + c.height / c.zoom / 3)];
        fitWidth(c, doc, top.y - PAGE_GAP);
      },
      goToPage(index) {
        const c = cam();
        const box = pages[Math.max(0, Math.min(pages.length - 1, index))];
        c.set(c.x, box.y - PAGE_GAP / c.zoom);
      },
      scrollBy(dx, dy) {
        cam().panBy(dx, dy);
      },
      view() {
        const c = cam();
        return {
          camera: { x: round(c.x), y: round(c.y), zoom: Math.round(c.zoom * 1e4) / 1e4 },
          lastPage: currentPage(c, doc),
        };
      },
      deleteSelection() {
        const items = selectedItems({ selection, store });
        if (!items.length) return false;
        selection.clear();
        store.remove(items);
        return true;
      },
      clearSelection() {
        if (!selection.size) return false;
        selection.clear();
        return true;
      },
    };
  }, [doc, store, selection]);

  useEffect(() => {
    const root = rootRef.current!;
    const pagesLayer = pagesRef.current!;
    const camera = new Camera();
    cameraRef.current = camera;
    const b = doc.layout.bounds;
    const spare = doc.layout.maxPageWidth;
    // Free space around the pages for scratch notes.
    camera.bounds = { x: b.x - spare, y: b.y - spare / 2, w: b.w + spare * 2, h: b.h + spare };

    const pages = new PageRenderer(doc, camera, pagesLayer);
    const annotations = new AnnotationRenderer(root, camera, store);
    const editor = new NoteEditor(root, camera);

    // Selection box follows the selected items (and drops deleted ones).
    const syncSelection = () => {
      const items = selectedItems({ selection, store });
      if (items.length !== selection.size) selection.set(items.map((a) => a.id));
      annotations.setSelectionBox(items.length ? union(items.map((a) => a.bbox)) : null);
      live.current.onSelectionChange(items.length);
    };
    const stopSelection = selection.subscribe(syncSelection);
    const stopStoreSync = store.subscribe(syncSelection);
    let frame = 0;
    let zoomChanged = false;
    let lastPage = -1;
    let lastZoom = -1;

    const draw = () => {
      frame = 0;
      pages.update(zoomChanged);
      annotations.redraw();
      editor.position();
      zoomChanged = false;
      const page = currentPage(camera, doc);
      if (page !== lastPage || camera.zoom !== lastZoom) {
        lastPage = page;
        lastZoom = camera.zoom;
        live.current.onStatus({ page, zoom: camera.zoom });
      }
    };
    const unsubscribe = camera.onChange((z) => {
      zoomChanged ||= z;
      if (!frame) frame = requestAnimationFrame(draw);
      live.current.onViewChange();
    });

    // Until the user moves the view, keep the initial framing: the window
    // may still be settling to its final size right after opening.
    let untouched = true;
    let programmatic = false;
    const frameInitial = () => {
      programmatic = true;
      const c = initialView?.camera;
      if (c) camera.set(c.x, c.y, c.zoom);
      else fitWidth(camera, doc, -PAGE_GAP);
      programmatic = false;
    };
    const stopAutoFit = camera.onChange(() => {
      if (!programmatic) untouched = false;
    });
    let sized = false;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Keep the horizontal centre in place when the window is resized.
      const shift = sized ? (camera.width - width) / 2 / camera.zoom : 0;
      programmatic = true;
      camera.setSize(width, height);
      camera.set(camera.x + shift, camera.y);
      programmatic = false;
      annotations.resize();
      if (!sized || untouched) frameInitial();
      sized = true;
    });
    resize.observe(root);

    // Moving the window to a screen with another pixel density.
    let dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    const onDprChange = () => {
      dprQuery.removeEventListener("change", onDprChange);
      dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
      pages.invalidate();
      annotations.resize();
    };
    dprQuery.addEventListener("change", onDprChange);

    const panning = () => live.current.tool === "pan";
    const detachNav = attachNavigation(root, camera, panning);
    const toolContext = {
      camera,
      store,
      renderer: annotations,
      layout: doc.layout,
      selection,
      editor,
      prefs: (t: ToolId) => live.current.prefs(t),
    };
    const detachTools = attachTools(root, toolContext, () => (panning() ? null : live.current.tool));
    const detachTextHighlight = attachTextHighlight(root, toolContext, () => live.current.tool === "text-highlight");

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      stopAutoFit();
      resize.disconnect();
      dprQuery.removeEventListener("change", onDprChange);
      detachNav();
      detachTools();
      detachTextHighlight();
      editor.commit();
      stopSelection();
      stopStoreSync();
      annotations.destroy();
      pages.destroy();
      cameraRef.current = null;
    };
    // initialView is only read when the document opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, store, selection]);

  return (
    <div ref={rootRef} className={`viewport tool-${tool}`}>
      <div ref={pagesRef} className="pages-layer" />
    </div>
  );
}

function currentPage(camera: Camera, doc: PdfDocument): number {
  return pageAtY(doc.layout.pages, camera.y + camera.height / camera.zoom / 3);
}

function fitWidth(camera: Camera, doc: PdfDocument, topY: number): void {
  const zoom = Math.min(
    (camera.width - FIT_PADDING * 2) / doc.layout.maxPageWidth,
    FIT_MAX_WIDTH / doc.layout.maxPageWidth,
  );
  // Set zoom first so bounds clamping uses the new scale.
  camera.set(camera.x, camera.y, zoom);
  camera.set(-camera.width / 2 / camera.zoom, topY);
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
