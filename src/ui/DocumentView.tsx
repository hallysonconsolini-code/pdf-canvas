import { useCallback, useEffect, useRef, useState } from "react";
import { Viewport, type ViewStatus, type ViewportHandle } from "../canvas/Viewport";
import type { PdfDocument } from "../pdf/loader";
import { StatusBar } from "./StatusBar";
import { Toolbar, type Phase1Tool } from "./Toolbar";

interface Props {
  doc: PdfDocument;
}

export function DocumentView({ doc }: Props) {
  const viewport = useRef<ViewportHandle>(null);
  const [tool, setTool] = useState<Phase1Tool>("pan");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [status, setStatus] = useState<ViewStatus>({ page: 0, zoom: 1 });

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

      switch (e.key) {
        case " ":
          return run(e, () => setSpaceHeld(true));
        case "h":
        case "H":
          return run(e, () => setTool("pan"));
        case "v":
        case "V":
          return run(e, () => setTool("select"));
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

  return (
    <div className="document">
      <Viewport ref={viewport} doc={doc} panMode={tool === "pan" || spaceHeld} onStatus={onStatus} />
      <Toolbar tool={tool} onTool={setTool} />
      <StatusBar
        page={status.page}
        pageCount={doc.pages.length}
        zoom={status.zoom}
        onGoToPage={(i) => viewport.current?.goToPage(i)}
        onZoomBy={(f) => viewport.current?.zoomBy(f)}
        onFitWidth={() => viewport.current?.fitWidth()}
      />
    </div>
  );
}

function run(e: KeyboardEvent, action: () => void): void {
  e.preventDefault();
  action();
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}
