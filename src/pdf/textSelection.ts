/**
 * Keeps text selection on the PDF text layer stable while dragging.
 *
 * Text spans are absolutely positioned, so when the pointer crosses a gap
 * between them WebKit snaps the selection to the start of the layer and
 * selects everything above. Like PDF.js's own viewer (TextLayerBuilder), we
 * move an invisible "end of content" block next to the selection's moving
 * end so gaps resolve to the nearest text instead.
 */

const layers = new Map<HTMLElement, HTMLElement>();
let listening = false;
let prevRange: Range | null = null;

export function registerTextLayer(layer: HTMLElement): void {
  const end = document.createElement("div");
  end.className = "endOfContent";
  layer.append(end);
  layers.set(layer, end);
  layer.addEventListener("pointerdown", () => layer.classList.add("selecting"));
  ensureListeners();
}

export function unregisterTextLayer(layer: HTMLElement): void {
  layers.delete(layer);
}

function reset(layer: HTMLElement, end: HTMLElement): void {
  layer.append(end);
  end.style.width = "";
  end.style.height = "";
  layer.classList.remove("selecting");
}

function ensureListeners(): void {
  if (listening) return;
  listening = true;

  const resetAll = () => {
    for (const [layer, end] of layers) reset(layer, end);
    prevRange = null;
  };
  window.addEventListener("pointerup", resetAll);
  window.addEventListener("blur", resetAll);
  window.addEventListener("keyup", resetAll);

  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
      resetAll();
      return;
    }
    const active = new Set<HTMLElement>();
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      for (const layer of layers.keys()) {
        if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
      }
    }
    for (const [layer, end] of layers) {
      if (active.has(layer)) layer.classList.add("selecting");
      else reset(layer, end);
    }

    const range = selection.getRangeAt(0);
    const modifyStart =
      prevRange !== null &&
      (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
        range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
    let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
    if (anchor?.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
    const parent = anchor instanceof Element ? anchor.parentElement : null;
    const layer = parent?.closest<HTMLElement>(".textLayer") ?? null;
    const end = layer ? layers.get(layer) : undefined;
    if (layer && end && parent && anchor) {
      end.style.width = layer.style.width;
      end.style.height = layer.style.height;
      parent.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
    }
    prevRange = range.cloneRange();
  });
}
