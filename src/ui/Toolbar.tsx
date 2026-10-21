import type { ReactNode } from "react";
import type { ToolId } from "../model/types";
import {
  ArrowIcon,
  DiamondIcon,
  EllipseIcon,
  EraserIcon,
  HandIcon,
  HighlighterIcon,
  LassoIcon,
  LineIcon,
  LockIcon,
  PenIcon,
  RectIcon,
  TextCursorIcon,
  TextIcon,
} from "./icons";

interface Props {
  tool: ToolId;
  onTool(tool: ToolId): void;
  locked: boolean;
  onLock(): void;
}

export interface ToolButton {
  id: ToolId;
  label: string;
  key: string;
  /** Number shortcut shown in the corner, as in Excalidraw. */
  digit?: string;
  icon: ReactNode;
  /** Other tools that light up this button. */
  alsoActive?: ToolId[];
}

export const TOOL_GROUPS: ToolButton[][] = [
  [
    { id: "pan", label: "Mão", key: "H", icon: <HandIcon /> },
    { id: "lasso", label: "Seleção", key: "V", digit: "1", icon: <LassoIcon /> },
  ],
  [
    { id: "rect", label: "Retângulo", key: "R", digit: "2", icon: <RectIcon /> },
    { id: "diamond", label: "Losango", key: "D", digit: "3", icon: <DiamondIcon /> },
    { id: "ellipse", label: "Elipse", key: "O", digit: "4", icon: <EllipseIcon /> },
    { id: "arrow", label: "Seta", key: "A", digit: "5", icon: <ArrowIcon /> },
    { id: "line", label: "Linha", key: "L", digit: "6", icon: <LineIcon /> },
    { id: "pen", label: "Desenhar", key: "P", digit: "7", icon: <PenIcon /> },
    { id: "text", label: "Texto", key: "T", digit: "8", icon: <TextIcon /> },
  ],
  [
    { id: "highlighter", label: "Marca-texto", key: "M", digit: "9", icon: <HighlighterIcon />, alsoActive: ["text-highlight"] },
    { id: "eraser", label: "Borracha", key: "E", digit: "0", icon: <EraserIcon /> },
    { id: "select", label: "Selecionar texto do PDF", key: "S", icon: <TextCursorIcon /> },
  ],
];

export function Toolbar({ tool, onTool, locked, onLock }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Ferramentas">
      <button
        className="tool-btn lock-btn"
        aria-pressed={locked}
        aria-label="Manter ferramenta ativa"
        data-tip={`Manter ferramenta ativa após desenhar (Q)`}
        onClick={onLock}
      >
        <LockIcon locked={locked} />
      </button>
      {TOOL_GROUPS.map((group, i) => (
        <div className="tool-group" key={i}>
          <span className="divider" />
          {group.map((t) => (
            <button
              key={t.id}
              className="tool-btn"
              aria-pressed={tool === t.id || !!t.alsoActive?.includes(tool)}
              aria-label={t.label}
              data-tip={`${t.label} — ${t.key}${t.digit ? ` ou ${t.digit}` : ""}`}
              onClick={() => onTool(t.id)}
            >
              {t.icon}
              {t.digit && <span className="tool-digit">{t.digit}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
