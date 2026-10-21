import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "./persistence/autosave";
import { loadPdf } from "./pdf/loader";
import {
  initialFile,
  isTauri,
  onMenu,
  onPdfDrop,
  onQuitRequested,
  pickPdf,
  readFileBytes,
  setWindowTitle,
  showError,
  type MenuAction,
} from "./platform/tauri";
import { closeSession, openSession, type Session } from "./session";
import { DocumentView, isTyping } from "./ui/DocumentView";
import { StartScreen } from "./ui/StartScreen";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [loading, setLoading] = useState(false);
  const [dropping, setDropping] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const busy = useRef(false);

  const openPath = useCallback(async (path: string) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const started = performance.now();
    try {
      const data = isTauri ? await readFileBytes(path) : await fetchDevFile(path);
      const doc = await loadPdf(path, data);
      const previous = sessionRef.current;
      if (previous) await closeSession(previous);
      const next = await openSession(doc, setSave);
      sessionRef.current = next;
      setSave({ kind: "idle" });
      setSession(next);
      setWindowTitle(doc.fileName);
      console.info(`opened ${doc.fileName}: ${doc.pages.length} pages in ${Math.round(performance.now() - started)} ms`);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      showError(
        name === "PasswordException"
          ? "Este PDF é protegido por senha. Ainda não há suporte para PDFs com senha."
          : `Não foi possível abrir o PDF.\n\n${String((err as Error)?.message ?? err)}`,
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const openDialog = useCallback(async () => {
    const path = await pickPdf();
    if (path) await openPath(path);
  }, [openPath]);

  const runMenu = useCallback(
    (action: MenuAction) => {
      if (action === "open") {
        openDialog();
        return;
      }
      // Inside a text field, undo/redo edit the text instead.
      if (isTyping(document.activeElement)) {
        document.execCommand(action);
        return;
      }
      const store = sessionRef.current?.store;
      if (action === "undo") store?.undo();
      else store?.redo();
    },
    [openDialog],
  );

  useEffect(() => onPdfDrop({ hover: setDropping, drop: openPath }), [openPath]);
  useEffect(() => onMenu(runMenu), [runMenu]);
  useEffect(
    () =>
      onQuitRequested(async () => {
        await sessionRef.current?.autosave.flush();
      }),
    [],
  );

  // File given at launch. Browser-only dev mode: http://localhost:1420/?pdf=/dev-samples/file.pdf
  useEffect(() => {
    const devPdf = !isTauri && import.meta.env.DEV && new URLSearchParams(location.search).get("pdf");
    if (devPdf) openPath(devPdf);
    else
      initialFile().then((path) => {
        if (path) openPath(path);
      });
  }, [openPath]);

  // In Tauri these shortcuts come from the native menu; in a plain browser
  // (dev mode) handle them here.
  useEffect(() => {
    if (isTauri) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "o") runMenu("open");
      else if (key === "z") runMenu(e.shiftKey ? "redo" : "undo");
      else return;
      e.preventDefault();
    };
    const onUnload = () => {
      sessionRef.current?.autosave.flush();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [runMenu]);

  return (
    <>
      {session ? (
        <DocumentView key={session.doc.path + session.doc.fingerprint} session={session} save={save} />
      ) : (
        <StartScreen loading={loading} onOpen={openDialog} />
      )}
      {session && loading && <div className="toast">Abrindo…</div>}
      {dropping && <div className="drop-overlay">Solte o PDF para abrir</div>}
    </>
  );
}

async function fetchDevFile(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
