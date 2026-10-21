import type { Annotation, HistoryEntry } from "./types";

export interface StoreChange {
  added: Annotation[];
  removed: Annotation[];
}

type Listener = (change: StoreChange) => void;

/**
 * In-memory annotations with unlimited undo/redo for the session.
 *
 * Each annotation object keeps a sequence number (its z-order) for life, so
 * undoing a deletion puts it back at the same depth.
 */
export class AnnotationStore {
  private items = new Map<string, Annotation>();
  private seq = new WeakMap<Annotation, number>();
  private nextSeq = 0;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<Listener>();

  constructor(initial: Annotation[] = []) {
    for (const a of initial) this.insert(a);
  }

  get size(): number {
    return this.items.size;
  }

  get(id: string): Annotation | undefined {
    return this.items.get(id);
  }

  /** All annotations in z-order (bottom first). */
  all(): Annotation[] {
    return this.sorted([...this.items.values()]);
  }

  sorted(list: Annotation[]): Annotation[] {
    return list.sort((a, b) => (this.seq.get(a) ?? 0) - (this.seq.get(b) ?? 0));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(items: Annotation[]): void {
    if (!items.length) return;
    this.record({ kind: "add", items });
    this.apply(items, []);
  }

  remove(items: Annotation[]): void {
    const present = items.filter((a) => this.items.get(a.id) === a);
    if (!present.length) return;
    this.record({ kind: "remove", items: present });
    this.apply([], present);
  }

  /** Replaces annotations with new versions (same ids). */
  update(before: Annotation[], after: Annotation[]): void {
    if (!after.length) return;
    this.record({ kind: "update", before, after });
    after.forEach((a, i) => this.seq.set(a, this.seq.get(before[i]) ?? this.nextSeq++));
    this.apply(after, before);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.redoStack.push(entry);
    if (entry.kind === "add") this.apply([], entry.items);
    else if (entry.kind === "remove") this.apply(entry.items, []);
    else this.apply(entry.before, entry.after);
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    if (entry.kind === "add") this.apply(entry.items, []);
    else if (entry.kind === "remove") this.apply([], entry.items);
    else this.apply(entry.after, entry.before);
  }

  private record(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack.length = 0;
  }

  private insert(a: Annotation): void {
    if (!this.seq.has(a)) this.seq.set(a, this.nextSeq++);
    this.items.set(a.id, a);
  }

  private apply(added: Annotation[], removed: Annotation[]): void {
    for (const a of removed) this.items.delete(a.id);
    for (const a of added) this.insert(a);
    const change = { added, removed };
    for (const fn of this.listeners) fn(change);
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
