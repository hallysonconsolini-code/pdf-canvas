import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withBBox } from "../canvas/geometry";
import { Viewport, type ViewStatus, type ViewportHandle } from "../canvas/Viewport";
import type { Annotation, ItemStyle, ToolId } from "../model/types";
import type { SaveState } from "../persistence/autosave";
import type { Session } from "../session";
import { newTextAt } from "../tools/text";
import { PropertiesPanel } from "./PropertiesPanel";
import { StatusBar } from "./StatusBar";
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
  const live = useRef({ tool, locked });
  live.current = { tool, locked };

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
      if (isTyping(e.target)) return;
      const v = viewport.current;
      if (!v) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && (e.key === "=" || e.key === "+")) return run(e, () => v.zoomBy(1.25));
      if (mod && e.key === "-") return run(e, () => v.zoomBy(1 / 1.25));
      if (mod && e.key === "0") return run(e, () => v.fitWidth());
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

  return (
    <div className="document">
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
    </div>
  );
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
