import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveState } from "./persistence/autosave";
import { addRecent, loadRecents, removeRecent, type RecentFile } from "./persistence/recents";
import { loadPdf } from "./pdf/loader";
import {
  initialFile,
  isTauri,
  onMenu,
  onOpenFile,
  onPdfDrop,
  onQuitRequested,
  pickPdf,
  readPdfBytes,
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
  const [recents, setRecents] = useState<RecentFile[]>(loadRecents);
  const sessionRef = useRef<Session | null>(null);
  const busy = useRef(false);

  const openPath = useCallback(async (path: string) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    const started = performance.now();
    try {
      const data = await readPdfBytes(path);
      const doc = await loadPdf(path, data);
      const previous = sessionRef.current;
      finishTyping();
      if (previous) await closeSession(previous);
      const next = await openSession(doc, setSave);
      sessionRef.current = next;
      setSave({ kind: "idle" });
      setSession(next);
      setWindowTitle(doc.fileName);
      if (isTauri) setRecents(addRecent(path, doc.fileName));
      console.info(`opened ${doc.fileName}: ${doc.pages.length} pages in ${Math.round(performance.now() - started)} ms`);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      const text = String((err as Error)?.message ?? err);
      if (text.includes("os error 2")) {
        setRecents(removeRecent(path));
        showError(`Arquivo não encontrado. Ele pode ter sido movido ou apagado.\n\n${path}`);
      } else {
        showError(
          name === "PasswordException"
            ? "Este PDF é protegido por senha. Ainda não há suporte para PDFs com senha."
            : `Não foi possível abrir o PDF.\n\n${text}`,
        );
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const openDialog = useCallback(async () => {
    const path = await pickPdf();
    if (path) await openPath(path);
  }, [openPath]);

  /** Saves and closes the current PDF, back to the start screen. */
  const closeCurrent = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || busy.current) return;
    finishTyping();
    sessionRef.current = null;
    setSession(null);
    setSave({ kind: "idle" });
    setWindowTitle("PDF Canvas");
    await closeSession(current);
    setRecents(loadRecents());
  }, []);

  const runMenu = useCallback(
    (action: MenuAction) => {
      if (action === "open") {
        openDialog();
        return;
      }
      if (action === "close") {
        closeCurrent();
        return;
      }
      // Document actions are handled by the open document's view.
      if (action === "export" || action === "thumbnails" || action === "zoom-in" || action === "zoom-out" || action === "fit-width") {
        window.dispatchEvent(new CustomEvent("pdf-canvas:menu", { detail: action }));
        return;
      }
      // Inside a text field, these edit the text instead.
      if (isTyping(document.activeElement)) {
        document.execCommand(action === "select-all" ? "selectAll" : action);
        return;
      }
      if (action === "select-all") {
        window.dispatchEvent(new CustomEvent("pdf-canvas:select-all"));
        return;
      }
      const store = sessionRef.current?.store;
      if (action === "undo") store?.undo();
      else store?.redo();
    },
    [openDialog, closeCurrent],
  );

  useEffect(() => onPdfDrop({ hover: setDropping, drop: openPath }), [openPath]);
  useEffect(() => onMenu(runMenu), [runMenu]);
  useEffect(() => onOpenFile(openPath), [openPath]);
  useEffect(
    () =>
      onQuitRequested(async () => {
        finishTyping();
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
      else if (key === "e" && e.shiftKey) runMenu("export");
      else if (key === "b") runMenu("thumbnails");
      else if (key === "=" || key === "+") runMenu("zoom-in");
      else if (key === "-") runMenu("zoom-out");
      else if (key === "0") runMenu("fit-width");
      else if (key === "z") runMenu(e.shiftKey ? "redo" : "undo");
      else if (key === "a" && !isTyping(e.target)) runMenu("select-all");
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
        <StartScreen
          loading={loading}
          recents={recents}
          onOpen={openDialog}
          onOpenRecent={openPath}
          onForget={(path) => setRecents(removeRecent(path))}
        />
      )}
      {session && loading && <div className="toast">Abrindo…</div>}
      {dropping && <div className="drop-overlay">Solte o PDF para abrir</div>}
    </>
  );
}

/** Commits a text note being edited (its editor saves on blur). */
function finishTyping(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.classList.contains("note-editor")) active.blur();
}
