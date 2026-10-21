import { useEffect, useRef, useState } from "react";

interface Props {
  onPage: number;
  scratch: number;
  busy: boolean;
  onExport(includeScratch: boolean): void;
  onCancel(): void;
}

/** Export options: what to do with annotations outside the pages. */
export function ExportDialog({ onPage, scratch, busy, onExport, onCancel }: Props) {
  const [includeScratch, setIncludeScratch] = useState(true);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !busy) onCancel();
        }}
      >
        <h2 id="export-title">Exportar PDF anotado</h2>
        <p className="muted">
          Cria um novo PDF com as anotações desenhadas nas páginas. O arquivo original não é alterado.
        </p>
        <p>
          {onPage} {onPage === 1 ? "anotação" : "anotações"} nas páginas
          {scratch > 0 && (
            <>
              {" "}
              · {scratch} fora das páginas
            </>
          )}
        </p>
        {scratch > 0 && (
          <label className="check">
            <input type="checkbox" checked={includeScratch} onChange={(e) => setIncludeScratch(e.target.checked)} />
            Incluir o que está fora das páginas numa página extra de rascunhos no final
          </label>
        )}
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button ref={confirm} className="btn-primary" onClick={() => onExport(includeScratch)} disabled={busy}>
            {busy ? "Exportando…" : "Exportar…"}
          </button>
        </div>
      </div>
    </div>
  );
}
