/** Sliding window in-memory: maksimal `limit` kejadian per `windowMs` per kunci. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Catat satu kejadian; false bila melewati batas. */
  allow(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Apakah masih di bawah batas (tanpa mencatat). */
  canProceed(key: string): boolean {
    const t = this.now();
    return (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs).length < this.limit;
  }

  /** Catat kejadian tanpa memeriksa batas (mis. percobaan gagal). */
  record(key: string): void {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs);
    recent.push(t);
    this.hits.set(key, recent);
  }

  /** Hapus kunci yang sudah kedaluwarsa agar memori tidak membengkak. */
  prune(): void {
    const t = this.now();
    for (const [key, list] of this.hits) {
      const recent = list.filter((h) => t - h < this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}
