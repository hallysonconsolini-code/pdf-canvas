import { useCallback, useEffect, useRef, useState } from "react";
import { Viewport, type ViewStatus, type ViewportHandle } from "../canvas/Viewport";
import type { ToolId } from "../model/types";
import type { SaveState } from "../persistence/autosave";
import type { Session } from "../session";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";
import { useToolPrefs } from "./useToolPrefs";

interface Props {
  session: Session;
  save: SaveState;
}

const TOOL_KEYS: Record<string, ToolId> = {
  h: "pan",
  v: "lasso",
  s: "select",
  p: "pen",
  m: "highlighter",
  e: "eraser",
  t: "text",
  a: "arrow",
  r: "rect",
  o: "ellipse",
};

export function DocumentView({ session, save }: Props) {
  const { doc, store } = session;
  const viewport = useRef<ViewportHandle>(null);
  const [tool, setTool] = useState<ToolId>("pan");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [status, setStatus] = useState<ViewStatus>({ page: 0, zoom: 1 });
  const prefs = useToolPrefs();

  // Autosave reads the reading position from the viewport.
  useEffect(() => {
    session.readView = () => viewport.current?.view() ?? session.initialView ?? fallbackView();
  }, [session]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const v = viewport.current;
      if (!v) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && (e.key === "=" || e.key === "+")) return run(e, () => v.zoomBy(1.25));
      if (mod && e.key === "-") return run(e, () => v.zoomBy(1 / 1.25));
      if (mod && e.key === "0") return run(e, () => v.fitWidth());
      if (mod || e.altKey) return;

      if (e.shiftKey && e.key.toLowerCase() === "m") return run(e, () => setTool("text-highlight"));
      const toolKey = TOOL_KEYS[e.key.toLowerCase()];
      if (toolKey && !e.shiftKey) return run(e, () => setTool(toolKey));

      switch (e.key) {
        case " ":
          return run(e, () => setSpaceHeld(true));
        case "Backspace":
        case "Delete":
          return run(e, () => v.deleteSelection());
        case "Escape":
          return run(e, () => {
            if (!v.clearSelection()) setTool("pan");
          });
        case "ArrowDown":
          return run(e, () => v.scrollBy(0, 64));
        case "ArrowUp":
          return run(e, () => v.scrollBy(0, -64));
        case "ArrowRight":
          return run(e, () => v.scrollBy(64, 0));
        case "ArrowLeft":
          return run(e, () => v.scrollBy(-64, 0));
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
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [doc]);

  const onStatus = useCallback((s: ViewStatus) => setStatus(s), []);
  const onViewChange = useCallback(() => session.autosave.viewChanged(), [session]);

  return (
    <div className="document">
      <Viewport
        ref={viewport}
        doc={doc}
        store={store}
        tool={spaceHeld ? "pan" : tool}
        prefs={prefs.get}
        initialView={session.initialView}
        onStatus={onStatus}
        onViewChange={onViewChange}
        onSelectionChange={noop}
      />
      <Toolbar tool={tool} onTool={setTool} prefs={prefs.get(tool)} onPrefs={(p) => prefs.set(tool, p)} />
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

function noop() {}

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
