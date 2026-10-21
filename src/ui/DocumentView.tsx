import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withBBox } from "../canvas/geometry";
import { Viewport, type ViewStatus, type ViewportHandle } from "../canvas/Viewport";
import type { Annotation, ItemStyle, ToolId } from "../model/types";
import type { SaveState } from "../persistence/autosave";
import { pickSavePath, readPdfBytes, showError, writeFileBytes, type MenuAction } from "../platform/tauri";
import type { Session } from "../session";
import { newTextAt } from "../tools/text";
import { ExportDialog } from "./ExportDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { StatusBar } from "./StatusBar";
import { Thumbnails } from "./Thumbnails";
import { TOOL_GROUPS, Toolbar } from "./Toolbar";
import { useItemStyle } from "./useItemStyle";

interface Props {
  session: Session;
  save: SaveState;
}

/** Letter and digit shortcuts, taken from the toolbar definition. */
const TOOL_KEYS: Record<string, ToolId> = Object.fromEntries(
  TOOL_GROUPS.flat().flatMap((t) => [[t.key.toLowerCase(), t.id], ...(t.digit ? [[t.digit, t.id]] : [])]),
);

/** Tools that stay active after use; others return to Selection (Excalidraw). */
const STICKY_TOOLS: ToolId[] = ["pen", "highlighter", "text-highlight", "eraser", "pan", "select", "lasso"];

const CLIPBOARD_TYPE = "application/x-pdf-canvas";
const CLIPBOARD_PREFIX = "pdf-canvas:";

export function DocumentView({ session, save }: Props) {
  const { doc, store } = session;
  const viewport = useRef<ViewportHandle>(null);
  const [tool, setTool] = useState<ToolId>("lasso");
  const [locked, setLocked] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [status, setStatus] = useState<ViewStatus>({ page: 0, zoom: 1 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [storeVersion, setStoreVersion] = useState(0);
  const { style, highlighter, setStyle, setHighlighter } = useItemStyle();
  const [showThumbs, setShowThumbs] = useState(() => readFlag(THUMBS_KEY));
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const live = useRef({ tool, locked, exportOpen });
  live.current = { tool, locked, exportOpen };

  const toggleThumbs = useCallback(() => {
    setShowThumbs((v) => {
      writeFlag(THUMBS_KEY, !v);
      return !v;
    });
  }, []);

  // Commands from the native menu (zoom, thumbnails, export).
  useEffect(() => {
    const onMenu = (e: Event) => {
      const action = (e as CustomEvent<MenuAction>).detail;
      const v = viewport.current;
      if (action === "zoom-in") v?.zoomBy(1.25);
      else if (action === "zoom-out") v?.zoomBy(1 / 1.25);
      else if (action === "fit-width") v?.fitWidth();
      else if (action === "thumbnails") toggleThumbs();
      else if (action === "export") setExportOpen(true);
    };
    window.addEventListener("pdf-canvas:menu", onMenu);
    return () => window.removeEventListener("pdf-canvas:menu", onMenu);
  }, [toggleThumbs]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runExport = async (includeScratch: boolean) => {
    const base = doc.path.replace(/\.pdf$/i, "");
    const target = await pickSavePath(`${base} (anotado).pdf`);
    if (!target) return;
    setExporting(true);
    try {
      // pdf-lib is only loaded when exporting.
      const { exportAnnotatedPdf } = await import("../export/exportPdf");
      const source = await readPdfBytes(doc.path);
      const bytes = await exportAnnotatedPdf(doc, source, store.all(), { includeScratch });
      await writeFileBytes(target, bytes);
      setExportOpen(false);
      setToast(`PDF exportado: ${target.split("/").pop()}`);
    } catch (err) {
      const text = String((err as Error)?.message ?? err);
      showError(
        /encrypt/i.test(text)
          ? "Este PDF é protegido e não pode ser modificado, então não dá para exportar com anotações."
          : `Não foi possível exportar o PDF.\n\n${text}`,
      );
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => store.subscribe(() => setStoreVersion((v) => v + 1)), [store]);

  const selected = useMemo(
    () => selectedIds.flatMap((id) => store.get(id) ?? []),
    // storeVersion: re-read items after edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, store, storeVersion],
  );

  // Autosave reads the reading position from the viewport.
  useEffect(() => {
    session.readView = () => viewport.current?.view() ?? session.initialView ?? fallbackView();
  }, [session]);

  // Select All switches to Selection so the result is visible.
  useEffect(() => {
    const toLasso = () => setTool("lasso");
    window.addEventListener("pdf-canvas:select-all", toLasso);
    return () => window.removeEventListener("pdf-canvas:select-all", toLasso);
  }, []);

  const onCreated = useCallback(() => {
    const { tool: current, locked: isLocked } = live.current;
    if (!isLocked && !STICKY_TOOLS.includes(current)) setTool("lasso");
  }, []);

  const onStyle = useCallback(
    (patch: Partial<ItemStyle>) => {
      setStyle(patch);
      viewport.current?.styleSelection(patch);
    },
    [setStyle],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || live.current.exportOpen) return;
      const v = viewport.current;
      if (!v) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "d") return run(e, () => v.duplicateSelection());
      if (mod || e.altKey) return;

      if (e.shiftKey && e.key.toLowerCase() === "m") return run(e, () => setTool("text-highlight"));
      if (e.key.toLowerCase() === "q") return run(e, () => setLocked((l) => !l));
      const toolKey = TOOL_KEYS[e.key.toLowerCase()];
      if (toolKey && !e.shiftKey) return run(e, () => setTool(toolKey));

      // Arrows nudge the selection (Shift: further), or move the view.
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = {
        ArrowDown: [0, 1],
        ArrowUp: [0, -1],
        ArrowRight: [1, 0],
        ArrowLeft: [-1, 0],
      };
      const arrow = arrows[e.key];
      if (arrow) {
        return run(e, () => {
          if (!v.nudge(arrow[0] * step, arrow[1] * step)) v.scrollBy(arrow[0] * 64, arrow[1] * 64);
        });
      }

      switch (e.key) {
        case " ":
          return run(e, () => setSpaceHeld(true));
        case "Backspace":
        case "Delete":
          return run(e, () => v.deleteSelection());
        case "Escape":
          return run(e, () => {
            if (!v.clearSelection()) setTool("lasso");
          });
        case "PageDown":
          return run(e, () => v.scrollBy(0, window.innerHeight * 0.85));
        case "PageUp":
          return run(e, () => v.scrollBy(0, -window.innerHeight * 0.85));
        case "Home":
          return run(e, () => v.goToPage(0));
        case "End":
          return run(e, () => v.goToPage(doc.pages.length - 1));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);

    // Copy / cut / paste annotations (the native Edit menu fires these).
    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (isTyping(e.target) || hasTextSelection()) return;
      const items = viewport.current?.selected() ?? [];
      if (!items.length || !e.clipboardData) return;
      e.preventDefault();
      const json = JSON.stringify(items);
      e.clipboardData.setData(CLIPBOARD_TYPE, json);
      e.clipboardData.setData("text/plain", CLIPBOARD_PREFIX + json);
      if (cut) viewport.current?.deleteSelection();
    };
    const onCut = (e: ClipboardEvent) => onCopy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !e.clipboardData) return;
      const v = viewport.current;
      if (!v) return;
      const custom = e.clipboardData.getData(CLIPBOARD_TYPE);
      const text = e.clipboardData.getData("text/plain");
      const json = custom || (text.startsWith(CLIPBOARD_PREFIX) ? text.slice(CLIPBOARD_PREFIX.length) : "");
      e.preventDefault();
      if (json) {
        try {
          v.paste(JSON.parse(json) as Annotation[]);
        } catch {
          // Not our data.
        }
      } else if (text.trim()) {
        // Plain text becomes a text item, as in Excalidraw.
        const view = v.view().camera;
        const item = newTextAt(sessionContext(style), view.x, view.y);
        v.paste([withBBox({ ...item, content: text.replace(/\s+$/, "") })]);
      }
    };

    const onSelectAll = () => viewport.current?.selectAll();
    window.addEventListener("pdf-canvas:select-all", onSelectAll);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("pdf-canvas:select-all", onSelectAll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [doc, style]);

  const onStatus = useCallback((s: ViewStatus) => setStatus(s), []);
  const onViewChange = useCallback(() => session.autosave.viewChanged(), [session]);

  const scratchCount = exportOpen ? store.all().filter((a) => a.page === null).length : 0;

  return (
    <div className={`document${showThumbs ? " with-thumbnails" : ""}`}>
      {showThumbs && <Thumbnails doc={doc} current={status.page} onGoTo={(i) => viewport.current?.goToPage(i)} />}
      <Viewport
        ref={viewport}
        doc={doc}
        store={store}
        tool={spaceHeld ? "pan" : tool}
        style={style}
        highlighter={highlighter}
        initialView={session.initialView}
        onStatus={onStatus}
        onViewChange={onViewChange}
        onSelectionChange={setSelectedIds}
        onCreated={onCreated}
      />
      <Toolbar tool={tool} onTool={setTool} locked={locked} onLock={() => setLocked((l) => !l)} />
      <PropertiesPanel
        tool={tool}
        selected={selected}
        style={style}
        highlighter={highlighter}
        onStyle={onStyle}
        onHighlighter={setHighlighter}
        onTool={setTool}
        onDuplicate={() => viewport.current?.duplicateSelection()}
        onDelete={() => viewport.current?.deleteSelection()}
      />
      <StatusBar
        page={status.page}
        pageCount={doc.pages.length}
        zoom={status.zoom}
        save={save}
        onGoToPage={(i) => viewport.current?.goToPage(i)}
        onZoomBy={(f) => viewport.current?.zoomBy(f)}
        onFitWidth={() => viewport.current?.fitWidth()}
      />
      {exportOpen && (
        <ExportDialog
          onPage={store.size - scratchCount}
          scratch={scratchCount}
          busy={exporting}
          onExport={runExport}
          onCancel={() => setExportOpen(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

const THUMBS_KEY = "pdf-canvas.showThumbnails";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Not critical.
  }
}

/** Minimal context for building a text item outside a tool gesture. */
function sessionContext(style: ItemStyle) {
  return { style: () => style } as Parameters<typeof newTextAt>[0];
}

function hasTextSelection(): boolean {
  const s = window.getSelection();
  return !!s && !s.isCollapsed;
}

function fallbackView() {
  return { camera: { x: 0, y: 0, zoom: 1 }, lastPage: 0 };
}

function run(e: KeyboardEvent, action: () => void): void {
  e.preventDefault();
  action();
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
