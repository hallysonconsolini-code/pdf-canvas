import type { CSSProperties, ReactNode } from "react";
import { NOTE_FONT_SIZES } from "../canvas/geometry";
import { COLOR_IDS, HIGHLIGHT_COLORS, PEN_COLORS, WIDTH_IDS, WIDTHS } from "../canvas/strokes";
import type { ColorId, ToolId, WidthId } from "../model/types";
import type { ToolPrefs } from "../tools/Tool";
import {
  ArrowIcon,
  EllipseIcon,
  EraserIcon,
  HandIcon,
  HighlighterIcon,
  LassoIcon,
  PenIcon,
  RectIcon,
  TextCursorIcon,
  TextIcon,
} from "./icons";

interface Props {
  tool: ToolId;
  onTool(tool: ToolId): void;
  prefs: ToolPrefs;
  onPrefs(patch: Partial<ToolPrefs>): void;
}

interface ToolButton {
  id: ToolId;
  label: string;
  key: string;
  icon: ReactNode;
  /** Other tools that light up this button. */
  alsoActive?: ToolId[];
}

const GROUPS: ToolButton[][] = [
  [
    { id: "pan", label: "Mão", key: "H", icon: <HandIcon /> },
    { id: "lasso", label: "Seleção", key: "V", icon: <LassoIcon /> },
    { id: "select", label: "Selecionar texto", key: "S", icon: <TextCursorIcon /> },
  ],
  [
    { id: "pen", label: "Caneta", key: "P", icon: <PenIcon /> },
    { id: "highlighter", label: "Marca-texto", key: "M", icon: <HighlighterIcon />, alsoActive: ["text-highlight"] },
    { id: "eraser", label: "Borracha", key: "E", icon: <EraserIcon /> },
    { id: "text", label: "Texto", key: "T", icon: <TextIcon /> },
  ],
  [
    { id: "arrow", label: "Seta", key: "A", icon: <ArrowIcon /> },
    { id: "rect", label: "Retângulo", key: "R", icon: <RectIcon /> },
    { id: "ellipse", label: "Elipse", key: "O", icon: <EllipseIcon /> },
  ],
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
const SIZE_NAMES: Record<WidthId, string> = { thin: "Pequeno", medium: "Médio", thick: "Grande" };

/** Tools with a color palette, and whether they also pick a width. */
const STYLED: Partial<Record<ToolId, "width" | "size" | "none">> = {
  pen: "width",
  highlighter: "width",
  "text-highlight": "none",
  text: "size",
  arrow: "width",
  rect: "width",
  ellipse: "width",
};

export function Toolbar({ tool, onTool, prefs, onPrefs }: Props) {
  const styled = STYLED[tool];
  const highlighting = tool === "highlighter" || tool === "text-highlight";
  const palette = highlighting ? HIGHLIGHT_COLORS : PEN_COLORS;

  const hasOptions = highlighting || !!styled;

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Ferramentas">
        {GROUPS.map((group, i) => (
          <div className="tool-group" key={i}>
            {i > 0 && <span className="divider" />}
            {group.map((t) => (
              <button
                key={t.id}
                className="tool-btn"
                aria-pressed={tool === t.id || !!t.alsoActive?.includes(tool)}
                aria-label={t.label}
                data-tip={`${t.label} (${t.key})`}
                onClick={() => onTool(t.id)}
              >
                {t.icon}
              </button>
            ))}
          </div>
        ))}
      </div>

      {hasOptions && (
        <div className="toolbar toolbar-options" role="toolbar" aria-label="Opções da ferramenta">
          {highlighting && (
            <>
              <div className="segmented" role="radiogroup" aria-label="Modo do marca-texto">
                <button
                  role="radio"
                  aria-checked={tool === "highlighter"}
                  data-tip="Traço livre (M)"
                  onClick={() => onTool("highlighter")}
                >
                  Livre
                </button>
                <button
                  role="radio"
                  aria-checked={tool === "text-highlight"}
                  data-tip="Selecionar o texto (⇧M)"
                  onClick={() => onTool("text-highlight")}
                >
                  No texto
                </button>
              </div>
            </>
          )}

          {styled && (
            <>
              {highlighting && <span className="divider" />}
              <div className="swatches" role="radiogroup" aria-label="Cor">
                {COLOR_IDS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={prefs.color === c}
                    aria-label={COLOR_NAMES[c]}
                    className="swatch"
                    style={{ "--swatch": palette[c] } as CSSProperties}
                    onClick={() => onPrefs({ color: c })}
                  />
                ))}
              </div>
            </>
          )}

          {(styled === "width" || styled === "size") && (
            <>
              <span className="divider" />
              <div
                className="widths"
                role="radiogroup"
                aria-label={styled === "size" ? "Tamanho do texto" : "Espessura"}
              >
                {WIDTH_IDS.map((w) => {
                  const name = styled === "size" ? SIZE_NAMES[w] : WIDTH_NAMES[w];
                  return (
                    <button
                      key={w}
                      role="radio"
                      aria-checked={prefs.width === w}
                      aria-label={name}
                      data-tip={name}
                      className="width-btn"
                      onClick={() => onPrefs({ width: w })}
                    >
                      {styled === "size" ? (
                        <span className="size-glyph" style={{ fontSize: `${8 + NOTE_FONT_SIZES[w] * 0.45}px` }}>
                          A
                        </span>
                      ) : (
                        <span className="width-dot" style={{ "--dot": `${widthDot(tool, w)}px` } as CSSProperties} />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Dot size for the width buttons, scaled to fit an 18px slot. */
function widthDot(tool: ToolId, w: WidthId): number {
  const set = tool === "highlighter" ? WIDTHS.highlighter : WIDTHS.pen;
  return Math.max(3, Math.round((set[w] / set.thick) * 14));
}
