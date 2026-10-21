import type { RecentFile } from "../persistence/recents";
import { FileIcon } from "./icons";

interface Props {
  loading: boolean;
  recents: RecentFile[];
  onOpen(): void;
  onOpenRecent(path: string): void;
  onForget(path: string): void;
}

export function StartScreen({ loading, recents, onOpen, onOpenRecent, onForget }: Props) {
  return (
    <main className="start">
      <div className="start-card">
        <FileIcon />
        <h1>PDF Canvas</h1>
        <p>{loading ? "Abrindo…" : "Arraste um PDF para a janela ou abra um arquivo."}</p>
        <button className="btn-primary" onClick={onOpen} disabled={loading}>
          Abrir PDF <kbd>⌘O</kbd>
        </button>

        {recents.length > 0 && (
          <section className="recents" aria-label="Recentes">
            <h2>Recentes</h2>
            <ul>
              {recents.map((r) => (
                <li key={r.path}>
                  <button className="recent" onClick={() => onOpenRecent(r.path)} disabled={loading} title={r.path}>
                    <span className="recent-name">{r.fileName}</span>
                    <span className="recent-meta">
                      {folderOf(r.path)} · {formatDate(r.openedAt)}
                    </span>
                  </button>
                  <button className="recent-forget" aria-label={`Remover ${r.fileName} dos recentes`} data-tip="Remover dos recentes" onClick={() => onForget(r.path)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function folderOf(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? parts[parts.length - 2] : "";
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
