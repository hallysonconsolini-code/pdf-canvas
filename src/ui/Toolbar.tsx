import { useEffect, useRef, useState, type ReactNode } from "react";
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

const POSITION_KEY = "pdf-canvas.toolbarPosition";

function loadPosition(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null");
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

function savePosition(p: { x: number; y: number } | null): void {
  try {
    if (p) localStorage.setItem(POSITION_KEY, JSON.stringify(p));
    else localStorage.removeItem(POSITION_KEY);
  } catch {
    // Not critical.
  }
}

export function Toolbar({ tool, onTool, locked, onLock }: Props) {
  // null = default spot (top centre). Drag the grip to move; double-click resets.
  const [pos, setPos] = useState(loadPosition);
  const bar = useRef<HTMLDivElement>(null);

  // Keep it on screen when the window shrinks.
  useEffect(() => {
    const clampToWindow = () => setPos((p) => (p ? clamp(p, bar.current) : p));
    window.addEventListener("resize", clampToWindow);
    return () => window.removeEventListener("resize", clampToWindow);
  }, []);

  const onGripDown = (e: React.PointerEvent) => {
    const el = bar.current;
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setPos(clamp({ x: ev.clientX - dx, y: ev.clientY - dy }, el));
    const up = (ev: PointerEvent) => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      setPos(savePositionAndReturn(clamp({ x: ev.clientX - dx, y: ev.clientY - dy }, el)));
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  };

  const style = pos ? { left: pos.x, top: pos.y, transform: "none" } : undefined;

  return (
    <div className="toolbar" role="toolbar" aria-label="Ferramentas" ref={bar} style={style}>
      <span
        className="toolbar-grip"
        aria-hidden="true"
        data-tip="Arraste para mover · duplo clique volta ao topo"
        onPointerDown={onGripDown}
        onDoubleClick={() => {
          savePosition(null);
          setPos(null);
        }}
      />
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

function clamp(p: { x: number; y: number }, el: HTMLElement | null): { x: number; y: number } {
  const w = el?.offsetWidth ?? 0;
  const h = el?.offsetHeight ?? 0;
  return {
    x: Math.max(8, Math.min(window.innerWidth - w - 8, p.x)),
    y: Math.max(8, Math.min(window.innerHeight - h - 8, p.y)),
  };
}

function savePositionAndReturn(p: { x: number; y: number }) {
  savePosition(p);
  return p;
}
