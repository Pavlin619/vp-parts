/**
 * One value held in process memory for `ttlMs`. Concurrent reads share a load in
 * flight, and a failed load is forgotten so the next read retries.
 */
export class ExpiringMemo<T> {
  private entry: { value: Promise<T>; expiresAt: number } | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(load: () => Promise<T>): Promise<T> {
    if (this.entry && this.entry.expiresAt > this.now()) {
      return this.entry.value;
    }

    const entry = { value: load(), expiresAt: this.now() + this.ttlMs };
    this.entry = entry;

    entry.value.catch(() => {
      if (this.entry === entry) {
        this.entry = null;
      }
    });

    return entry.value;
  }
}
