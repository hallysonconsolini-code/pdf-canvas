import { useCallback, useState } from "react";
import type { ColorId, ItemStyle, WidthId } from "../model/types";

const KEY = "pdf-canvas.itemStyle";

/** Excalidraw's defaults, with a smaller font for notes on PDF pages. */
export const DEFAULT_STYLE: ItemStyle = {
  color: "black",
  fill: null,
  fillStyle: "solid",
  width: "medium",
  strokeStyle: "solid",
  roughness: 1,
  edges: "round",
  opacity: 100,
  fontFamily: "hand",
  fontSize: "s",
  textAlign: "left",
};

export interface HighlighterStyle {
  color: ColorId;
  width: WidthId;
}

const DEFAULT_HIGHLIGHTER: HighlighterStyle = { color: "yellow", width: "medium" };

interface Stored {
  style: ItemStyle;
  highlighter: HighlighterStyle;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stored>;
    return {
      style: { ...DEFAULT_STYLE, ...raw.style },
      highlighter: { ...DEFAULT_HIGHLIGHTER, ...raw.highlighter },
    };
  } catch {
    return { style: DEFAULT_STYLE, highlighter: DEFAULT_HIGHLIGHTER };
  }
}

/** Style for new items (shared by all drawing tools) and the highlighter's
 *  own color and width, remembered between sessions. */
export function useItemStyle() {
  const [stored, setStored] = useState(load);

  const save = (next: Stored) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not critical.
    }
    return next;
  };

  const setStyle = useCallback((patch: Partial<ItemStyle>) => {
    setStored((prev) => save({ ...prev, style: { ...prev.style, ...patch } }));
  }, []);

  const setHighlighter = useCallback((patch: Partial<HighlighterStyle>) => {
    setStored((prev) => save({ ...prev, highlighter: { ...prev.highlighter, ...patch } }));
  }, []);

  return { style: stored.style, highlighter: stored.highlighter, setStyle, setHighlighter };
}
