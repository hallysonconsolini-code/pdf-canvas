import { FileIcon } from "./icons";

interface Props {
  loading: boolean;
  onOpen(): void;
}

export function StartScreen({ loading, onOpen }: Props) {
  return (
    <main className="start">
      <div className="start-card">
        <FileIcon />
        <h1>PDF Canvas</h1>
        <p>{loading ? "Abrindo…" : "Arraste um PDF para a janela ou abra um arquivo."}</p>
        <button className="btn-primary" onClick={onOpen} disabled={loading}>
          Abrir PDF <kbd>⌘O</kbd>
        </button>
      </div>
    </main>
  );
}
