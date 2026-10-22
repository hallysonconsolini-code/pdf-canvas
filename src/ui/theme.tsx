import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../platform/tauri";
import { MoonIcon, SunIcon, SystemIcon } from "./icons";

export type ThemeMode = "system" | "light" | "dark";

interface ThemePrefs {
  mode: ThemeMode;
  /** In the dark theme, darken PDF pages too (inverted, Excalidraw style). */
  darkPages: boolean;
}

interface ThemeState extends ThemePrefs {
  /** What is on screen now. */
  dark: boolean;
  setMode(mode: ThemeMode): void;
  setDarkPages(on: boolean): void;
  /** Switches between light and dark (⌥⇧D). */
  toggle(): void;
}

const KEY = "pdf-canvas.theme";
const ThemeContext = createContext<ThemeState | null>(null);

function load(): ThemePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ThemePrefs>;
    return {
      mode: raw.mode === "light" || raw.mode === "dark" ? raw.mode : "system",
      darkPages: raw.darkPages !== false,
    };
  } catch {
    return { mode: "system", darkPages: true };
  }
}

const systemQuery = () => matchMedia("(prefers-color-scheme: dark)");

/** Light/dark theme: follows macOS or a fixed choice, saved between sessions. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(load);
  const [systemDark, setSystemDark] = useState(() => systemQuery().matches);

  useEffect(() => {
    const q = systemQuery();
    const onChange = () => setSystemDark(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const dark = prefs.mode === "dark" || (prefs.mode === "system" && systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    if (dark && prefs.darkPages) root.dataset.darkPages = "true";
    else delete root.dataset.darkPages;
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Not critical.
    }
  }, [dark, prefs]);

  // Title bar and native dialogs follow the chosen theme.
  useEffect(() => {
    if (!isTauri) return;
    getCurrentWindow()
      .setTheme(prefs.mode === "system" ? null : prefs.mode)
      .catch(() => {});
  }, [prefs.mode]);

  const setMode = useCallback((mode: ThemeMode) => setPrefs((p) => ({ ...p, mode })), []);
  const setDarkPages = useCallback((darkPages: boolean) => setPrefs((p) => ({ ...p, darkPages })), []);
  const toggle = useCallback(() => setPrefs((p) => ({ ...p, mode: dark ? "light" : "dark" })), [dark]);

  const value = useMemo(() => ({ ...prefs, dark, setMode, setDarkPages, toggle }), [prefs, dark, setMode, setDarkPages, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme outside ThemeProvider");
  return theme;
}

const MODES: { mode: ThemeMode; label: string; icon: ReactNode }[] = [
  { mode: "system", label: "Sistema", icon: <SystemIcon /> },
  { mode: "light", label: "Claro", icon: <SunIcon /> },
  { mode: "dark", label: "Escuro", icon: <MoonIcon /> },
];

/** Button with a small popover: theme choice and dark pages. */
export function ThemeMenu({ placement = "up" }: { placement?: "up" | "down" }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const current = MODES.find((m) => m.mode === theme.mode)!;
  return (
    <div className="theme-menu" ref={box}>
      <button
        className="icon-btn"
        aria-label="Aparência"
        aria-expanded={open}
        data-tip={open ? undefined : "Aparência (⌥⇧D alterna claro/escuro)"}
        onClick={() => setOpen((o) => !o)}
      >
        {theme.dark ? <MoonIcon /> : current.mode === "system" ? <SystemIcon /> : <SunIcon />}
      </button>
      {open && (
        <div className={`theme-popover theme-popover-${placement}`} role="dialog" aria-label="Aparência">
          <div className="segmented" role="radiogroup" aria-label="Tema">
            {MODES.map((m) => (
              <button key={m.mode} role="radio" aria-checked={theme.mode === m.mode} onClick={() => theme.setMode(m.mode)}>
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
          <label className={`check${theme.dark ? "" : " is-disabled"}`}>
            <input
              type="checkbox"
              checked={theme.darkPages}
              disabled={!theme.dark}
              onChange={(e) => theme.setDarkPages(e.target.checked)}
            />
            Escurecer as páginas do PDF no tema escuro
          </label>
        </div>
      )}
    </div>
  );
}
