import { useCallback, useState } from "react";
import type { ToolId } from "../model/types";
import type { ToolPrefs } from "../tools/Tool";

const KEY = "pdf-canvas.toolPrefs";

const DEFAULTS: Partial<Record<ToolId, ToolPrefs>> = {
  pen: { color: "black", width: "medium" },
  highlighter: { color: "yellow", width: "medium" },
  "text-highlight": { color: "yellow", width: "medium" },
  text: { color: "black", width: "medium" },
  arrow: { color: "red", width: "medium" },
  rect: { color: "red", width: "medium" },
  ellipse: { color: "red", width: "medium" },
};
const FALLBACK: ToolPrefs = { color: "black", width: "medium" };

function load(): Partial<Record<ToolId, ToolPrefs>> {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Last color and width per tool, remembered between sessions. */
export function useToolPrefs() {
  const [all, setAll] = useState(load);

  const get = useCallback((tool: ToolId): ToolPrefs => all[tool] ?? DEFAULTS[tool] ?? FALLBACK, [all]);

  const set = useCallback((tool: ToolId, patch: Partial<ToolPrefs>) => {
    setAll((prev) => {
      const next = { ...prev, [tool]: { ...(prev[tool] ?? DEFAULTS[tool] ?? FALLBACK), ...patch } };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not critical.
      }
      return next;
    });
  }, []);

  return { get, set };
}
