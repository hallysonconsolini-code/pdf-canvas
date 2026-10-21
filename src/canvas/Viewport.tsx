import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { PAGE_GAP, pageAtY } from "../pdf/layout";
import type { PdfDocument } from "../pdf/loader";
import { PageRenderer } from "../pdf/pageRenderer";
import { Camera } from "./camera";
import { attachNavigation } from "./input";

export interface ViewStatus {
  page: number;
  zoom: number;
}

export interface ViewportHandle {
  zoomBy(factor: number): void;
  setZoom(zoom: number): void;
  fitWidth(): void;
  goToPage(index: number): void;
  scrollBy(dx: number, dy: number): void;
}

interface Props {
  doc: PdfDocument;
  panMode: boolean;
  onStatus(status: ViewStatus): void;
  ref?: Ref<ViewportHandle>;
}

/** Widest a page gets when fitting to the window, in CSS pixels. */
const FIT_MAX_WIDTH = 960;
const FIT_PADDING = 48;

export function Viewport({ doc, panMode, onStatus, ref }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const panModeRef = useRef(panMode);
  const onStatusRef = useRef(onStatus);
  panModeRef.current = panMode;
  onStatusRef.current = onStatus;

  useImperativeHandle(ref, () => {
    const cam = () => cameraRef.current!;
    const pages = doc.layout.pages;
    return {
      zoomBy(factor) {
        const c = cam();
        c.zoomAt(c.width / 2, c.height / 2, factor);
      },
      setZoom(zoom) {
        const c = cam();
        c.zoomAt(c.width / 2, c.height / 2, zoom / c.zoom);
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
    };
  }, [doc]);

  useEffect(() => {
    const root = rootRef.current!;
    const pagesLayer = pagesRef.current!;
    const camera = new Camera();
    cameraRef.current = camera;
    const b = doc.layout.bounds;
    const spare = doc.layout.maxPageWidth;
    // Free space around the pages for scratch notes.
    camera.bounds = { x: b.x - spare, y: b.y - spare / 2, w: b.w + spare * 2, h: b.h + spare };

    const renderer = new PageRenderer(doc, camera, pagesLayer);
    let frame = 0;
    let zoomChanged = false;
    let lastPage = -1;
    let lastZoom = -1;

    const draw = () => {
      frame = 0;
      renderer.update(zoomChanged);
      zoomChanged = false;
      const page = pageAtY(doc.layout.pages, camera.y + camera.height / camera.zoom / 3);
      if (page !== lastPage || camera.zoom !== lastZoom) {
        lastPage = page;
        lastZoom = camera.zoom;
        onStatusRef.current({ page, zoom: camera.zoom });
      }
    };
    const unsubscribe = camera.onChange((z) => {
      zoomChanged ||= z;
      if (!frame) frame = requestAnimationFrame(draw);
    });

    // Keep fitting the first page until the user moves the view: the window
    // may still be settling to its final size right after opening.
    let untouched = true;
    let fitting = false;
    const fitInitial = () => {
      fitting = true;
      fitWidth(camera, doc, -PAGE_GAP);
      fitting = false;
    };
    const stopAutoFit = camera.onChange(() => {
      if (!fitting) untouched = false;
    });
    let sized = false;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Keep the horizontal centre in place when the window is resized.
      const shift = sized ? (camera.width - width) / 2 / camera.zoom : 0;
      fitting = true;
      camera.setSize(width, height);
      camera.set(camera.x + shift, camera.y);
      fitting = false;
      if (!sized || untouched) fitInitial();
      sized = true;
    });
    resize.observe(root);

    // Moving the window to a screen with another pixel density.
    let dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    const onDprChange = () => {
      dprQuery.removeEventListener("change", onDprChange);
      dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDprChange);
      renderer.invalidate();
    };
    dprQuery.addEventListener("change", onDprChange);

    const detach = attachNavigation(root, camera, () => panModeRef.current);

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      stopAutoFit();
      resize.disconnect();
      dprQuery.removeEventListener("change", onDprChange);
      detach();
      renderer.destroy();
      cameraRef.current = null;
    };
  }, [doc]);

  return (
    <div ref={rootRef} className={`viewport${panMode ? " tool-pan" : " tool-select"}`}>
      <div ref={pagesRef} className="pages-layer" />
    </div>
  );
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
