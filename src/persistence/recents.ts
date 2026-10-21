/** Recently opened PDFs, newest first (kept in the app's local storage). */
export interface RecentFile {
  path: string;
  fileName: string;
  openedAt: number;
}

const KEY = "pdf-canvas.recents";
const MAX = 15;

export function loadRecents(): RecentFile[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as RecentFile[];
    return Array.isArray(list) ? list.filter((r) => typeof r.path === "string") : [];
  } catch {
    return [];
  }
}

function store(list: RecentFile[]): RecentFile[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Not critical.
  }
  return list;
}

export function addRecent(path: string, fileName: string): RecentFile[] {
  const rest = loadRecents().filter((r) => r.path !== path);
  return store([{ path, fileName, openedAt: Date.now() }, ...rest].slice(0, MAX));
}

export function removeRecent(path: string): RecentFile[] {
  return store(loadRecents().filter((r) => r.path !== path));
}
