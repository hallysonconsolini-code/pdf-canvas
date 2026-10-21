import type { ReactNode } from "react";
import { HandIcon, TextCursorIcon } from "./icons";

export type Phase1Tool = "pan" | "select";

interface Props {
  tool: Phase1Tool;
  onTool(tool: Phase1Tool): void;
}

const TOOLS: { id: Phase1Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: "pan", label: "Mão", key: "H", icon: <HandIcon /> },
  { id: "select", label: "Selecionar texto", key: "V", icon: <TextCursorIcon /> },
];

export function Toolbar({ tool, onTool }: Props) {
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
    </div>
  );
}
