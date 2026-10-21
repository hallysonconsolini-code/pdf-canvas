import { useEffect, useState } from "react";
import type { SaveState } from "../persistence/autosave";
import { MinusIcon, PlusIcon } from "./icons";

interface Props {
  page: number;
  pageCount: number;
  zoom: number;
  save: SaveState;
  onGoToPage(index: number): void;
  onZoomBy(factor: number): void;
  onFitWidth(): void;
}

export function StatusBar({ page, pageCount, zoom, save, onGoToPage, onZoomBy, onFitWidth }: Props) {
  const [draft, setDraft] = useState(String(page + 1));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(page + 1));
  }, [page, editing]);

  const commit = () => {
    const n = Number.parseInt(draft, 10);
    if (Number.isFinite(n)) onGoToPage(Math.min(pageCount, Math.max(1, n)) - 1);
    setEditing(false);
  };

  return (
    <div className="statusbar">
      <SaveIndicator state={save} />
      <label className="page-field">
        <span className="visually-hidden">Página</span>
        <input
          inputMode="numeric"
          value={draft}
          size={Math.max(2, String(pageCount).length)}
          onFocus={(e) => {
            setEditing(true);
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(String(page + 1));
              setEditing(false);
              e.currentTarget.blur();
            }
          }}
        />
        <span className="muted">/ {pageCount}</span>
      </label>
      <span className="divider" />
      <button className="icon-btn" aria-label="Diminuir zoom" data-tip="Diminuir zoom (⌘−)" onClick={() => onZoomBy(1 / 1.25)}>
        <MinusIcon />
      </button>
      <button className="zoom-value" data-tip="Ajustar à largura (⌘0)" onClick={onFitWidth}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="icon-btn" aria-label="Aumentar zoom" data-tip="Aumentar zoom (⌘+)" onClick={() => onZoomBy(1.25)}>
        <PlusIcon />
      </button>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "idle") return null;
  const label =
    state.kind === "pending" ? "Salvando…" : state.kind === "saved" ? "Salvo" : "Erro ao salvar";
  const tip =
    state.kind === "saved"
      ? state.location === "pdf"
        ? "Anotações salvas ao lado do PDF"
        : "A pasta do PDF não permite gravação: anotações salvas nos dados do app"
      : state.kind === "error"
        ? state.message
        : undefined;
  return (
    <>
      <span className={`save-state save-${state.kind}`} data-tip={tip} role="status">
        {label}
      </span>
      <span className="divider" />
    </>
  );
}
