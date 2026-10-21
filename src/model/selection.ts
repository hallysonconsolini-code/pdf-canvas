/** Ids of the annotations selected with the lasso tool. */
export class Selection {
  private ids = new Set<string>();
  private listeners = new Set<() => void>();

  get size(): number {
    return this.ids.size;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  values(): string[] {
    return [...this.ids];
  }

  set(ids: Iterable<string>): void {
    const next = new Set(ids);
    if (next.size === this.ids.size && [...next].every((id) => this.ids.has(id))) return;
    this.ids = next;
    for (const fn of this.listeners) fn();
  }

  clear(): void {
    this.set([]);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
