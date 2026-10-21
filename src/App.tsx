import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdf, type PdfDocument } from "./pdf/loader";
import { initialFile, isTauri, onPdfDrop, pickPdf, readFileBytes, setWindowTitle, showError } from "./platform/tauri";
import { DocumentView } from "./ui/DocumentView";
import { StartScreen } from "./ui/StartScreen";

export default function App() {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropping, setDropping] = useState(false);
  const docRef = useRef<PdfDocument | null>(null);

  const openPath = useCallback(async (path: string) => {
    setLoading(true);
    const started = performance.now();
    try {
      const data = isTauri ? await readFileBytes(path) : await fetchDevFile(path);
      const next = await loadPdf(path, data);
      const previous = docRef.current;
      docRef.current = next;
      setDoc(next);
      setWindowTitle(next.fileName);
      previous?.destroy();
      console.info(`opened ${next.fileName}: ${next.pages.length} pages in ${Math.round(performance.now() - started)} ms`);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      showError(
        name === "PasswordException"
          ? "Este PDF é protegido por senha. Ainda não há suporte para PDFs com senha."
          : `Não foi possível abrir o PDF.\n\n${String((err as Error)?.message ?? err)}`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const openDialog = useCallback(async () => {
    const path = await pickPdf();
    if (path) await openPath(path);
  }, [openPath]);

  useEffect(() => onPdfDrop({ hover: setDropping, drop: openPath }), [openPath]);

  // File given at launch. Browser-only dev mode: http://localhost:1420/?pdf=/dev-samples/file.pdf
  useEffect(() => {
    const devPdf = !isTauri && import.meta.env.DEV && new URLSearchParams(location.search).get("pdf");
    if (devPdf) openPath(devPdf);
    else initialFile().then((path) => {
      if (path) openPath(path);
    });
  }, [openPath]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDialog]);

  return (
    <>
      {doc ? <DocumentView key={doc.path + doc.fingerprint} doc={doc} /> : <StartScreen loading={loading} onOpen={openDialog} />}
      {doc && loading && <div className="toast">Abrindo…</div>}
      {dropping && <div className="drop-overlay">Solte o PDF para abrir</div>}
    </>
  );
}

async function fetchDevFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
