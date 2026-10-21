import type { ReactNode } from "react";
import { COLOR_IDS, HIGHLIGHT_COLORS, PEN_COLORS, WIDTH_IDS, WIDTHS } from "../canvas/strokes";
import type { ColorId, ToolId, WidthId } from "../model/types";
import type { ToolPrefs } from "../tools/Tool";
import { EraserIcon, HandIcon, HighlighterIcon, PenIcon, TextCursorIcon } from "./icons";

interface Props {
  tool: ToolId;
  onTool(tool: ToolId): void;
  prefs: ToolPrefs;
  onPrefs(patch: Partial<ToolPrefs>): void;
}

const TOOLS: { id: ToolId; label: string; key: string; icon: ReactNode }[] = [
  { id: "pan", label: "Mão", key: "H", icon: <HandIcon /> },
  { id: "select", label: "Selecionar texto", key: "V", icon: <TextCursorIcon /> },
  { id: "pen", label: "Caneta", key: "P", icon: <PenIcon /> },
  { id: "highlighter", label: "Marca-texto", key: "M", icon: <HighlighterIcon /> },
  { id: "eraser", label: "Borracha", key: "E", icon: <EraserIcon /> },
];

const COLOR_NAMES: Record<ColorId, string> = {
  black: "Preto",
  red: "Vermelho",
  blue: "Azul",
  green: "Verde",
  yellow: "Amarelo",
  pink: "Rosa",
};

const WIDTH_NAMES: Record<WidthId, string> = { thin: "Fino", medium: "Médio", thick: "Grosso" };

export function Toolbar({ tool, onTool, prefs, onPrefs }: Props) {
  const styled = tool === "pen" || tool === "highlighter";
  const palette = tool === "highlighter" ? HIGHLIGHT_COLORS : PEN_COLORS;

  return (
    <div className="toolbar" role="toolbar" aria-label="Ferramentas">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className="tool-btn"
          aria-pressed={tool === t.id}
          aria-label={t.label}
          data-tip={`${t.label} (${t.key})`}
          onClick={() => onTool(t.id)}
        >
          {t.icon}
        </button>
      ))}
      {styled && (
        <>
          <span className="divider" />
          <div className="swatches" role="radiogroup" aria-label="Cor">
            {COLOR_IDS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={prefs.color === c}
                aria-label={COLOR_NAMES[c]}
                className="swatch"
                style={{ "--swatch": palette[c] } as React.CSSProperties}
                onClick={() => onPrefs({ color: c })}
              />
            ))}
          </div>
          <span className="divider" />
          <div className="widths" role="radiogroup" aria-label="Espessura">
            {WIDTH_IDS.map((w) => (
              <button
                key={w}
                role="radio"
                aria-checked={prefs.width === w}
                aria-label={WIDTH_NAMES[w]}
                data-tip={WIDTH_NAMES[w]}
                className="width-btn"
                onClick={() => onPrefs({ width: w })}
              >
                <span
                  className="width-dot"
                  style={{ "--dot": `${widthDot(tool as "pen" | "highlighter", w)}px` } as React.CSSProperties}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Dot size for the width buttons, scaled to fit an 18px slot. */
function widthDot(tool: "pen" | "highlighter", w: WidthId): number {
  const max = WIDTHS[tool].thick;
  return Math.max(3, Math.round((WIDTHS[tool][w] / max) * 14));
}
